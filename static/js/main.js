// Keep this state on `window` so `utils.hideProfileInformation()` can also update it.
window.lastSearchedId = window.lastSearchedId || '';

const DEFAULT_PREVIEW_VANITY_URL = 'https://steamcommunity.com/id/afarnsworth';
const DEFAULT_PREVIEW_PROCESSED_ID = 'afarnsworth';

const DEFAULT_PREVIEW_RESTORE_DEBOUNCE_MS = 350;
let defaultPreviewRestoreTimeout = null;
let lookupNonce = 0;

function parseProcessedId(steamId) {
    // extract vanity id from full url if present
    if (steamId.includes('steamcommunity.com/id/')) {
        return steamId.split('steamcommunity.com/id/')[1].split('/')[0];
    }
    // support full profile URLs
    if (steamId.includes('steamcommunity.com/profiles/')) {
        return steamId.split('steamcommunity.com/profiles/')[1].split('/')[0];
    }
    return steamId;
}

function scheduleDefaultPreviewRestore() {
    if (defaultPreviewRestoreTimeout) clearTimeout(defaultPreviewRestoreTimeout);
    defaultPreviewRestoreTimeout = setTimeout(() => {
        defaultPreviewRestoreTimeout = null;
        loadDefaultPreview();
    }, DEFAULT_PREVIEW_RESTORE_DEBOUNCE_MS);
}

function loadDefaultPreview() {
    const steamIdInput = document.getElementById('steam_id');
    const resultsElement = document.getElementById('results');
    if (!steamIdInput || !resultsElement) return;

    // Avoid re-fetching if default is already visible.
    const isAlreadyShowingDefault =
        window.lastSearchedId === DEFAULT_PREVIEW_PROCESSED_ID &&
        !resultsElement.classList.contains('hidden');
    if (isAlreadyShowingDefault) return;

    lookupProfile(DEFAULT_PREVIEW_VANITY_URL);
}

document.addEventListener('DOMContentLoaded', function () {
    const steamIdInput = document.getElementById('steam_id');
    const clearSearchBtn = document.getElementById('clearSearchBtn');
    const lookupBtn = document.getElementById('lookupBtn');
    const loadingScreen = document.getElementById('loadingScreen');
    const body = document.body;

    window.authManager.init().then(function () {
        loadingScreen.style.display = 'none';
        body.classList.add('loaded');
        loadDefaultPreview();
    });

    window.settingsManager.init();
    window.utils.checkUnicodeDisclaimer();

    setupStickyHeader();

    // search bar handling
    steamIdInput.addEventListener('input', e => {
        const val = e.target.value.trim(),
            hasVal = val.length > 0,
            isNew = val !== window.lastSearchedId;
        clearSearchBtn.classList.toggle('hidden', !hasVal);
        const enable = hasVal && isNew;
        lookupBtn.disabled = !enable;
        lookupBtn.classList.toggle('cursor-not-allowed', !enable);

        // hide profile information if search is empty
        if (!hasVal) {
            window.utils.hideProfileInformation();
            scheduleDefaultPreviewRestore();
        } else if (defaultPreviewRestoreTimeout) {
            clearTimeout(defaultPreviewRestoreTimeout);
            defaultPreviewRestoreTimeout = null;
        }
    });

    // add enter key support for main search
    steamIdInput.addEventListener('keypress', e => {
        if (e.key === 'Enter' && !lookupBtn.disabled) {
            e.preventDefault();
            lookupProfile();
        }
    });

    // initialize default view
    const defaultView = 'grid-1';
    const defaultViewBtn = document.querySelector(`.view-btn[data-view="${defaultView}"]`);
    if (defaultViewBtn) {
        defaultViewBtn.classList.add('active');
    }
    window.groupsManager.currentView = defaultView;
});

