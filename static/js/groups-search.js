function searchGroups() {
    if (window.groupSearchManager) {
        window.groupSearchManager.searchGroups();
    }
}

function changeView(view) {
    if (window.groupSearchManager) {
        window.groupSearchManager.changeView(view);
    }
}

function openImageModal(src) {
    if (window.utils) { window.utils.openImageModal(src); }
}

function closeImageModal() {
    if (window.utils) { window.utils.closeImageModal(); }
}

function copySteamId(element) {
    if (window.utils) { window.utils.copySteamId(element); }
}

function toggleSettingsMenu() {
    if (window.settingsManager) { window.settingsManager.toggleSettingsMenu(); }
}

function clearCache() {
    if (window.settingsManager) { window.settingsManager.clearCache(); }
}

function doLogout() {
    if (window.settingsManager) { window.settingsManager.doLogout(); }
}

function clearAll() {
    if (window.settingsManager) { window.settingsManager.clearAll(); }
}

function clearGroupSearch() {
    const mainSearch = document.getElementById('main_search');
    const clearBtn = document.getElementById('clearGroupSearchBtn');
    const searchBtn = document.getElementById('searchBtn');

    if (mainSearch) { mainSearch.value = ''; mainSearch.focus(); }
    if (clearBtn) { clearBtn.classList.add('hidden'); }
    if (searchBtn) {
        searchBtn.disabled = true;
        searchBtn.classList.add('cursor-not-allowed');
        searchBtn.classList.remove('lookup-btn', 'hover:shadow-md');
    }

    const resultsElement = document.getElementById('results');
    const loadingElement = document.getElementById('loading');
    const loadingMessage = document.getElementById('loading-message');
    const disclaimer = document.getElementById('unicode_disclaimer_groups');

    if (resultsElement) resultsElement.classList.add('hidden');
    if (loadingElement) loadingElement.classList.remove('hidden');
    if (loadingMessage) loadingMessage.textContent = 'enter search criteria...';
    if (disclaimer) disclaimer.classList.add('hidden');
}

function hideGroupsUnicodeDisclaimer() {
    if (window.groupSearchManager) {
        window.groupSearchManager.hideGroupsUnicodeDisclaimer();
    }
}

class GroupSearchManager {
    constructor() {
        this.searchData = [];
        this.originalSearchData = [];
        this.currentView = 'grid-1';
        this.searchCache = new Map();
        this.init();
    }

    init() {
        this.bootstrapAccessGates();
        this.setupSliders();
        this.setupEventListeners();
        this.setupStickyHeader();
    }

    bootstrapAccessGates() {
        if (!window.authManager) return;

        window.authManager.onReady((user) => {
            const authGate = document.getElementById('authGate');
            const searchContainer = document.getElementById('searchContainer');

            if (!user) {
                if (authGate) authGate.classList.remove('hidden');
                if (searchContainer) searchContainer.classList.add('hidden');
                return;
            }

            if (authGate) authGate.classList.add('hidden');
            if (searchContainer) searchContainer.classList.remove('hidden');
        });
    }

    setupStickyHeader() {
        const stickyHeader = document.querySelector('.sticky-header');
        if (!stickyHeader) return;
        
        const thresholdAdd = 40;
        let isScrolled = false;
        let ticking = false;
        
        function update() {
            const y = window.scrollY;
            if (y > thresholdAdd && !isScrolled) {
                stickyHeader.classList.add('scrolled');
                isScrolled = true;
            } else if (y <= 0 && isScrolled) {
                stickyHeader.classList.remove('scrolled');
                isScrolled = false;
            }
            ticking = false;
        }
        
        function onScroll() {
            if (!ticking) {
                requestAnimationFrame(update);
                ticking = true;
            }
        }
        
        window.addEventListener('scroll', onScroll, { passive: true });
        update();
    }

