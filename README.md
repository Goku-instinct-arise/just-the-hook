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
├── content.js             — Polling loop + settings wiring + in-player button (injected into each tab)
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

Each adapter implements four skip-logic methods plus two in-player button members:

| Member | Type | Purpose |
|---|---|---|
| `getPositionSeconds()` | `() → number\|null` | Current playback position in the track |
| `getTrackId()` | `() → string\|null` | Stable-ish ID to detect a track change |
| `isPlaying()` | `() → boolean` | Whether audio is actively playing |
| `skipToNext()` | `() → void` | Advance to the next track |
| `getButtonContainer()` | `() → Element\|null` | Container element for the in-player toggle button |
| `platformClass` | `string` | CSS class added to the button for platform-specific sizing |

`buttonClass` is optional: when set, it is also added to the button so it
inherits the platform's own button styling (e.g. `ytp-button` on YouTube).

### Core loop (`content.js`)

A `setInterval` runs every 500 ms per active tab and:

1. Re-injects the in-player toggle button if the player re-rendered it away.
2. Evaluates `effectiveActive` (see **State model** below) — if `false`, no-ops.
3. Calls `isPlaying()` — if `false`, does nothing.
4. Calls `getPositionSeconds()` — if `< thresholdSeconds`, does nothing.
5. Calls `getTrackId()` — if it matches `lastSkippedTrackId`, does nothing
   (prevents re-triggering before the next song has loaded).
6. Records the track ID and calls `skipToNext()`.

Settings changes in the popup are propagated immediately via
`chrome.storage.onChanged` — no page reload needed.

### YouTube / YouTube Music specifics

- Audio comes from a `<video>` element; `currentTime`, `paused`, and
  `readyState` are read directly from the media element.
- Both sites are single-page apps. YouTube fires a `yt-navigate-finish` window
  event after each navigation; `content.js` listens for it and re-resolves the
  adapter so the video element reference stays fresh, then re-injects the
  in-player button.
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

## Settings

### Per-platform defaults

Different sites ship with different default states to match their content type:

| Site | Default | Reason |
|---|---|---|
| Spotify | **On** | Primarily music; skip-to-hook is always useful |
| YouTube Music | **On** | Exclusively music; same rationale as Spotify |
| YouTube | **Off** | Heavy mix of non-music content (talks, vlogs, tutorials); users opt in |

These defaults apply on first install and can be changed any time in the popup.

### Settings reference

| Setting | Default | Description |
|---|---|---|
| Enabled | On | Master on/off toggle |
| Skip after | 60 s | Skip when playback position ≥ this threshold |
| YouTube | **Off** | Enable on youtube.com |
| YouTube Music | On | Enable on music.youtube.com |
| Spotify | On | Enable on open.spotify.com |

Settings are stored in `chrome.storage.sync` and sync across Chrome profiles.

---

## In-player toggle button

Each supported player gets a small **Just the Hook** button injected directly
into its control bar. It lets you flip auto-skip for the **current tab only**,
independent of the popup's global settings.

### Visual states

| State | Appearance |
|---|---|
| **Active** | Full-color icon at full opacity |
| **Inactive** | Dimmed icon (≈38 % opacity) with a diagonal slash through it |

Hovering shows a tooltip; the `aria-label` also reflects state for screen
readers (`"Just the Hook: on for this tab"` / `"Just the Hook: off for this tab"`).

### State model and override precedence

```
effectiveActive =
    perTabOverride !== null
        ? perTabOverride                       // in-player button wins
        : (masterEnabled && siteEnabled)       // falls back to popup settings
```

- **`perTabOverride`** is `null` on content-script load and is set by clicking
  the in-player button. It is **never** reset by navigation or player re-renders
  within the same tab.
- **Only a full page reload** (which re-runs the content script) clears the
  per-tab override back to `null`.
- The popup remains the global default control. The in-player button is a
  lightweight per-tab override on top of it.

### Example flows

| Scenario | Effective state |
|---|---|
| YouTube (default off), no override | Skip disabled |
| YouTube, user clicks in-player button once | Skip enabled for this tab |
| Spotify (default on), user clicks in-player button once | Skip disabled for this tab |
| User navigates to next video (soft-nav), no reload | Override persists |
| User reloads the page | Override cleared; falls back to popup setting |

### Injection points

Each adapter's `_SELECTORS` object holds the container selector. Update it
there when a site redesigns its player (see **Known-fragile selectors** below).

| Platform | Container selector |
|---|---|
| YouTube | `.ytp-right-controls` |
| YouTube Music | `ytmusic-player-bar #right-controls` |
| Spotify | `[data-testid="right-side-of-now-playing-bar"]` (falls back: `volume-bar` → `now-playing-bar`) |

The button re-injects automatically whenever the polling loop detects it has
been removed by a player re-render (track change, SPA navigation, fullscreen
transition). `perTabOverride` is preserved across all of these.

---

## Known-fragile selectors and where to fix them

When a site updates its UI and the extension stops working, open
`adapters/<site>.js` and update the selector constants at the top of the file.
Every adapter centralises its selectors in a single `*_SELECTORS` object with
a comment explaining what each one targets — use DevTools' element inspector
to find the replacement.

| File | Object | Selectors most likely to break |
|---|---|---|
| `adapters/youtube.js` | `YT_SELECTORS` | `.ytp-next-button`, `.ytp-right-controls` |
| `adapters/youtubeMusic.js` | `YTM_SELECTORS` | `tp-yt-paper-icon-button.next-button`, `.title.ytmusic-player-bar`, `ytmusic-player-bar #right-controls` |
| `adapters/spotify.js` | `SPOTIFY_SELECTORS` | All `data-testid` attributes |

Tip: in DevTools console on the target page, run
`document.querySelector('<selector>')` to verify a selector is still live.

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
3. Add a checkbox to `popup.html` / `popup.js` with an appropriate default.
4. Add the match pattern and new file to `content_scripts` in `manifest.json`.
5. Add the host to `host_permissions` in `manifest.json`.
6. Implement `getButtonContainer()` and set `platformClass` in the adapter.

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
network calls exist in the current version; everything runs locally.