// main profile analysis function
async function lookupProfile(steamIdOverride) {
    const steamIdInput = document.getElementById('steam_id');
    const steamId = (steamIdOverride ?? steamIdInput?.value ?? '').trim();
    if (!steamId) {
        window.utils.showError('enter a valid format');
        return;
    }

    const processedId = parseProcessedId(steamId);
    const lookupId = ++lookupNonce;

    // update last searched id
    window.lastSearchedId = processedId;

    // disable ui elements during loading
    disableUIForLoading();

    window.loadingManager.showLoading();

    try {
        let data;

        // check cache first
        const cachedProfile = window.profileCache.getProfile(processedId);
        if (cachedProfile) {
            if (lookupId !== lookupNonce) return;
            // display cached data
            window.groupsManager.setGroupsData(cachedProfile.groups);
            window.profileManager.displayProfileInformation(cachedProfile);
            window.profileManager.updateMutualInfo(cachedProfile.mutual_info, cachedProfile);
            window.groupsManager.displayGroups(cachedProfile.groups);

            const resultsElement = document.getElementById('results');
            if (resultsElement) {
                resultsElement.classList.remove('hidden');
            }

            window.utils.setupFadeIn();
            return;
        }

        const response = await fetch(`/profile/${processedId}`, { credentials: 'include' });
        
        // check if response is ok before trying to parse json
        if (!response.ok) {
            // try to get error message from response
            let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
            try {
                const errorData = await response.json();
                errorMessage = errorData.error || errorMessage;
            } catch {
                // if json parsing fails, use the http status message
            }
            throw new Error(errorMessage);
        }

        // check if response is actually json
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            throw new Error('Server returned non-JSON response. Please check server logs.');
        }

        data = await response.json();

        // Ensure we have valid profile data (API may return error in 200 body)
        if (data.error) {
            throw new Error(data.error || data.detail || 'Profile lookup failed');
        }

        // cache the profile data
        window.profileCache.addProfile(processedId, data);

        // store groups data and display everything (groups may be empty from profile page)
        const groups = Array.isArray(data.groups) ? data.groups : [];
        window.groupsManager.setGroupsData(groups);
        window.profileManager.displayProfileInformation(data);
        window.profileManager.updateMutualInfo(data.mutual_info || {}, data);
        window.groupsManager.displayGroups(groups);

        const resultsElement = document.getElementById('results');
        if (resultsElement) {
            resultsElement.classList.remove('hidden');
        }

        window.utils.setupFadeIn();

    } catch (error) {
        if (lookupId === lookupNonce) {
            window.utils.showError(error.message);
        }
    } finally {
        if (lookupId !== lookupNonce) return;
        window.loadingManager.hideLoading();
        enableUIAfterLoading();
    }
}

function disableUIForLoading() {
    const lookupBtn = document.getElementById('lookupBtn');
    const searchInput = document.getElementById('steam_id');
    const clearSearchBtn = document.getElementById('clearSearchBtn');
    
    lookupBtn.disabled = true;
    searchInput.disabled = true;
    clearSearchBtn.disabled = true;
    lookupBtn.classList.add('cursor-not-allowed');
    searchInput.classList.add('opacity-50', 'cursor-not-allowed');
    clearSearchBtn.classList.add('opacity-50', 'cursor-not-allowed');
}

function enableUIAfterLoading() {
    const lookupBtn = document.getElementById('lookupBtn');
    const searchInput = document.getElementById('steam_id');
    const clearSearchBtn = document.getElementById('clearSearchBtn');
    
    lookupBtn.disabled = false;
    searchInput.disabled = false;
    clearSearchBtn.disabled = false;
    lookupBtn.classList.remove('cursor-not-allowed');
    searchInput.classList.remove('opacity-50', 'cursor-not-allowed');
    clearSearchBtn.classList.remove('opacity-50', 'cursor-not-allowed');

    // update analyze button state based on input
    const currentInput = document.getElementById('steam_id').value.trim();
    const hasInput = currentInput.length > 0;
    const shouldDisable = !hasInput || currentInput === window.lastSearchedId;
    lookupBtn.disabled = shouldDisable;
    lookupBtn.classList.toggle('cursor-not-allowed', shouldDisable);
}

// global functions for html onclick handlers
function changeView(view) {
    window.groupsManager.changeView(view);
}

function filterGroups() {
    window.groupsManager.filterGroups();
}

function openImageModal(src) {
    window.utils.openImageModal(src);
}

function closeImageModal() {
    window.utils.closeImageModal();
}

function clearSearch() {
    window.utils.clearSearch();
    loadDefaultPreview();
}

function copySteamId(element) {
    window.utils.copySteamId(element);
}

function hideUnicodeDisclaimer() {
    window.utils.hideUnicodeDisclaimer();
}

function setupStickyHeader() {
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