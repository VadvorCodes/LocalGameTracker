# GameTracker

GameTracker tracks, rates, and re-rates a personal game library. It is a Windows
desktop app with no account, no cloud, and no telemetry. The library is one
SQLite file on your machine. Back it up, copy it, or open it with any SQLite
browser.

Built with Tauri 2 (Rust) and React 18.

## Features

**Library.** Add games with a status (want to play, playing, completed,
dropped), favourites, playtime, dates and private notes. Filter and sort by
status, genre, platform and rating.

**Two ratings.** Quick 0–5 stars, and a detailed 0–100 score built from four
categories (gameplay, story, music, technical performance) with your own
weights.

**Re-Rate Mode.** A swipe session that resurfaces a slice of your library and
asks if you still rate each game that way. Each card shows genre-similar games
you have already rated as a reference. Games you re-rate sit out the next
cycle.

**Dashboard.** Rating distributions, trends over time, genre top lists, highest
and lowest rated, and your recent games against your all-time averages. A
divergence view lists the games where your stars and your detailed score
disagree.

**Search.** The RAWG catalogue (900k+ games) with cover art. Results are
re-ranked locally by name match, popularity and recency, with a weight bar to
control the mix.

**Themes.** Six presets and a custom theme editor.

## Install

Windows 10/11, 64-bit. No developer tools required.

1. Download `GameTracker_1.0.2_x64-setup.exe` from the
   [latest release](https://github.com/VadvorCodes/LocalGameTracker/releases/latest).
2. Run it. The installer is not code-signed, so SmartScreen will warn.
   Click More info, then Run anyway.
3. Pick a local username. It is stored locally.

Adding games needs a free RAWG API key
([rawg.io/apidocs](https://rawg.io/apidocs)), pasted into Settings. Everything
after that (rating, re-rate sessions, the dashboard) works offline. Search falls
back to the local cache without a network.

## Privacy

The only network calls are `api.rawg.io` (search) and `media.rawg.io` (cover
art). The CSP allows nothing else. Responses and cover art are cached to disk
once and reused. No accounts, no analytics, no telemetry.

## Where the data lives

| Path | Contents |
|---|---|
| `%APPDATA%\com.gametracker.desktop\` | `gametracker.db` (library, ratings, search cache), `settings.json` (theme, API key), cached cover art in `images\` |
| `%LOCALAPPDATA%\com.gametracker.desktop\` | WebView2 runtime data |

## Uninstalling

Run `uninstall.bat` (repo root; attached to every release). It closes the app if
it is running, runs the registered uninstaller, then deletes the data folders
above. It is safe to run even if the app was never installed. Windows
Settings → Apps removes only the program and keeps the data.

## Building from source

Node 18+, Rust toolchain (MSVC), a RAWG key for live search.

```bash
git clone https://github.com/VadvorCodes/LocalGameTracker.git
cd LocalGameTracker
npm install
npm run tauri dev     # development
npm run tauri build   # installers land in src-tauri/target/release/bundle/
```

React + TypeScript frontend, Rust backend. Filtering, sorting and the dashboard
run in SQL on the Rust side; the frontend receives ready-to-plot data. No Tauri
plugins, no background runtime. Closing the window closes the app.

```bash
cd src-tauri && cargo test    # 29 tests
npm test                      # 366 tests, 29 suites
```

## Project status

1.0.2. Windows only.

## License

[MIT](LICENSE)
