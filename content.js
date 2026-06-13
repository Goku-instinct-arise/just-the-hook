'use strict';

// ─── Configuration ────────────────────────────────────────────────────────────

// How often to check playback state (ms). 500 ms ≈ 1-second position precision.
const POLL_MS = 500;

const DEFAULT_SETTINGS = {
  enabled: true,
  thresholdSeconds: 60, // Skip when position >= this many seconds into the track
  sites: {
    youtube: true,
    youtubeMusic: true,
    spotify: true,
  },
};

// ─── State ────────────────────────────────────────────────────────────────────

let settings = {
  ...DEFAULT_SETTINGS,
  sites: { ...DEFAULT_SETTINGS.sites },
};

// Track ID of the last song we skipped. Prevents immediately re-skipping
// after the skip fires (before the player has loaded the next track).
let lastSkippedTrackId = null;

// The adapter selected for the current page.
let adapter = null;

// ─── Adapter resolution ───────────────────────────────────────────────────────

// createYouTubeAdapter, createYouTubeMusicAdapter, createSpotifyAdapter are
// defined in adapters/*.js, which are injected before this file by the manifest.

function resolveAdapter() {
  const host = window.location.hostname;
  // music.youtube.com must be checked before the broader youtube.com guard.
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

// ─── Core polling loop ────────────────────────────────────────────────────────

function poll() {
  try {
    if (!settings.enabled || !isSiteEnabled() || !adapter) return;

    // Only act while audio is actually playing.
    if (!adapter.isPlaying()) return;

    const position = adapter.getPositionSeconds();
    if (position === null || position < settings.thresholdSeconds) return;

    const trackId = adapter.getTrackId();

    // Guard: do not re-skip a track we've already advanced past.
    // The guard clears naturally when getTrackId() returns a different value
    // after the player loads the next song.
    if (trackId !== null && trackId === lastSkippedTrackId) return;

    // Arm the guard before clicking so a slow skip doesn't fire twice.
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
    // Merge nested sites object so a partial update doesn't wipe missing keys.
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
  if (area === 'sync') loadSettings();
});

// ─── SPA navigation (YouTube / YouTube Music) ─────────────────────────────────

// YouTube and YouTube Music navigate without full page reloads. After each
// navigation the video element may be a new DOM node, so we re-resolve the
// adapter. We do NOT clear lastSkippedTrackId: if the user navigates back to
// a previously skipped video, the track ID check re-fires correctly.
if (window.location.hostname.endsWith('youtube.com')) {
  window.addEventListener('yt-navigate-finish', () => {
    adapter = resolveAdapter();
  });
}

// ─── Boot ─────────────────────────────────────────────────────────────────────

loadSettings(() => {
  adapter = resolveAdapter();
  setInterval(poll, POLL_MS);
});
