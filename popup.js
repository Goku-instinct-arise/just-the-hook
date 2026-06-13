'use strict';

const DEFAULT_SETTINGS = {
  enabled: true,
  thresholdSeconds: 60,
  sites: {
    youtube: true,
    youtubeMusic: true,
    spotify: true,
  },
};

// ─── Element references ───────────────────────────────────────────────────────

const els = {
  enabled:          document.getElementById('toggle-enabled'),
  thresholdNumber:  document.getElementById('threshold-number'),
  thresholdSlider:  document.getElementById('threshold-slider'),
  siteYoutube:      document.getElementById('site-youtube'),
  siteYoutubeMusic: document.getElementById('site-youtube-music'),
  siteSpotify:      document.getElementById('site-spotify'),
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function readDOM() {
  return {
    enabled:          els.enabled.checked,
    thresholdSeconds: Math.max(1, parseInt(els.thresholdNumber.value, 10) || DEFAULT_SETTINGS.thresholdSeconds),
    sites: {
      youtube:      els.siteYoutube.checked,
      youtubeMusic: els.siteYoutubeMusic.checked,
      spotify:      els.siteSpotify.checked,
    },
  };
}

function writeDOM(s) {
  els.enabled.checked          = s.enabled;
  els.thresholdNumber.value    = s.thresholdSeconds;
  // Clamp slider to its own max; the number input accepts values beyond the slider range.
  els.thresholdSlider.value    = Math.min(s.thresholdSeconds, Number(els.thresholdSlider.max));
  els.siteYoutube.checked      = s.sites.youtube;
  els.siteYoutubeMusic.checked = s.sites.youtubeMusic;
  els.siteSpotify.checked      = s.sites.spotify;
}

function save() {
  chrome.storage.sync.set(readDOM());
}

// ─── Event wiring ─────────────────────────────────────────────────────────────

// Keep slider and number input in sync with each other.
els.thresholdSlider.addEventListener('input', () => {
  els.thresholdNumber.value = els.thresholdSlider.value;
  save();
});

els.thresholdNumber.addEventListener('input', () => {
  const v = parseInt(els.thresholdNumber.value, 10);
  if (!isNaN(v)) {
    els.thresholdSlider.value = Math.min(v, Number(els.thresholdSlider.max));
  }
  save();
});

els.enabled.addEventListener('change', save);
els.siteYoutube.addEventListener('change', save);
els.siteYoutubeMusic.addEventListener('change', save);
els.siteSpotify.addEventListener('change', save);

// ─── Init ─────────────────────────────────────────────────────────────────────

chrome.storage.sync.get(DEFAULT_SETTINGS, (stored) => {
  const s = {
    ...DEFAULT_SETTINGS,
    ...stored,
    sites: { ...DEFAULT_SETTINGS.sites, ...(stored.sites || {}) },
  };
  writeDOM(s);
});
