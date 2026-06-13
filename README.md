# Just the hook

> Hear the hook. Skip the rest.

Automatically skips to the next track so you only hear the best part. Works on Spotify, YouTube & YouTube Music.

---

## Loading the extension

1. Open Chrome and go to `chrome://extensions`
2. Enable **Developer mode** (toggle in the top-right corner)
3. Click **Load unpacked** and select the `just-the-hook` folder
4. The Just the hook icon appears in the toolbar — click it to open settings

To reload after editing source files, click the refresh icon on the
`chrome://extensions` card for Just the hook.

---

## How it works

### Architecture

```
just-the-hook/
├── manifest.json          — MV3 manifest
├── content.js             — Polling loop + settings wiring (injected into each tab)
├── adapters/
│   ├── youtube.js         — YouTube adapter  (createYouTubeAdapter)
│   ├── youtubeMusic.js    — YouTube Music adapter  (createYouTubeMusicAdapter)
│   └── spotify.js         — Spotify adapter  (createSpotifyAdapter)
├── popup.html             — Extension popup UI
├── popup.js               — Popup logic + chrome.storage.sync I/O
└── popup.css              — Popup styles
```

All adapter files are injected before `content.js` and expose a `create*Adapter()`
factory function in the shared content-script scope.

### Adapter interface

Each adapter implements four methods:

| Method | Returns | Purpose |
|---|---|---|
| `getPositionSeconds()` | `number \| null` | Current playback position in the track |
| `getTrackId()` | `string \| null` | Stable-ish ID to detect a track change |
| `isPlaying()` | `boolean` | Whether audio is actively playing |
| `skipToNext()` | `void` | Advance to the next track |

### Core loop (`content.js`)

A `setInterval` runs every 500 ms per active tab and:

1. Reads current settings from `chrome.storage.sync`
2. Resolves the correct adapter for the page's hostname
3. Calls `isPlaying()` — if `false`, does nothing
4. Calls `getPositionSeconds()` — if `< thresholdSeconds`, does nothing
5. Calls `getTrackId()` — if it matches `lastSkippedTrackId`, does nothing
   (prevents re-triggering before the next song has loaded)
6. Records the track ID and calls `skipToNext()`

Settings changes in the popup are propagated immediately via
`chrome.storage.onChanged` — no page reload needed.

### YouTube / YouTube Music specifics

- Audio comes from an `<video>` element; `currentTime`, `paused`, and
  `readyState` are read directly from the media element.
- Both sites are single-page apps. YouTube fires a `yt-navigate-finish` window
  event after each navigation; `content.js` listens for it and re-resolves the
  adapter so the video element reference stays fresh.
- Track identity: the `?v=` URL parameter (most stable). Falls back to video
  `src` or page title.

### Spotify specifics

- Spotify streams DRM-protected audio; no `<audio>` or `<video>` element is
  accessible. All state is read from the DOM.
- Position: parsed from the `[data-testid="playback-position"]` text label
  (format `m:ss`). Falls back to `aria-valuenow` on `[data-testid="progress-bar"]`
  (in milliseconds).
- Playing state: inferred from the aria-label of `[data-testid="control-button-playpause"]`
  — `"Pause"` means playing, `"Play"` means paused.
- Skip: clicks `[data-testid="control-button-skip-forward"]`.

---

## Known-fragile selectors and where to fix them

When a site updates its UI and the extension stops working, open
`adapters/<site>.js` and update the selector constants at the top of the file.
Every adapter centralises its selectors in a single `*_SELECTORS` object with
a comment explaining what each one targets — use DevTools' element inspector
to find the replacement.

| File | Object | Selectors most likely to break |
|---|---|---|
| `adapters/youtube.js` | `YT_SELECTORS` | `.ytp-next-button` |
| `adapters/youtubeMusic.js` | `YTM_SELECTORS` | `tp-yt-paper-icon-button.next-button`, `.title.ytmusic-player-bar` |
| `adapters/spotify.js` | `SPOTIFY_SELECTORS` | All `data-testid` attributes |

Tip: in DevTools console on the target page, run
`document.querySelector('<selector>')` to verify a selector is still live.

---

## Settings

| Setting | Default | Description |
|---|---|---|
| Enabled | On | Master on/off toggle |
| Skip after | 60 s | Skip when playback position ≥ this threshold |
| YouTube | On | Enable on youtube.com |
| YouTube Music | On | Enable on music.youtube.com |
| Spotify | On | Enable on open.spotify.com |

Settings are stored in `chrome.storage.sync` and sync across Chrome profiles.

---

## Known limitations

- **Spotify free tier**: Spotify free limits skips to ~6 per hour per station.
  Just the hook still clicks the button, but Spotify may block the skip.
  Works best with **Spotify Premium**.
- **Spotify position granularity**: position is parsed from the elapsed-time
  label, which only updates once per second. Thresholds finer than ~1 s have
  no additional precision.
- **Ads**: Just the hook does not detect YouTube ads; if an ad is playing the
  video element's `currentTime` may trigger a skip attempt on the ad itself.
  The next-button is typically disabled during ads, so the click is harmless,
  but it may log a no-op.
- **YouTube ambient mode / Shorts**: the extension is registered on
  `*://*.youtube.com/*` and will run on all YouTube pages. On pages without a
  player (home, search results) the adapter finds no video element and idles.
- **Offline / PWA installs**: not tested; Spotify's PWA shell may differ from
  the web player.

---

## Extending the extension

### Adding a new site

1. Create `adapters/newsite.js` implementing `createNewSiteAdapter()`.
2. Add the hostname check to `resolveAdapter()` and `isSiteEnabled()` in
   `content.js`.
3. Add a checkbox to `popup.html` / `popup.js`.
4. Add the match pattern and new file to `content_scripts` in `manifest.json`.
5. Add the host to `host_permissions` in `manifest.json`.

### Hooking in a remote timestamp source (future)

The adapter interface is designed so a remote data source can be injected as
a wrapper adapter without touching existing adapters or the polling loop:

```js
// hypothetical future module: adapters/remote-wrapper.js
function createRemoteWrappedAdapter(inner) {
  return {
    ...inner,
    getPositionSeconds() {
      // fetch from remote, fall back to inner
    },
  };
}
```

`resolveAdapter()` in `content.js` would then wrap the base adapter. No
network calls exist in this v0; everything runs locally.
