import { corsHeaders, getDb, jsonResponse } from './common.js';
import { checkRateLimit, ensureIdempotent, logAbuse, maybeCleanup } from './rate-limit.js';
import { fetchGroupDetails } from './steam.js';

async function searchGroupsD1(db, criteria) {
  const searchType = criteria.searchType || 'all';
  const searchTerm = (criteria.searchTerm || '').trim();
  const exactMatch = criteria.exactMatch || false;
  const unicodeFilter = criteria.unicodeFilter || 'all';
  const membersMin = criteria.membersMin ?? 1;
  const membersMax = criteria.membersMax ?? 100000;
  const yearMin = criteria.yearMin ?? 2007;
  const yearMax = criteria.yearMax ?? 2026;
  const maxResults = exactMatch ? 10000 : 50;

  if (!searchTerm) return [];

  const termLower = searchTerm.toLowerCase();
  let sql, params;

  if (exactMatch) {
    const conditions = [];
    if (searchType === 'name') {
      conditions.push('LOWER(g.name) = ?');
      params = [termLower];
    } else if (searchType === 'url') {
      conditions.push('LOWER(g.url) = ?');
      params = [termLower];
    } else if (searchType === 'tag') {
      conditions.push('LOWER(g.tag) = ?');
      params = [termLower];
    } else {
      conditions.push('(LOWER(g.name) = ? OR LOWER(g.url) = ? OR LOWER(g.tag) = ?)');
      params = [termLower, termLower, termLower];
    }

    sql = `SELECT g.* FROM groups g WHERE ${conditions.join(' AND ')}`;
    params.push(membersMin, membersMax, yearMin, yearMax, maxResults);
    sql += ` AND (g.member_count IS NULL OR (g.member_count >= ? AND g.member_count <= ?))`;
    sql += ` AND (g.founding_year IS NULL OR (g.founding_year >= ? AND g.founding_year <= ?))`;
    sql += ` ORDER BY g.name COLLATE NOCASE LIMIT ?`;
  } else {
    const ftsToken = termLower.replace(/[^a-z0-9\s]/g, ' ').trim();
    const useFTS = ftsToken.length >= 2 && /^[a-z0-9\s]+$/.test(ftsToken);

    if (useFTS) {
      const ftsQuery = ftsToken.split(/\s+/).map(w => `"${w}"*`).join(' ');
      const fieldFilter = searchType === 'name' ? '{name}'
        : searchType === 'url' ? '{url}'
        : searchType === 'tag' ? '{tag}'
        : '';

      const ftsMatch = fieldFilter ? `${fieldFilter} : ${ftsQuery}` : ftsQuery;

      sql = `SELECT g.* FROM groups_fts fts
             JOIN groups g ON g.rowid = fts.rowid
             WHERE groups_fts MATCH ?
             AND (g.member_count IS NULL OR (g.member_count >= ? AND g.member_count <= ?))
             AND (g.founding_year IS NULL OR (g.founding_year >= ? AND g.founding_year <= ?))
             ORDER BY CASE WHEN LOWER(g.name) = ? OR LOWER(g.url) = ? OR LOWER(g.tag) = ? THEN 0 ELSE 1 END,
                      g.name COLLATE NOCASE
             LIMIT ?`;
      params = [ftsMatch, membersMin, membersMax, yearMin, yearMax, termLower, termLower, termLower, maxResults];
    } else {
      const likeTerm = `%${termLower}%`;
      const conditions = [];
      if (searchType === 'name') {
        conditions.push('LOWER(g.name) LIKE ?');
        params = [likeTerm];
      } else if (searchType === 'url') {
        conditions.push('LOWER(g.url) LIKE ?');
        params = [likeTerm];
      } else if (searchType === 'tag') {
        conditions.push('LOWER(g.tag) LIKE ?');
        params = [likeTerm];
      } else {
        conditions.push('(LOWER(g.name) LIKE ? OR LOWER(g.url) LIKE ? OR LOWER(g.tag) LIKE ?)');
        params = [likeTerm, likeTerm, likeTerm];
      }

      sql = `SELECT g.* FROM groups g WHERE ${conditions.join(' AND ')}`;
      params.push(membersMin, membersMax, yearMin, yearMax, termLower, termLower, termLower, maxResults);
      sql += ` AND (g.member_count IS NULL OR (g.member_count >= ? AND g.member_count <= ?))`;
      sql += ` AND (g.founding_year IS NULL OR (g.founding_year >= ? AND g.founding_year <= ?))`;
      sql += ` ORDER BY CASE WHEN LOWER(g.name) = ? OR LOWER(g.url) = ? OR LOWER(g.tag) = ? THEN 0 ELSE 1 END,
                        g.name COLLATE NOCASE
               LIMIT ?`;
    }
  }

  const { results } = await db.prepare(sql).bind(...params).all();

  const unicodeRe = /[^\x00-\x7F]/;
  return (results || []).map(row => {
    const hasUnicode = unicodeRe.test((row.name || '') + (row.tag || ''));
    const n = (row.name || '').toLowerCase();
    const u = (row.url || '').toLowerCase();
    const t = (row.tag || '').toLowerCase();
    const isExact = termLower === n || termLower === u || termLower === t;
    return {
      gid: row.gid,
      name: row.name,
      url: row.url,
      tag: row.tag,
      member_count: row.member_count,
      founding_year: row.founding_year,
      search_match_type: isExact ? 'full' : 'partial',
      has_unicode: hasUnicode
    };
  }).filter(row => {
    if (unicodeFilter === 'unicode') return row.has_unicode;
    if (unicodeFilter === 'non-unicode') return !row.has_unicode;
    return true;
  });
}

