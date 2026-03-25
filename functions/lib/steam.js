export async function resolveVanityUrlWithApi(apiKey, vanity) {
  const url = `https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/?key=${encodeURIComponent(apiKey)}&vanityurl=${encodeURIComponent(vanity)}`;
  const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (response.status === 429) throw new Error('RATE_LIMITED');
  if (!response.ok) throw new Error('STEAM_ERROR');
  const data = await response.json();
  const res = data && data.response;
  if (!res) throw new Error('STEAM_ERROR');
  if (res.success === 1 && res.steamid) return String(res.steamid);
  if (res.success === 42) return null;
  throw new Error('STEAM_ERROR');
}

export async function fetchSteamPage(url) {
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });
    return response.ok ? await response.text() : null;
  } catch {
    return null;
  }
}

export async function resolveSteamId(input) {
  input = input.trim();

  if (/^\d{17}$/.test(input)) return input;

  if (input.startsWith('[U:1:') && input.endsWith(']')) {
    const steam3Id = input.slice(5, -1);
    return String(parseInt(steam3Id) + 76561197960265728);
  }

  if (input.startsWith('STEAM_')) {
    const parts = input.split(':');
    if (parts.length === 3) {
      const y = parseInt(parts[1]);
      const z = parseInt(parts[2]);
      return String(z * 2 + y + 76561197960265728);
    }
  }

  const vanityUrl = `https://steamcommunity.com/id/${input}/`;
  try {
    const response = await fetch(vanityUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });
    if (response.status === 429) throw new Error('RATE_LIMITED');
    if (response.status === 404) return null;
    if (!response.ok) throw new Error('STEAM_ERROR');
    const html = await response.text();
    const match = html.match(/"steamid"\s*:\s*"(\d{17})"/) || html.match(/"steamid":"(\d{17})"/);
    if (match) return match[1];
    const miniprofileMatch = html.match(/data-miniprofile="(\d{17})"/);
    if (miniprofileMatch) return miniprofileMatch[1];
    const gProfileDataMatch = html.match(/g_rgProfileData\s*=\s*\{[^}]*"steamid"\s*:\s*"(\d{17})"/) || html.match(/g_rgProfileData[^;]*steamid["\s:]+(\d{17})/);
    if (gProfileDataMatch) return gProfileDataMatch[1];
    const notFound = html.length > 2000 && /The specified profile could not be found\.?/i.test(html);
    if (notFound) return null;
    throw new Error('AMBIGUOUS');
  } catch (e) {
    if (e && (e.message === 'RATE_LIMITED' || e.message === 'STEAM_ERROR' || e.message === 'AMBIGUOUS')) throw e;
    throw new Error('STEAM_ERROR');
  }
}

function convertSteam64ToSteam32(steam64) {
  if (!steam64) return '0';
  try {
    return String(BigInt(steam64) - BigInt('76561197960265728'));
  } catch {
    return '0';
  }
}

function convertSteam64ToSteam3(steam64) {
  if (!steam64) return '[U:1:0]';
  try {
    return `[U:1:${BigInt(steam64) - BigInt('76561197960265728')}]`;
  } catch {
    return '[U:1:0]';
  }
}

export async function parseSteamProfile(html, steamId64, env) {
  if (!html || !steamId64) {
    return {
      steam_id64: steamId64 || '',
      steam32_id: '0',
      steam3_id: '[U:1:0]',
      vanity_id: steamId64 || '',
      profile: {},
      groups: [],
      mutual_info: {}
    };
  }

  const profileData = {
    steam_id64: steamId64,
    steam32_id: convertSteam64ToSteam32(steamId64),
    steam3_id: convertSteam64ToSteam3(steamId64),
    vanity_id: null,
    profile: {},
    groups: [],
    mutual_info: {}
  };

  const steamIdMatch = html.match(/"steamid"\s*:\s*"(\d{17})"/);
  if (steamIdMatch) {
    profileData.steam_id64 = steamIdMatch[1];
    profileData.steam32_id = convertSteam64ToSteam32(steamIdMatch[1]);
    profileData.steam3_id = convertSteam64ToSteam3(steamIdMatch[1]);
  }

  const vanityMatch = html.match(/steamcommunity\.com\/id\/([^"\/\s]+)/);
  profileData.vanity_id = vanityMatch ? vanityMatch[1] : profileData.steam_id64;

  const usernameMatch = html.match(/"personaname"\s*:\s*"([^"]+)"/) ||
                        html.match(/actual_persona_name[^>]*>([^<]+)</) ||
                        html.match(/persona_name[^>]*>([^<]+)</);
  if (usernameMatch) {
    profileData.profile.username = usernameMatch[1]
      .replace(/\\u([0-9a-fA-F]{4})/g, (_, code) => String.fromCharCode(parseInt(code, 16)))
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'");
  }

  let avatarUrl = null;
  if (env && env.STEAM_API_KEY) {
    try {
      const apiResp = await fetch(
        `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${env.STEAM_API_KEY}&steamids=${profileData.steam_id64}`,
        { headers: { 'User-Agent': 'Mozilla/5.0' } }
      );
      if (apiResp.ok) {
        const apiData = await apiResp.json();
        const player = apiData?.response?.players?.[0];
        if (player?.avatarfull) avatarUrl = player.avatarfull;
      }
    } catch (_) {}
  }

  if (!avatarUrl) {
    const jsonAvatarMatch = html.match(/"avatarfull"\s*:\s*"(https:[^"]+_full\.jpg)"/);
    if (jsonAvatarMatch) avatarUrl = jsonAvatarMatch[1].replace(/\\\//g, '/');
  }
  if (!avatarUrl) {
    const srcsetMatch = html.match(/<source[^>]+srcset=["'](https:\/\/avatars[^"']+_full\.jpg)["']/);
    if (srcsetMatch) avatarUrl = srcsetMatch[1];
  }
  if (!avatarUrl) {
    const imgMatch = html.match(/src=["'](https:\/\/avatars\.fastly\.steamstatic\.com\/[^"']+_full\.jpg)["']/);
    if (imgMatch) avatarUrl = imgMatch[1];
  }
  if (avatarUrl && !/shared\.fastly\.steamstatic|community_assets/i.test(avatarUrl)) {
    profileData.profile.avatar = avatarUrl;
  }

  const levelMatch = html.match(/friendPlayerLevelNum[^>]*>(\d+)</) ||
                     html.match(/"level"\s*:\s*(\d+)/);
  if (levelMatch) profileData.profile.level = parseInt(levelMatch[1]);

  const profileFlagMatch = html.match(/profile_flag[^>]*>[\s\S]*?<\/img>[\s]*([^<\n]+?)(?:\s*<|$|\n)/);
  if (profileFlagMatch) {
    const loc = profileFlagMatch[1].trim();
    if (loc.length >= 2 && loc.length <= 50 && !/^\d+$/.test(loc) && !loc.includes('comment')) {
      profileData.profile.location = loc;
    }
  }
  if (!profileData.profile.location) {
    const locCountryMatch = html.match(/"loccountrycode"\s*:\s*"([^"]+)"/);
    if (locCountryMatch) profileData.profile.location = locCountryMatch[1];
  }

  const joinDateMatch = html.match(/Member since[^<]*?(\w+\s+\d+,?\s*\d{4})/i) ||
                        html.match(/badge_description[^>]*>[^M]*Member since\s+([^<.]+)/i);
  if (joinDateMatch) profileData.profile.join_date = joinDateMatch[1].trim();

  const friendsLabelMatch = html.match(/count_link_label[^>]*>\s*Friends[\s\S]{0,300}?profile_count_link_total[^>]*>\s*(\d+)/i);
  if (friendsLabelMatch) profileData.profile.friends_count = parseInt(friendsLabelMatch[1], 10);
  if (profileData.profile.friends_count == null) {
    const friendsHrefMatch = html.match(/href="[^"]*\/friends\/?[^"]*"[\s\S]{0,600}?profile_count_link_total[^>]*>\s*(\d+)/i);
    if (friendsHrefMatch) profileData.profile.friends_count = parseInt(friendsHrefMatch[1], 10);
  }

  return profileData;
}

export function parseGroupsPage(html) {
  const groups = [];
  const seen = new Set();
  const blockStart = /(?:group_block|groupBlock|href="https?:\/\/steamcommunity\.com\/groups\/)/gi;
  const blocks = [];
  let m;
  while ((m = blockStart.exec(html)) !== null) blocks.push({ start: m.index });

  for (let i = 0; i < blocks.length; i++) {
    const start = blocks[i].start;
    const end = i + 1 < blocks.length ? blocks[i + 1].start : html.length;
    const chunk = html.slice(start, Math.min(end, start + 1200));
    const linkMatch = chunk.match(/href="https?:\/\/steamcommunity\.com\/groups\/([^"\/]+)(?:\/[^"]*)?"/i);
    if (!linkMatch) continue;
    const link = linkMatch[1].replace(/\/$/, '');
    if (link.includes('members') || seen.has(link)) continue;
    seen.add(link);
    const imgMatch = chunk.match(/<img[^>]+src="([^"]+)"/);
    const avatar = imgMatch ? imgMatch[1] : '';
    const nameMatch = chunk.match(/groupTitle[^>]*>([^<]+)</i) ||
                      chunk.match(/<a[^>]+href="[^"]*\/groups\/[^"]*"[^>]*>([^<]{2,80})</i);
    let name = (nameMatch ? nameMatch[1] : link).trim().replace(/&amp;/g, '&').replace(/&#39;/g, "'");
    if (name === 'members') name = link;
    const membersMatch = chunk.match(/(\d[\d,]*)\s*Members/);
    const members = membersMatch ? parseInt(membersMatch[1].replace(/,/g, ''), 10) : null;
    groups.push({ link, avatar, name: name || link, members: isNaN(members) ? null : members });
  }
  if (groups.length > 0) return groups;

  let match;
  const oneBlockRe = /href="https?:\/\/steamcommunity\.com\/groups\/([^"\/]+)"[^>]*>[\s\S]*?<img[^>]+src="([^"]+)"[\s\S]*?groupTitle[^>]*>([^<]+)<\/[^>]+>[\s\S]*?(\d[\d,]*)\s*Members/gi;
  while ((match = oneBlockRe.exec(html)) !== null) {
    const link = match[1].replace(/\/$/, '');
    if (link.includes('members') || seen.has(link)) continue;
    const name = (match[3] || link).trim().replace(/&amp;/g, '&').replace(/&#39;/g, "'");
    const members = match[4] ? parseInt(match[4].replace(/,/g, ''), 10) : null;
    groups.push({ link, avatar: match[2], name: name || link, members: isNaN(members) ? null : members });
  }
  return groups;
}

export async function fetchGroupDetails(groupLink) {
  try {
    const htmlUrl = `https://steamcommunity.com/groups/${groupLink}`;
    const htmlText = await fetchSteamPage(htmlUrl);
    if (!htmlText) return null;

    let name = groupLink;
    let members = null;
    let founded = null;
    let avatar = null;

    const ogMatch = htmlText.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
    if (ogMatch) avatar = ogMatch[1];
    else {
      const imgMatch = htmlText.match(/class=["']groupAvatar[^"']*["'][^>]*src=["']([^"']+)["']/i);
      if (imgMatch) avatar = imgMatch[1];
    }

    const foundedLabelMatch = htmlText.match(/class="label"[^>]*>\s*Founded\s*<\/div>\s*<div[^>]*class="data"[^>]*>\s*([^<]+?)\s*<\/div>/i);
    if (foundedLabelMatch) founded = foundedLabelMatch[1].trim();
    else {
      const foundedTextMatch =
        htmlText.match(/Founded[^<]{0,80}([A-Za-z]+\s+\d{1,2},?\s*\d{4})/i) ||
        htmlText.match(/Founded[^<]{0,80}(\d{1,2}\s+[A-Za-z]+\s*,?\s*\d{4})/i);
      if (foundedTextMatch) founded = foundedTextMatch[1].trim();
    }

    const htmlNameMatch =
      htmlText.match(/<span class="profile_group_name"[^>]*>([^<]+)<\/span>/) ||
      htmlText.match(/<h1 class="grouppage_header_name"[^>]*>([^<]+)<\/h1>/) ||
      htmlText.match(/<title>Steam Community :: Group :: ([^<]+)<\/title>/);
    if (htmlNameMatch) {
      const parsed = htmlNameMatch[1]
        .replace(/Steam Community :: Group :: /g, '')
        .replace(/^[\s-]+|[\s-]+$/g, '')
        .trim();
      if (parsed && parsed !== 'Group') name = parsed;
    }

    const memberMatch =
      htmlText.match(/class="groupMemberStat[^"]*"[^>]*>[^<]*([\d,]+)\s*Members/i) ||
      htmlText.match(/groupMemberStat[^>]*>[^<]*([\d,]+)\s*Members/i) ||
      htmlText.match(/([\d,]+)\s*Members/i);
    if (memberMatch) members = parseInt(memberMatch[1].replace(/,/g, ''), 10);

    return { name: name || groupLink, members: isNaN(members) ? null : members, founded, avatar };
  } catch {
    return null;
  }
}

export function parseFriendsCount(html) {
  if (!html) return null;
  if (
    html.includes('profile_private_info') ||
    html.includes('This profile is private') ||
    html.includes('friendslist_private') ||
    html.includes('friends_private')
  ) return 'Private';

  const friendBlocks = html.match(/friend_block_v2/g);
  if (friendBlocks) return friendBlocks.length;
  const selectors = html.match(/selectable friend_block/g);
  if (selectors) return selectors.length;

  const countPatterns = [
    /Friends\s*\((\d+)\)/i,
    /friends_count[^>]*>(\d+)</i,
    /profile_friend_links[\s\S]*?(\d+)\s*Friends/i
  ];
  for (const pattern of countPatterns) {
    const match = html.match(pattern);
    if (match) return parseInt(match[1]);
  }
  if (html.includes('actual_persona_name') || html.includes('steamID64') || html.includes('profile_header')) {
    return 'Private';
  }
  return null;
}
