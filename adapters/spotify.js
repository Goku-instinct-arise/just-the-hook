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

  // FRAGILE: update if Spotify renames these buttons.
  // We locate the right-controls container by finding a known first child and
  // walking up to its parent — more reliable than targeting the container itself,
  // whose own data-testid varies across Spotify versions.
  rightControlsAnchor:  '[data-testid="lyrics-button"]',
  rightControlsAnchor2: '[data-testid="queue-button"]',
  rightControlsAnchor3: '[data-testid="devices-button"]',
  // Direct container selectors as last-resort fallbacks.
  buttonContainer:          '[data-testid="right-side-of-now-playing-bar"]',
  buttonContainerFallback1: '[data-testid="volume-bar"]',
  buttonContainerFallback2: '[data-testid="now-playing-bar"]',
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

    // ─── In-player button ─────────────────────────────────────────────────────

    getButtonContainer() {
      // Strategy: walk up from any confirmed child of the right-controls bar.
      // We try named anchor buttons first (their data-testid varies by Spotify
      // version), then fall back to volume-bar which is reliably present.
      const child =
        document.querySelector(SPOTIFY_SELECTORS.rightControlsAnchor) ||
        document.querySelector(SPOTIFY_SELECTORS.rightControlsAnchor2) ||
        document.querySelector(SPOTIFY_SELECTORS.rightControlsAnchor3) ||
        document.querySelector(SPOTIFY_SELECTORS.buttonContainerFallback1);
      if (child && child.parentElement) return child.parentElement;

      // Last resort: direct container selectors.
      return (
        document.querySelector(SPOTIFY_SELECTORS.buttonContainer) ||
        document.querySelector(SPOTIFY_SELECTORS.buttonContainerFallback2)
      );
    },

    // CSS class applied to #jth-tab-toggle for platform-specific sizing.
    platformClass: 'jth-spotify',
  };
}
