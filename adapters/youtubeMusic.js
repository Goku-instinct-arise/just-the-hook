'use strict';

// ─── Selectors ────────────────────────────────────────────────────────────────
// YouTube Music uses Polymer/Web Components; class names are more stable than
// on regular YouTube but can still drift. Update here if buttons stop working.
const YTM_SELECTORS = {
  video:          'video',                               // Audio stream in a <video> element
  nextButton:     'tp-yt-paper-icon-button.next-button', // Polymer icon button for next track
  nextButtonAlt:  '.next-button',                        // Fallback: plain class match
  trackTitle:     '.title.ytmusic-player-bar',           // Song title in the player bar
};

// ─── Adapter factory ──────────────────────────────────────────────────────────

function createYouTubeMusicAdapter() {
  // Fresh lookup every time — YTM is a SPA and the player can be rebuilt.
  function getVideo() {
    return document.querySelector(YTM_SELECTORS.video);
  }

  return {
    getPositionSeconds() {
      const v = getVideo();
      return v ? v.currentTime : null;
    },

    getTrackId() {
      // YTM individual tracks use the same ?v= scheme as regular YouTube.
      const vid = new URLSearchParams(window.location.search).get('v');
      if (vid) return `ytm:${vid}`;
      // Fallback: title text. Less stable (two songs with the same name collide),
      // but better than nothing when the URL doesn't carry a video ID.
      const titleEl = document.querySelector(YTM_SELECTORS.trackTitle);
      const title = titleEl ? titleEl.textContent.trim() : null;
      return title ? `ytm-title:${title}` : null;
    },

    isPlaying() {
      const v = getVideo();
      return !!v && !v.paused && !v.ended && v.readyState > 2;
    },

    skipToNext() {
      // Try the Polymer-specific selector first, then the generic fallback.
      const btn =
        document.querySelector(YTM_SELECTORS.nextButton) ||
        document.querySelector(YTM_SELECTORS.nextButtonAlt);
      if (btn) {
        btn.click();
        return;
      }
      // Last resort: keyboard shortcut (Shift+N, same as regular YouTube).
      document.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'N',
          shiftKey: true,
          bubbles: true,
          cancelable: true,
        })
      );
    },
  };
}