    setupSliders() {
        const membersMin = document.getElementById('members_min');
        const membersMax = document.getElementById('members_max');
        const membersMinVal = document.getElementById('members_min_val');
        const membersMaxVal = document.getElementById('members_max_val');
        const sliderRange = document.getElementById('members_range');

        if (membersMin && membersMax && sliderRange) {
            const MEMBERS_SCALE = 100000;

            const fmtMembers = (val) => {
                if (val >= MEMBERS_SCALE) return '100k+';
                if (val >= 1000) return (val / 1000).toFixed(0) + 'k';
                return val.toString();
            };

            const updateMemberSliders = () => {
                let minVal = parseInt(membersMin.value, 10) || 0;
                let maxVal = parseInt(membersMax.value, 10);
                if (!Number.isFinite(maxVal)) maxVal = MEMBERS_SCALE;

                // prevent thumbs from crossing
                if (minVal > maxVal) {
                    if (membersMin === document.activeElement) {
                        maxVal = Math.min(minVal + 1000, MEMBERS_SCALE);
                        membersMax.value = maxVal;
                    } else {
                        minVal = Math.max(maxVal - 1000, 0);
                        membersMin.value = minVal;
                    }
                }

                if (membersMinVal) membersMinVal.textContent = fmtMembers(minVal);
                if (membersMaxVal) membersMaxVal.textContent = fmtMembers(maxVal);

                // linear fill: 0–100k maps directly to 0–100%
                const p1 = (minVal / MEMBERS_SCALE) * 100;
                const p2 = (maxVal / MEMBERS_SCALE) * 100;
                sliderRange.style.left = p1 + '%';
                sliderRange.style.width = (p2 - p1) + '%';
            };
            membersMin.addEventListener('input', () => { updateMemberSliders(); this.applyLiveFiltering(); });
            membersMax.addEventListener('input', () => { updateMemberSliders(); this.applyLiveFiltering(); });
            updateMemberSliders();
        }

        const yearMin = document.getElementById('year_min');
        const yearMax = document.getElementById('year_max');
        const yearMinVal = document.getElementById('year_min_val');
        const yearMaxVal = document.getElementById('year_max_val');
        const yearRange = document.getElementById('year_range');

        if (yearMin && yearMax && yearRange) {
            const YEAR_MIN = 2007;
            const YEAR_MAX = 2015;
            const updateYearSliders = () => {
                let minVal = parseInt(yearMin.value);
                let maxVal = parseInt(yearMax.value);
                
                if (minVal >= maxVal) {
                    if (yearMin === document.activeElement) {
                        maxVal = Math.min(minVal + 1, YEAR_MAX);
                        yearMax.value = maxVal;
                        if (maxVal === YEAR_MAX && minVal >= maxVal) {
                            minVal = Math.max(maxVal - 1, YEAR_MIN);
                            yearMin.value = minVal;
                        }
                    } else {
                        minVal = Math.max(maxVal - 1, YEAR_MIN);
                        yearMin.value = minVal;
                        if (minVal === YEAR_MIN && maxVal <= minVal) {
                            maxVal = Math.min(minVal + 1, YEAR_MAX);
                            yearMax.value = maxVal;
                        }
                    }
                }
                
                yearMinVal.textContent = minVal;
                yearMaxVal.textContent = maxVal;
                
                const range = YEAR_MAX - YEAR_MIN;
                const percent1 = ((minVal - YEAR_MIN) / range) * 100;
                const percent2 = ((maxVal - YEAR_MIN) / range) * 100;
                yearRange.style.left = percent1 + '%';
                yearRange.style.width = (percent2 - percent1) + '%';
            };

            yearMin.addEventListener('input', () => {
                updateYearSliders();
                this.applyLiveFiltering();
            });
            yearMax.addEventListener('input', () => {
                updateYearSliders();
                this.applyLiveFiltering();
            });

            updateYearSliders();
        }
        
        const searchTypeButtons = document.querySelectorAll('.search-type-btn');
        searchTypeButtons.forEach(button => {
            button.addEventListener('click', () => {
                searchTypeButtons.forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');
                this.applyLiveFiltering();
            });
        });

    }

