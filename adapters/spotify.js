'use strict';

// ─── Selectors ────────────────────────────────────────────────────────────────
// Spotify obfuscates CSS class names on every deploy, so we target
// data-testid attributes which are intentionally stable. They can still
// change on major UI redesigns — update here when they do.
const SPOTIFY_SELECTORS = {
  // Elapsed time label, e.g. "1:23"
  playbackPosition:  '[data-testid="playback-position"]',
  // Seek / progress bar — aria-valuenow is in milliseconds
  progressBar:       '[data-testid="progress-bar"]',
  // Play/pause toggle — aria-label is "Pause" when playing, "Play" when paused
  playPauseButton:   '[data-testid="control-button-playpause"]',
  // Skip-forward / next-track button
  skipForwardButton: '[data-testid="control-button-skip-forward"]',
  // Track title in the now-playing bar (bottom-left)
  trackTitle:        '[data-testid="now-playing-widget"] [data-testid="context-item-info-title"]',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Parse "m:ss" or "mm:ss" elapsed-time string to a seconds integer.
// Returns null on any parse failure.
function parseTimeString(str) {
  if (!str) return null;
  const parts = str.trim().split(':');
  if (parts.length !== 2) return null;
  const m = parseInt(parts[0], 10);
  const s = parseInt(parts[1], 10);
  return isNaN(m) || isNaN(s) ? null : m * 60 + s;
}

// ─── Adapter factory ──────────────────────────────────────────────────────────

function createSpotifyAdapter() {
  // Spotify audio is DRM-protected; we cannot access a media element directly.
  // All state must be inferred from the DOM.

  return {
    getPositionSeconds() {
      // Primary: human-readable elapsed-time label is the most reliable.
      const posEl = document.querySelector(SPOTIFY_SELECTORS.playbackPosition);
      if (posEl) {
        const t = parseTimeString(posEl.textContent);
        if (t !== null) return t;
      }
      // Fallback: aria-valuenow on the seek bar is in milliseconds.
      const bar = document.querySelector(SPOTIFY_SELECTORS.progressBar);
      if (bar) {
        const raw = parseFloat(bar.getAttribute('aria-valuenow'));
        if (!isNaN(raw)) return raw / 1000;
      }
      return null;
    },

    getTrackId() {
      // Track title is the most accessible stable identifier we have in the DOM.
      // If two tracks share a name this would misfire, but it's the best option
      // without hooking into Spotify's internal JS state.
      const el = document.querySelector(SPOTIFY_SELECTORS.trackTitle);
      return el ? (el.textContent.trim() || null) : null;
    },

    isPlaying() {
      // When a track is playing the button offers "Pause"; when paused, "Play".
      const btn = document.querySelector(SPOTIFY_SELECTORS.playPauseButton);
      if (!btn) return false;
      const label = (btn.getAttribute('aria-label') || '').toLowerCase();
      return label === 'pause';
    },

    skipToNext() {
      const btn = document.querySelector(SPOTIFY_SELECTORS.skipForwardButton);
      if (btn) btn.click();
      // No keyboard fallback: Spotify intercepts key events inconsistently
      // and can mis-route them to the search box.
    },
  };
}
