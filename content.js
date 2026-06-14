'use strict';

// ─── Configuration ────────────────────────────────────────────────────────────

const POLL_MS   = 500;
const BTN_ID    = 'jth-tab-toggle';
const STYLES_ID = 'jth-styles';

const DEFAULT_SETTINGS = {
  enabled: true,
  thresholdSeconds: 60,
  sites: {
    youtube:      false, // YouTube has lots of non-music content; users opt in
    youtubeMusic: true,
    spotify:      true,
  },
};

// ─── State ────────────────────────────────────────────────────────────────────

let settings = {
  ...DEFAULT_SETTINGS,
  sites: { ...DEFAULT_SETTINGS.sites },
};

// Track ID of the last song we skipped — prevents immediately re-skipping
// before the player has loaded the next track.
let lastSkippedTrackId = null;

// The adapter selected for the current page.
let adapter = null;

// null  = follow global settings (master toggle × per-site toggle).
// true/false = per-tab override set by the in-player button.
//
// Declared at content-script load so it survives SPA soft-navigations
// (yt-navigate-finish, pushState, etc.). Only a full document reload — which
// re-runs the content script — clears this back to null.
let perTabOverride = null;

// ─── Adapter resolution ───────────────────────────────────────────────────────

// createYouTubeAdapter, createYouTubeMusicAdapter, createSpotifyAdapter are
// defined in adapters/*.js, injected before this file by the manifest.

function resolveAdapter() {
  const host = window.location.hostname;
  if (host === 'music.youtube.com') return createYouTubeMusicAdapter();
  if (host.endsWith('youtube.com'))  return createYouTubeAdapter();
  if (host === 'open.spotify.com')  return createSpotifyAdapter();
  return null;
}

function isSiteEnabled() {
  const host = window.location.hostname;
  if (host === 'music.youtube.com') return settings.sites.youtubeMusic;
  if (host.endsWith('youtube.com'))  return settings.sites.youtube;
  if (host === 'open.spotify.com')  return settings.sites.spotify;
  return false;
}

// Effective skip state: per-tab override wins; otherwise global settings apply.
function getEffectiveActive() {
  if (perTabOverride !== null) return perTabOverride;
  return settings.enabled && isSiteEnabled();
}

// ─── Core polling loop ────────────────────────────────────────────────────────

function poll() {
  try {
    // Re-inject the toggle button if a player re-render removed it.
    if (!document.getElementById(BTN_ID)) injectButton();

    if (!getEffectiveActive() || !adapter) return;

    if (!adapter.isPlaying()) return;

    const position = adapter.getPositionSeconds();
    if (position === null || position < settings.thresholdSeconds) return;

    const trackId = adapter.getTrackId();

    // Guard: do not re-skip a track we've already advanced past.
    if (trackId !== null && trackId === lastSkippedTrackId) return;

    lastSkippedTrackId = trackId;
    adapter.skipToNext();
  } catch (_) {
    // Never let the polling loop throw into the host page.
  }
}

// ─── Settings ─────────────────────────────────────────────────────────────────

function applySettings(raw) {
  settings = {
    ...DEFAULT_SETTINGS,
    ...raw,
    sites: { ...DEFAULT_SETTINGS.sites, ...(raw.sites || {}) },
  };
}

function loadSettings(cb) {
  chrome.storage.sync.get(DEFAULT_SETTINGS, (stored) => {
    applySettings(stored);
    if (cb) cb();
  });
}

// Reflect popup changes immediately without a page reload.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync') {
    loadSettings(() => {
      // perTabOverride is unchanged; sync the button visual in case the global
      // state changed and no per-tab override is masking it.
      const btn = document.getElementById(BTN_ID);
      if (btn) updateButtonState(btn, getEffectiveActive());
    });
  }
});

// ─── In-player toggle button ──────────────────────────────────────────────────