    setupEventListeners() {
        const mainSearch = document.getElementById('main_search');
        const clearSearchBtn = document.getElementById('clearGroupSearchBtn');
        const searchBtn = document.getElementById('searchBtn');
                
        if (mainSearch) {
            mainSearch.addEventListener('input', (e) => {
                const hasValue = e.target.value.trim().length > 0;
                if (clearSearchBtn) {
                    clearSearchBtn.classList.toggle('hidden', !hasValue);
                }
                
                if (searchBtn) {
                    searchBtn.disabled = !hasValue;
                    if (hasValue) {
                        searchBtn.classList.remove('cursor-not-allowed');
                        searchBtn.classList.add('lookup-btn', 'hover:shadow-md');
                    } else {
                        searchBtn.classList.add('cursor-not-allowed');
                        searchBtn.classList.remove('lookup-btn', 'hover:shadow-md');
                    }
                }
                
            });
            
            mainSearch.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && !searchBtn.disabled) {
                    e.preventDefault();
                    this.searchGroups();
                }
            });
        }

        document.querySelectorAll('.view-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const view = btn.getAttribute('data-view');
                this.changeView(view);
            });
        });

        const exactMatchToggle = document.getElementById('exact_match');
        const unicodeFilterInput = document.getElementById('unicode_filter');
        
        if (exactMatchToggle) {
            exactMatchToggle.addEventListener('change', () => {
                this.applyLiveFiltering();
            });
        }
        
        if (unicodeFilterInput) {
            unicodeFilterInput.addEventListener('change', () => {
                this.applyLiveFiltering();
            });
        }

        document.querySelectorAll('.unicode-filter-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const value = btn.getAttribute('data-unicode-value') || 'all';
                const hidden = document.getElementById('unicode_filter');
                if (hidden) {
                    hidden.value = value;
                    hidden.dispatchEvent(new Event('change'));
                }
                btn.parentElement.querySelectorAll('.unicode-filter-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });

        this.setupFiltersModal();
    }

    setupFiltersModal() {
        const filtersBtn = document.getElementById('filtersBtn');
        const filtersDropdown = document.getElementById('filtersDropdown');
        const filtersChevron = document.getElementById('filtersChevron');
        const filtersCount = document.getElementById('filtersCount');
        const filtersContainer = document.querySelector('.filters-dropdown-container');

        if (!filtersBtn || !filtersDropdown) return;

        let isOpen = false;

        const toggleDropdown = () => {
            if (isOpen) {
                closeDropdown();
            } else {
                openDropdown();
            }
        };

        const openDropdown = () => {
            filtersDropdown.classList.remove('hidden');
            filtersBtn.classList.add('active');
            if (filtersContainer) filtersContainer.classList.add('active');
            if (filtersChevron) filtersChevron.classList.add('rotated');
            
            requestAnimationFrame(() => {
                filtersDropdown.classList.add('show');
            });
            
            isOpen = true;
        };

        const closeDropdown = () => {
            filtersDropdown.classList.remove('show');
            filtersBtn.classList.remove('active');
            if (filtersContainer) filtersContainer.classList.remove('active');
            if (filtersChevron) filtersChevron.classList.remove('rotated');
            
            setTimeout(() => {
                filtersDropdown.classList.add('hidden');
            }, 300);
            
            isOpen = false;
        };

        const updateFiltersCount = () => {
            let count = 0;
            
            const exactMatch = document.getElementById('exact_match');
            if (exactMatch && exactMatch.checked) {
                count++;
            }
            
            const unicodeFilter = document.getElementById('unicode_filter');
            if (unicodeFilter && unicodeFilter.value !== 'all') {
                count++;
            }

        const membersMin = document.getElementById('members_min');
        const membersMax = document.getElementById('members_max');
        if (membersMin && membersMax && (membersMin.value !== '0' || membersMax.value !== '100000')) count++;

        const yearMin = document.getElementById('year_min');
        const yearMax = document.getElementById('year_max');
        if (yearMin && yearMax) {
            if (yearMin.value !== '2007' || yearMax.value !== '2015') {
                count++;
            }
        }
            
            if (count > 0 && filtersCount) {
                filtersCount.textContent = count;
                filtersCount.classList.remove('hidden');
            } else if (filtersCount) {
                filtersCount.classList.add('hidden');
            }
        };

        filtersBtn.addEventListener('click', toggleDropdown);

        document.addEventListener('click', (e) => {
            if (isOpen && !filtersBtn.contains(e.target) && !filtersDropdown.contains(e.target)) {
                closeDropdown();
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && isOpen) {
                closeDropdown();
            }
        });

        const exactMatch = document.getElementById('exact_match');
        const unicodeFilter = document.getElementById('unicode_filter');
        const membersMin = document.getElementById('members_min');
        const membersMax = document.getElementById('members_max');
        const yearMin = document.getElementById('year_min');
        const yearMax = document.getElementById('year_max');
        
        if (exactMatch) {
            exactMatch.addEventListener('change', updateFiltersCount);
        }
        
        if (unicodeFilter) {
            unicodeFilter.addEventListener('change', updateFiltersCount);
        }

        if (membersMin) {
            membersMin.addEventListener('input', updateFiltersCount);
        }

        if (membersMax) {
            membersMax.addEventListener('input', updateFiltersCount);
        }

        if (yearMin) {
            yearMin.addEventListener('input', updateFiltersCount);
        }

        if (yearMax) {
            yearMax.addEventListener('input', updateFiltersCount);
        }

        updateFiltersCount();
    }

    formatNumber(num) {
        if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
        if (num >= 10000) return '10k+';
        if (num >= 1000) return (num / 1000).toFixed(0) + 'k';
        return num.toString();
    }

    parseSearchQuery(query) {
        const criteria = {
            searchType: 'all',
            searchTerm: query.trim()
        };

        if (query.startsWith('name:')) {
            criteria.searchType = 'name';
            criteria.searchTerm = query.slice(5).trim();
        } else if (query.startsWith('url:')) {
            criteria.searchType = 'url';
            criteria.searchTerm = query.slice(4).trim();
        } else if (query.startsWith('tag:')) {
            criteria.searchType = 'tag';
            criteria.searchTerm = query.slice(4).trim();
        }

        return criteria;
    }

    getSearchCriteria() {
        const mainSearch = document.getElementById('main_search')?.value || '';
        const parsedSearch = this.parseSearchQuery(mainSearch);

        const activeSearchTypeBtn = document.querySelector('.search-type-btn.active');
        const selectedSearchType = activeSearchTypeBtn ? activeSearchTypeBtn.dataset.type : 'all';

            const membersMinRaw = parseInt(document.getElementById('members_min')?.value, 10);
            const membersMaxRaw = parseInt(document.getElementById('members_max')?.value, 10);

            const criteria = {
                ...parsedSearch,
                searchType: selectedSearchType,
                membersMin: Number.isFinite(membersMinRaw) ? membersMinRaw : 0,
                membersMax: Number.isFinite(membersMaxRaw) ? membersMaxRaw : 100000,
                yearMin: parseInt(document.getElementById('year_min')?.value) || 2007,
                yearMax: parseInt(document.getElementById('year_max')?.value) || 2015,
                exactMatch: document.getElementById('exact_match')?.checked || false,
                unicodeFilter: document.getElementById('unicode_filter')?.value || 'all'
            };

        return criteria;
    }

    async searchGroups() {
        const criteria = this.getSearchCriteria();
        
        if (!criteria.searchTerm) {
            this.showError('Please enter a search term');
            return;
        }

        const cacheKey = JSON.stringify(criteria);

        if (this.searchCache.has(cacheKey)) {
            this.displayResults(this.searchCache.get(cacheKey));
            return;
        }

        // disable UI while searching (mirror profile search behaviour)
        const searchBtn = document.getElementById('searchBtn');
        const mainSearch = document.getElementById('main_search');
        if (searchBtn) {
            searchBtn.disabled = true;
            searchBtn.classList.add('cursor-not-allowed');
            searchBtn.classList.remove('lookup-btn', 'hover:shadow-md');
        }
        if (mainSearch) {
            mainSearch.disabled = true;
            mainSearch.classList.add('opacity-50', 'cursor-not-allowed');
        }

        // use same full loading experience as profile search (spinner + rotating messages)
        if (window.loadingManager) {
            window.loadingManager.showLoading();
        } else {
            this.showLoading('searching groups...');
        }
        
        try {
            const response = await fetch('/api/groups/search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(criteria)
            });

            let data;
            try {
                data = await response.json();
            } catch {
                data = { error: `HTTP ${response.status}: ${response.statusText}` };
            }

            if (data.code === 'AUTH_REQUIRED') {
                this.showAuthRequired();
                return;
            }
            if (data.error) {
                this.showError(data.error);
                return;
            }
            if (!response.ok) {
                this.showError(data.error || `HTTP ${response.status}`);
                return;
            }

            this.searchCache.set(cacheKey, data);

            // Pre-fetch all group images so they're cached before cards render.
            const imageUrls = (data.groups || []).map(g => g.avatar).filter(Boolean);
            if (imageUrls.length > 0) {
                await Promise.allSettled(imageUrls.map(url => new Promise(resolve => {
                    const img = new Image();
                    img.onload = img.onerror = resolve;
                    img.src = url;
                })));
            }

            this.displayResults(data);
            if (window.authManager && typeof window.authManager.refreshUser === 'function') window.authManager.refreshUser();

        } catch (error) {
            this.showError(error.message);
        } finally {
            if (window.loadingManager) {
                window.loadingManager.hideLoading();
            } else {
                this.hideLoading();
            }
            // re-enable UI after search completes
            const btn = document.getElementById('searchBtn');
            const input = document.getElementById('main_search');
            if (input) {
                input.disabled = false;
                input.classList.remove('opacity-50', 'cursor-not-allowed');
            }
            if (btn) {
                const hasValue = !!(input && input.value.trim().length > 0);
                btn.disabled = !hasValue;
                if (hasValue) {
                    btn.classList.remove('cursor-not-allowed');
                    btn.classList.add('lookup-btn', 'hover:shadow-md');
                } else {
                    btn.classList.add('cursor-not-allowed');
                    btn.classList.remove('lookup-btn', 'hover:shadow-md');
                }
            }
        }
    }

    displayResults(data) {
        this.originalSearchData = data.groups || [];
        this.searchData = [...this.originalSearchData];
        
        // Compute match_type (3x / 2x) based on how many fields exactly equal the search term.
        const criteria = data.criteria || {};
        const term = (criteria.searchTerm || '').toLowerCase();
        const searchType = criteria.searchType || 'all';
        if (term) {
            this.searchData = this.searchData.map(group => {
                const name = (group.name || '').toLowerCase();
                const url = (group.url || '').toLowerCase();
                const tag = (group.tag || '').toLowerCase();
                
                let eqName = false, eqUrl = false, eqTag = false;
                if (searchType === 'name') {
                    eqName = name === term;
                } else if (searchType === 'url') {
                    eqUrl = url === term;
                } else if (searchType === 'tag') {
                    eqTag = tag === term;
                } else {
                    eqName = name === term;
                    eqUrl = url === term;
                    eqTag = tag === term;
                }
                
                const count = (eqName ? 1 : 0) + (eqUrl ? 1 : 0) + (eqTag ? 1 : 0);
                let matchType = null;
                let score = 0;
                
                if (count === 3) {
                    matchType = 'full'; // 3x
                    score = 3;
                } else if (count === 2) {
                    if (eqName && eqUrl) matchType = 'name-url';
                    else if (eqName && eqTag) matchType = 'name-tag';
                    else if (eqUrl && eqTag) matchType = 'url-tag';
                    score = 2;
                } else if (count === 1) {
                    matchType = 'single';
                    score = 1;
                }
                
                return { ...group, match_type: matchType, match_score: score };
            });
        }
        
        const resultsElement = document.getElementById('results');
        const resultsCount = document.getElementById('results_count');
        const groupsContainer = document.getElementById('groups_container');
        
        if (!resultsElement || !resultsCount || !groupsContainer) return;
        
        const existingLimitMessages = resultsCount.parentNode.querySelectorAll('.text-amber-600.bg-amber-50');
        existingLimitMessages.forEach(msg => msg.remove());

        const hasUnicodeGroups = this.searchData.some(group => group.has_unicode);
        this.checkGroupsUnicodeDisclaimer(hasUnicodeGroups);

        resultsElement.classList.remove('hidden');
        
        const limitMessage = data.limitMessage;
        if (limitMessage) {
            const limitElement = document.createElement('div');
            limitElement.className = 'text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-2';
            limitElement.innerHTML = `
                <svg class="w-4 h-4 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                ${limitMessage}
            `;
            resultsCount.parentNode.appendChild(limitElement);
        }

        if (this.searchData.length === 0) {
            resultsCount.textContent = '0 groups found';
            
            groupsContainer.innerHTML = `
                <div class="col-span-full text-center py-12">
                    <svg class="w-16 h-16 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                    <h3 class="text-lg font-medium text-gray-900 mb-2">no groups found</h3>
                    <p class="text-gray-500">try adjusting your search criteria</p>
                </div>
            `;
            return;
        }

        this.searchData.sort((a, b) => {
            // 1) Higher match_score (3x > 2x > 1x > 0)
            const sa = a.match_score || 0;
            const sb = b.match_score || 0;
            if (sa !== sb) return sb - sa;

            // 2) search_match_type priority (gid/full/partial)
            const searchOrder = { 'gid': 0, 'full': 1, 'partial': 2 };
            const ta = searchOrder[a.search_match_type] ?? 3;
            const tb = searchOrder[b.search_match_type] ?? 3;
            if (ta !== tb) return ta - tb;

            // 3) Alphabetical by name
            return (a.name || '').localeCompare(b.name || '');
        });
        
        resultsCount.textContent = `${this.searchData.length} groups found`;
        
        this.updateResultsDisplay();
    }

    renderGroups() {
        const groupsContainer = document.getElementById('groups_container');
        if (!groupsContainer) return;

        this.searchData.forEach((group, index) => {
            const card = this.createGroupCard(group, index);
            groupsContainer.appendChild(card);
        });

        setTimeout(() => {
            this.setupScrollAnimations();
        }, 50);
    }

    createGroupCard(group, index) {
        const card = document.createElement('div');
        card.className = 'group-card';
        card.dataset.groupId = group.gid;
        
        const hasUnicode = group.has_unicode;
        if (hasUnicode) {
            card.setAttribute('data-unicoded', 'true');
        }

        const isListView = this.currentView === 'grid-1';
        const showAvatar = this.currentView !== 'grid-3';

        const avatarUrl = group.avatar || `https://cdn.cloudflare.steamstatic.com/steamcommunity/public/images/steamworks_docs/english/Capsule_616x353.png`;

        const badges = [];
        // Show match badges (3x, 2x) first so they appear at the very top of the badge area
        if (group.match_type) {
            if (group.match_type === 'full') {
                badges.push(`<span class="match-badge full">3x</span>`);
            } else if (group.match_type === 'name-url' || group.match_type === 'url-tag' || group.match_type === 'name-tag') {
                badges.push(`<span class="match-badge db">2x</span>`);
            }
        }
        if (hasUnicode) {
            badges.push('<span class="unicode-badge">unicoded</span>');
        }

        let unicodeButton = '';
        if (group.has_unicode) {
            unicodeButton = `<button onclick="window.open('/steam/groups/unicode/${group.gid}', '_blank')" class="unicode-view-btn">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
                view raw
            </button>`;
        }

        const memberDisplay = group.member_count != null
            ? Number(group.member_count).toLocaleString()
            : '—';
        const yearDisplay = group.founding_year != null
            ? String(group.founding_year)
            : '—';

        const details = [];
        details.push(`<div class="group-detail">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
            <span>${group.url}</span>
        </div>`);
        details.push(`<div class="group-detail group-detail-icon-only" title="members">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <span>${memberDisplay}</span>
        </div>`);
        details.push(`<div class="group-detail group-detail-icon-only" title="founded">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span>${yearDisplay}</span>
        </div>`);



        card.innerHTML = `
            <div class="flex ${isListView ? 'items-center' : 'flex-col'} gap-4">
                ${showAvatar ? `
                    <div class="avatar-container" onclick="window.utils.openImageModal('${avatarUrl}')">
                        <img src="${avatarUrl}" alt="${group.name}">
                        <svg class="view-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                    </div>
                ` : ''}
                
                <div class="flex-1 min-w-0">
                    <div class="group-header">
                        <div class="group-title">
                            <h3 class="group-name">${group.name}</h3>
                            ${group.tag ? `<div class="group-abbr">${group.tag}</div>` : ''}
                        </div>
                        <div class="badge-container">
                            ${badges.join('')}
                        </div>
                        <a href="https://steamcommunity.com/gid/${group.gid}" target="_blank" class="group-link">
                            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                        </a>
                    </div>
                    
                    <div class="group-details">
                        ${details.join('')}
                        ${unicodeButton}
                    </div>
                </div>
            </div>
        `;

        card.style.animationDelay = `${index * 20}ms`;
        
        return card;
    }

    // Live filter: all controls applied locally against originalSearchData — no new requests.
    applyLiveFiltering() {
        if (!this.originalSearchData.length) return;

        const unicodeFilter = document.getElementById('unicode_filter')?.value || 'all';
        const exactMatch = document.getElementById('exact_match')?.checked || false;

        const activeSearchTypeBtn = document.querySelector('.search-type-btn.active');
        const searchType = activeSearchTypeBtn ? activeSearchTypeBtn.dataset.type : 'all';

        const membersMinRaw = parseInt(document.getElementById('members_min')?.value, 10);
        const membersMaxRaw = parseInt(document.getElementById('members_max')?.value, 10);
        const membersMin = Number.isFinite(membersMinRaw) ? membersMinRaw : 0;
        // 100000 = "100k+" sentinel — treat as no upper bound
        const membersMax = Number.isFinite(membersMaxRaw) ? membersMaxRaw : 100000;
        const yearMin = parseInt(document.getElementById('year_min')?.value, 10) || 2007;
        const yearMax = parseInt(document.getElementById('year_max')?.value, 10) || 2015;

        const searchTerm = (this.searchCriteria?.searchTerm || '').toLowerCase().trim();

        let list = [...this.originalSearchData];

        // --- text / exact-match / search-type filter ---
        if (searchTerm) {
            list = list.filter(g => {
                const name = (g.name || '').toLowerCase();
                const url  = (g.url  || '').toLowerCase();
                const tag  = (g.tag  || '').toLowerCase();
                const test = exactMatch
                    ? (f) => f === searchTerm
                    : (f) => f.includes(searchTerm);
                if (searchType === 'name') return test(name);
                if (searchType === 'url')  return test(url);
                if (searchType === 'tag')  return test(tag);
                return test(name) || test(url) || test(tag);
            });
        }

        // --- unicode filter ---
        if (unicodeFilter === 'unicode') {
            list = list.filter(g => g.has_unicode);
        } else if (unicodeFilter === 'non-unicode') {
            list = list.filter(g => !g.has_unicode);
        }

        // --- member count + founding year range ---
        const noUpperBound = membersMax >= 100000;
        list = list.filter(g => {
            const members = g.member_count != null ? Number(g.member_count) : null;
            if (members != null) {
                if (members < membersMin) return false;
                if (!noUpperBound && members > membersMax) return false;
            }
            const year = g.founding_year != null ? Number(g.founding_year) : null;
            if (year != null && (year < yearMin || year > yearMax)) return false;
            return true;
        });

        this.searchData = list;
        this.updateResultsDisplay();
    }

    detectUnicode(text) {
        if (!text) return false;
        return /[^\x00-\x7F]/.test(text);
    }

    changeView(view) {
        const container = document.getElementById('groups_container');
        if (!container) return;

        container.setAttribute('data-view', view);
        
        container.className = 'grid gap-4';
        if (view === 'grid-1') {
            container.classList.add('grid-cols-1');
        } else if (view === 'grid-2') {
            container.classList.add('grid-cols-1', 'lg:grid-cols-2');
        } else if (view === 'grid-3') {
            container.classList.add('grid-cols-1', 'md:grid-cols-2', 'lg:grid-cols-3');
        }

        document.querySelectorAll('.view-btn').forEach(btn => {
            if (btn.getAttribute('data-view') === view) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        this.currentView = view;

        if (this.searchData.length > 0) {
            container.innerHTML = '';
            this.renderGroups();
        }
    }

    setupScrollAnimations() {
        const cards = document.querySelectorAll('.group-card');
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.style.opacity = '1';
                    entry.target.style.transform = 'translateY(0)';
                    observer.unobserve(entry.target);
                }
            });
        }, {
            threshold: 0.1,
            rootMargin: '50px'
        });

        cards.forEach((card, index) => {
            card.style.opacity = '0';
            card.style.transform = 'translateY(12px)';
            const delay = index * 0.02; // faster stagger
            card.style.transition = `opacity 0.25s ease ${delay}s, transform 0.25s ease ${delay}s`;
            observer.observe(card);
        });
    }

    showLoading(message = 'searching...') {
        const loadingElement = document.getElementById('loading');
        const loadingMessage = document.getElementById('loading-message');
        const resultsElement = document.getElementById('results');
        const errorElement = document.getElementById('error');

        if (loadingElement) {
            loadingElement.classList.remove('hidden');
            loadingElement.classList.add('active');
        }
        if (loadingMessage) loadingMessage.textContent = message;
        if (resultsElement) resultsElement.classList.add('hidden');
        if (errorElement) errorElement.classList.add('hidden');
    }

    hideLoading() {
        if (window.loadingManager) {
            window.loadingManager.hideLoading();
        }
        const loadingElement = document.getElementById('loading');
        if (loadingElement) {
            loadingElement.classList.remove('active');
        }
    }

    showError(message) {
        const errorElement = document.getElementById('error');
        if (errorElement) {
            errorElement.querySelector('span').textContent = message;
            errorElement.classList.remove('hidden');
        }
    }

    showAuthRequired() {
        this.hideLoading();
        const resultsElement = document.getElementById('results');
        const errorElement = document.getElementById('error');
        if (resultsElement) resultsElement.classList.add('hidden');
        if (errorElement) errorElement.classList.add('hidden');

        const searchContainer = document.getElementById('searchContainer');
        if (searchContainer) searchContainer.classList.add('hidden');

        const gate = document.getElementById('authGate');
        if (gate) gate.classList.remove('hidden');
    }

    checkGroupsUnicodeDisclaimer(hasUnicodeGroups) {
        const disclaimer = document.getElementById('unicode_disclaimer_groups');
        if (disclaimer && hasUnicodeGroups) {
            const dismissed = localStorage.getItem('hide_groups_unicode_disclaimer') === 'true';
            if (!dismissed) {
                disclaimer.classList.remove('hidden');
            }
        }
    }

    hideGroupsUnicodeDisclaimer() {
        const disclaimer = document.getElementById('unicode_disclaimer_groups');
        if (disclaimer) {
            disclaimer.classList.add('hidden');
            localStorage.setItem('hide_groups_unicode_disclaimer', 'true');
        }
    }


    updateResultsDisplay() {
        const resultsCount = document.getElementById('results_count');
        const groupsContainer = document.getElementById('groups_container');
        
        if (!resultsCount || !groupsContainer) return;

        const count = this.searchData.length;
        let countText = `${count} group${count !== 1 ? 's' : ''} found`;
        resultsCount.textContent = countText;

        this.smoothFilterTransition(groupsContainer);
    }

    smoothFilterTransition(groupsContainer) {
        const currentCards = Array.from(groupsContainer.querySelectorAll('.group-card'));
        
        const isFiltering = currentCards.length > 0 && this.originalSearchData.length > 0;
        
        if (!isFiltering) {
            groupsContainer.innerHTML = '';
            this.renderGroups();
            setTimeout(() => this.setupScrollAnimations(), 50);
            return;
        }

        const currentScrollTop = window.pageYOffset || document.documentElement.scrollTop;
        
        const originalScrollBehavior = document.documentElement.style.scrollBehavior;
        document.documentElement.style.scrollBehavior = 'auto';

        const currentHeight = groupsContainer.offsetHeight;
        groupsContainer.style.minHeight = currentHeight + 'px';
        groupsContainer.classList.add('groups-container-transitioning');

        const visibleGroupIds = new Set(this.searchData.map(group => group.gid));
        
        const cardsToRemove = currentCards.filter(card => {
            const groupId = card.dataset.groupId;
            return !visibleGroupIds.has(groupId);
        });

        if (cardsToRemove.length === 0) {
            groupsContainer.innerHTML = '';
            this.renderGroups();
            
            const newHeight = groupsContainer.scrollHeight;
            groupsContainer.style.minHeight = newHeight + 'px';
            
            window.scrollTo(0, currentScrollTop);
            
            setTimeout(() => {
                this.setupScrollAnimations();
                setTimeout(() => {
                    groupsContainer.style.minHeight = '';
                    groupsContainer.classList.remove('groups-container-transitioning');
                    document.documentElement.style.scrollBehavior = originalScrollBehavior;
                }, 300);
            }, 50);
            return;
        }

        cardsToRemove.forEach(card => {
            card.classList.add('filtering-out');
        });

        setTimeout(() => {
            groupsContainer.innerHTML = '';
            this.renderGroups();
            
            const newHeight = groupsContainer.scrollHeight;
            groupsContainer.style.minHeight = newHeight + 'px';
            
            window.scrollTo(0, currentScrollTop);
            
            setTimeout(() => {
                this.setupScrollAnimations();
                
                setTimeout(() => {
                    groupsContainer.style.minHeight = '';
                    groupsContainer.classList.remove('groups-container-transitioning');
                    document.documentElement.style.scrollBehavior = originalScrollBehavior;
                }, 300);
            }, 50);
            
        }, 200); 
    }
}

document.addEventListener('DOMContentLoaded', function() {
    window.groupSearchManager = new GroupSearchManager();
    
    const searchBtn = document.getElementById('searchBtn');
    if (searchBtn) {
        searchBtn.disabled = true;
        searchBtn.classList.add('cursor-not-allowed');
        searchBtn.classList.remove('lookup-btn', 'hover:shadow-md');
    }
}); 