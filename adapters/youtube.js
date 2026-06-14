'use strict';

// ─── Selectors ────────────────────────────────────────────────────────────────
// These may drift when YouTube updates its player UI.
// When a selector breaks, search for the element in DevTools and update here.
const YT_SELECTORS = {
  video:      'video',             // The main HTML5 video element in the player
  nextButton: '.ytp-next-button',  // "Next" button in the player toolbar

  // FRAGILE: update if YouTube redesigns the right side of the player toolbar.
  buttonContainer: '.ytp-right-controls',
};

// ─── Adapter factory ──────────────────────────────────────────────────────────

function createYouTubeAdapter() {
  // Do NOT cache the video element. YouTube is a SPA and can swap the player
  // element on navigation, so we resolve it fresh on every call.
  function getVideo() {
    return document.querySelector(YT_SELECTORS.video);
  }

  return {
    getPositionSeconds() {
      const v = getVideo();
      return v ? v.currentTime : null;
    },

    getTrackId() {
      // The ?v= URL parameter is the stable, canonical video identifier.
      const vid = new URLSearchParams(window.location.search).get('v');
      if (vid) return `yt:${vid}`;
      // Fallback: video src URL changes per-video even without a page reload.
      const v = getVideo();
      return v && v.src ? `yt-src:${v.src}` : null;
    },

    isPlaying() {
      const v = getVideo();
      // readyState > 2 (HAVE_FUTURE_DATA) guards against stalled/loading state
      // being misread as playing.
      return !!v && !v.paused && !v.ended && v.readyState > 2;
    },

    skipToNext() {
      const btn = document.querySelector(YT_SELECTORS.nextButton);
      if (btn) {
        btn.click();
        return;
      }
      // Fallback: Shift+N is YouTube's built-in keyboard shortcut for next video.
      document.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'N',
          shiftKey: true,
          bubbles: true,
          cancelable: true,
        })
      );
    },

    // ─── In-player button ─────────────────────────────────────────────────────

    getButtonContainer() {
      return document.querySelector(YT_SELECTORS.buttonContainer);
    },

    // Matches YouTube's own toolbar button class for consistent sizing/spacing.
    buttonClass: 'ytp-button',

    // CSS class applied to #jth-tab-toggle for platform-specific sizing.
    platformClass: 'jth-yt',
  };
}