export async function handleSearch(request, env, user) {
  if (!user) {
    return jsonResponse({ error: 'login required to search groups', code: 'AUTH_REQUIRED' }, 401);
  }

  await maybeCleanup(env);

  const rate = await checkRateLimit(env, user.sub, 'groups_search', 30);
  if (!rate.allowed) {
    await logAbuse(env, {
      userId: user.sub,
      ip: request.headers.get('CF-Connecting-IP'),
      endpoint: 'groups_search',
      reason: 'rate_limit'
    });
    return jsonResponse({ error: 'Too many requests', code: 'RATE_LIMITED' }, 429);
  }

  const requestId = request.headers.get('X-Request-Id') || null;
  const idemOk = await ensureIdempotent(env, user.sub, 'groups_search', requestId);
  if (!idemOk) {
    await logAbuse(env, {
      userId: user.sub,
      ip: request.headers.get('CF-Connecting-IP'),
      endpoint: 'groups_search',
      reason: 'replay'
    });
    return jsonResponse({ error: 'duplicate request', code: 'IDEMPOTENT_REPLAY' }, 409);
  }

  try {
    if (!getDb(env)) {
      return jsonResponse({ error: 'database not configured', groups: [], total: 0 }, 200);
    }
    let criteria;
    try {
      criteria = await request.json();
    } catch {
      return jsonResponse({ error: 'invalid json body', groups: [], total: 0 }, 200);
    }
    if (!criteria || typeof criteria !== 'object') {
      return jsonResponse({ error: 'missing search criteria', groups: [], total: 0 }, 200);
    }

    let filteredResults = await searchGroupsD1(getDb(env), criteria);
    if (filteredResults.length > 0) {
      const BATCH_SIZE = 10;
      const FREE_TIER_CAP = 49;
      const toEnrich = filteredResults.slice(0, FREE_TIER_CAP);

      const detailResults = new Array(filteredResults.length).fill(null);
      for (let i = 0; i < toEnrich.length; i += BATCH_SIZE) {
        const batch = toEnrich.slice(i, i + BATCH_SIZE);
        const batchDetails = await Promise.all(
          batch.map(g => fetchGroupDetails(g.url).catch(() => null))
        );
        batchDetails.forEach((d, j) => { detailResults[i + j] = d; });

        if (i + BATCH_SIZE < toEnrich.length) {
          await new Promise(r => setTimeout(r, 80));
        }
      }

      filteredResults = filteredResults.map((g, idx) => {
        const details = detailResults[idx];
        if (!details) return g;

        const enriched = { ...g };
        if (details.name) enriched.name = details.name;
        if (details.members != null && !Number.isNaN(details.members)) enriched.member_count = details.members;
        if (details.avatar) enriched.avatar = details.avatar;
        if (details.founded && enriched.founding_year == null) {
          const yearMatch = String(details.founded).match(/(20\d{2}|19\d{2})/);
          if (yearMatch) {
            const yearVal = parseInt(yearMatch[1], 10);
            if (!Number.isNaN(yearVal)) enriched.founding_year = yearVal;
          }
        }
        return enriched;
      });
    }

    const limitMessage = !criteria.exactMatch && filteredResults.length >= 50
      ? 'showing first 50 results (enable exact match for unlimited results)'
      : null;
    return jsonResponse({
      groups: filteredResults,
      total: filteredResults.length,
      criteria: criteria,
      limitMessage
    });
  } catch (error) {
    return jsonResponse({ error: String(error && error.message || error), groups: [], total: 0 }, 200);
  }
}

export async function handleStatus(env) {
  try {
    if (!getDb(env)) {
      return jsonResponse({ source: 'd1', status: 'not_configured', error: 'D1 binding missing' });
    }
    const countResult = await getDb(env).prepare('SELECT COUNT(*) as cnt FROM groups').first();
    const ftsResult = await getDb(env).prepare("SELECT COUNT(*) as cnt FROM groups_fts WHERE groups_fts MATCH 'test'").first().catch(() => ({ cnt: -1 }));
    return jsonResponse({
      source: 'd1',
      total_groups: countResult?.cnt ?? 0,
      fts_working: ftsResult?.cnt >= 0,
      status: (countResult?.cnt ?? 0) > 0 ? 'healthy' : 'empty'
    });
  } catch (error) {
    return jsonResponse({ error: String(error?.message || error), status: 'error' }, 500);
  }
}

export async function handleUnicodeGroup(gid, env) {
  if (!getDb(env)) {
    return new Response('database not configured', {
      status: 500,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', ...corsHeaders }
    });
  }
  try {
    const row = await getDb(env).prepare(
      'SELECT gid, name, url, tag FROM groups WHERE gid = ? LIMIT 1'
    ).bind(gid).first();
    if (!row) {
      return new Response('Group not found', {
        status: 404,
        headers: { 'Content-Type': 'text/plain; charset=utf-8', ...corsHeaders }
      });
    }
    const lines = [
      `gid: ${row.gid ?? ''}`,
      `name: ${row.name ?? ''}`,
      `url: ${row.url ?? ''}`,
      `tag: ${row.tag ?? ''}`
    ].join('\n');
    return new Response(lines, {
      status: 200,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', ...corsHeaders }
    });
  } catch (e) {
    return new Response(String(e && e.message || e), {
      status: 500,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', ...corsHeaders }
    });
  }
}