function injectPageStyles() {
  if (document.getElementById(STYLES_ID)) return;
  const iconUrl = chrome.runtime.getURL('icons/just_the_hook_32x32.png');
  const style = document.createElement('style');
  style.id = STYLES_ID;
  style.textContent = `
    #${BTN_ID} {
      position: relative;
      cursor: pointer;
      border: none;
      background: transparent url(${iconUrl}) center / 65% no-repeat;
      padding: 0;
      flex-shrink: 0;
      transition: opacity 0.15s;
      box-sizing: border-box;
    }
    #${BTN_ID}:focus-visible {
      outline: 2px solid #818cf8;
      outline-offset: 2px;
      border-radius: 4px;
    }
    /* Active: full color / full opacity. */
    #${BTN_ID}.jth-active { opacity: 1; }
    /* Inactive: dimmed AND a diagonal slash so the off-state is unambiguous. */
    #${BTN_ID}.jth-inactive { opacity: 0.38; }
    #${BTN_ID}.jth-inactive::after {
      content: '';
      position: absolute;
      /* Fixed size matches the rendered icon; centered so it tracks the icon
         regardless of the button's actual height (e.g. height:100% on YouTube). */
      width: var(--jth-icon-size, 24px);
      height: var(--jth-icon-size, 24px);
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: linear-gradient(
        to bottom right,
        transparent           calc(50% - 1.5px),
        rgba(255,255,255,0.9) calc(50% - 1.5px),
        rgba(255,255,255,0.9) calc(50% + 1.5px),
        transparent           calc(50% + 1.5px)
      );
      pointer-events: none;
    }
    /* Per-platform sizing to match native control bars.
       YouTube: height is intentionally unset so .ytp-button's height:100%
       fills the control bar, matching every other button in the row. */
    #${BTN_ID}.jth-yt {
      width: 48px;
      background-size: 24px 24px;
      --jth-icon-size: 24px;
    }
    #${BTN_ID}.jth-ytm {
      width: 40px; height: 40px;
      border-radius: 50%;
      background-size: 22px 22px;
      --jth-icon-size: 22px;
      margin: 0;
      align-self: center;
    }
    #${BTN_ID}.jth-spotify {
      width: 32px; height: 32px;
      border-radius: 50%;
      background-size: 20px 20px;
      --jth-icon-size: 20px;
    }
  `;
  (document.head || document.documentElement).appendChild(style);
}

function updateButtonState(btn, active) {
  const label = active
    ? 'Just the Hook: on for this tab'
    : 'Just the Hook: off for this tab';
  btn.setAttribute('aria-label', label);
  btn.title = label;
  btn.classList.toggle('jth-active',   active);
  btn.classList.toggle('jth-inactive', !active);
}

function createToggleButton() {
  const btn = document.createElement('button');
  btn.id = BTN_ID;
  btn.setAttribute('data-jth', 'tab-toggle');
  btn.setAttribute('role', 'button');
  btn.setAttribute('tabindex', '0');

  if (adapter.platformClass) btn.classList.add(adapter.platformClass);
  if (adapter.buttonClass)   btn.classList.add(adapter.buttonClass);

  function onToggle() {
    // First click flips the current effectiveActive, regardless of whether it
    // came from a global setting or a previous per-tab override.
    perTabOverride = !getEffectiveActive();
    updateButtonState(btn, perTabOverride);
  }

  btn.addEventListener('click', (e) => { e.stopPropagation(); onToggle(); });
  btn.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(); }
  });

  return btn;
}

function injectButton() {
  try {
    if (!adapter || typeof adapter.getButtonContainer !== 'function') return;
    if (document.getElementById(BTN_ID)) return; // already present

    const container = adapter.getButtonContainer();
    if (!container) return;

    injectPageStyles();
    const btn = createToggleButton();
    updateButtonState(btn, getEffectiveActive());
    container.prepend(btn);
  } catch (_) {}
}

// ─── SPA navigation (YouTube / YouTube Music) ─────────────────────────────────

// Re-resolves the adapter and re-injects the button after a soft navigation.
// perTabOverride is intentionally NOT touched here — it must survive
// pushState navigations within the same content-script lifetime.
if (window.location.hostname.endsWith('youtube.com')) {
  window.addEventListener('yt-navigate-finish', () => {
    adapter = resolveAdapter();
    injectButton();
  });
}

// ─── Boot ─────────────────────────────────────────────────────────────────────

loadSettings(() => {
  adapter = resolveAdapter();
  setInterval(poll, POLL_MS);
  // Initial injection attempt; poll() handles re-injection on subsequent re-renders.
  injectButton();
});
