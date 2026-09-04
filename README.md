# 🎮 GameTracker

![Platform](https://img.shields.io/badge/Windows-10%2F11-0078D6?logo=windows&logoColor=white)
![Tauri](https://img.shields.io/badge/Tauri-2-24C8DB?logo=tauri&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)
![SQLite](https://img.shields.io/badge/SQLite-WAL-003B57?logo=sqlite&logoColor=white)
![Version](https://img.shields.io/badge/version-1.0.0-blue)
![Tests](https://img.shields.io/badge/tests-366%20frontend%20%2F%2029%20Rust-brightgreen)

**A privacy-first, offline-first desktop app for tracking, rating and understanding your game library.** Inspired by [Backloggd](https://backloggd.com), rebuilt as a native desktop application — no accounts, no cloud, no telemetry. Everything lives on your machine.

Built with **Tauri 2** (Rust backend) + **React 18** (TypeScript frontend) + **SQLite**.

```bash
git clone https://github.com/VadvorCodes/LocalGameTracker.git
```

## Features

- **Search** — the RAWG catalogue (900k+ games) with covers, genres, platforms, release dates and developers. RAWG relevance only picks the candidates; results are re-ranked client-side by a mix of name match, popularity (log-scaled) and recency, with a draggable three-segment weight bar and presets (Balanced / Best match / Popular / Newest / Custom). Year range and "hide DLC & editions" filter server-side; genre and platform chips filter client-side.
- **Library** — add games with a status (Want to Play / Playing / Completed / Dropped), favourite, playtime, start/finish dates and private notes. Filter by status, favourite, genre or platform; threshold sliders for stars and detailed score; extended sorting options behind a setting. All filtering and sorting executes in SQL.
- **Two rating systems** — a quick half-step 0–5 star "gut feeling", and a detailed 0–100 score built from four optional category scores (Gameplay, Storytelling, Music, Technical Performance) combined with user-configurable weights. Partially-scored games renormalize the weights; changing weights recomputes every stored overall score in one transaction.
- **Re-Rate Mode** — a swipe-based revision session that cycles a slice of your library at a size you choose (5 / 10 / 20 / full). Games you actually re-rate get a cooldown tag and sit out the next cycle. Each card starts from the three most genre-similar games you've already rated (Jaccard similarity over genre sets), and the resulting piles can be re-ordered by drag-and-drop before the re-rate pass.
- **Analytics dashboard** — star and score distributions, category radar, monthly rating and category trends, genre top-10, highest/lowest rated, and a "Latest 5 games played" panel comparing your recent ratings against your all-time profile averages. A dedicated **divergence analysis** surfaces games where your gut rating and detailed score disagree ("loved more than its parts" vs "better than it felt").
- **Personalization** — six preset themes plus a custom theme editor (two picked colours derive a full palette), inline username rename, extended-sorting toggle.
- **Fully offline** — every RAWG response is cached locally and search falls back to the cache when offline; cover art is downloaded once to a disk cache and served from there forever.

## Why it's built this way

| Decision | Reasoning |
|---|---|
| **Tauri 2 + Rust** | ~10 MB binaries and low memory vs Electron's ~150 MB. The Rust side is a real data layer, not CRUD relayed over IPC. |
| **SQLite (rusqlite, WAL)** | Single-file, transactional, fast enough that every filter/sort/analytics query runs **in SQL** instead of shipping rows over IPC and filtering in JS. |
| **No Tauri plugins, no background runtime** | The app uses direct `rusqlite` behind a `Mutex<Connection>` and on-demand async commands only — no plugin permission surface, no scheduler, no surprises running when the window is closed. |
| **Cache-everything RAWG strategy** | Every successful RAWG response is upserted locally (raw JSON kept so later features can read new fields); search transparently falls back to the cache when offline. The library is 100% functional without a network. |
| **Two rating systems** | Stars answer "how did it feel"; the weighted category score answers "how good is it, really". The dashboard explicitly analyzes where the two disagree. |
| **Hardened by default** | The CSP whitelists exactly `api.rawg.io` and `media.rawg.io`; the asset protocol is scoped to the app-data folder; zero Tauri plugin permissions are granted. |
| **Genre sets, not genre counts** | Re-Rate similarity uses Jaccard similarity of genre sets so generic multi-genre games don't dominate every match list. |

## Architecture

```
┌─────────────────────────────────────────────┐
│  React + TypeScript (Vite, Tailwind, Zustand)│
│  pages/   Onboarding · Search · Library ·    │
│           GameDetail · Dashboard · RerateMode│
│  components/  presentational (+ rerate/,     │
│               gameDetail/, settings/)        │
│  hooks/   shared data-loading plumbing       │
│  lib/     pure logic (scoring, searchRank,   │
│           themes, format, dropTarget, sets)  │
│  types.ts  domain types + UI constants       │
└───────────────┬─────────────────────────────┘
                │ typed IPC (serde ⇄ TS types)
┌───────────────┴─────────────────────────────┐
│  Rust backend (Tauri 2)                     │
│  commands/      thin IPC handlers (games,   │
│                 ratings, rerate, analytics, │
│                 profile, settings, images)  │
│  rawg.rs        API client + offline        │
│                 fallback                    │
│  game_cache.rs  game-cache table DAO        │
│  settings.rs    JSON settings file          │
│  scoring.rs     weighted score engine       │
│                 (tested)                    │
│  db.rs          SQLite + versioned          │
│                 migrations                  │
└───────────────┬─────────────────────────────┘
                ▼
     gametracker.db (WAL) + images/ + settings.json
     in the OS app-data directory
```

- **Versioned migrations** (`src-tauri/src/db.rs`): an ordered list of SQL scripts applied transactionally against a `schema_version` table — e.g. v3 moved re-rate cooldowns out of the `rating` table into a dedicated `rerate_tag` table without touching existing ratings.
- **Scoring engine** (`src-tauri/src/scoring.rs`): pure, unit-tested functions, including weight renormalization for partially-scored games; mirrored in TypeScript for live previews.
- **Analytics** (`src-tauri/src/commands/analytics.rs`): CTEs and window functions compute the whole dashboard payload in SQL; the frontend receives ready-to-plot DTOs.
- **Re-Rate scheduling** (`src-tauri/src/commands/rerate.rs`): pool selection, cooldown-tag lifecycle and genre-similar companions run in a single transaction, so a session can never start in a half-scheduled state.
- **Error handling**: a single `AppError` enum (`thiserror`) serializes to readable messages across IPC.

## Where your data lives

Everything the app creates is inside two folders (Windows), both keyed by the bundle identifier `com.gametracker.desktop`:

| Path | Contents |
|---|---|
| `%APPDATA%\com.gametracker.desktop\gametracker.db` | SQLite database: profile, library, ratings, re-rate tags and the RAWG search cache (WAL mode; `-wal`/`-shm` sidecars appear while running) |
| `%APPDATA%\com.gametracker.desktop\settings.json` | Theme, custom theme colours, extended-sorting flag and your RAWG API key — stored locally, never sent anywhere except `api.rawg.io` |
| `%APPDATA%\com.gametracker.desktop\images\` | Cover-art cache, one SHA-256-named file per source URL |
| `%LOCALAPPDATA%\com.gametracker.desktop\` | WebView2 runtime data (web cache, localStorage holding only two Re-Rate UI preferences) |

## Uninstalling

Run **`uninstall.bat`** (double-click). It will:

1. Offer to close a running GameTracker instance,
2. find the installed program's own uninstaller in the registry and offer to run it (removes program files, Start Menu shortcut and the Windows uninstall entry), then
3. delete both data folders above — database, settings (including the API key), cover cache and WebView2 data.

The script is safe to run even if GameTracker was never installed or is already gone: it simply wipes whatever data remains. You can also remove the program alone via **Windows Settings → Apps → Installed apps**.

## Getting started

**Prerequisites**: Node.js 18+, the Rust toolchain (MSVC on Windows), and a free [RAWG API key](https://rawg.io/apidocs) for live search (the app works without one from the local cache).

```bash
npm install
npm run tauri dev     # development
npm run tauri build   # production build; NSIS + MSI installers land in
                      # src-tauri/target/release/bundle/
```

On first launch, pick a local username, then paste your RAWG key in **Settings → General** — it's validated against the live API before being stored, and never leaves your machine afterwards.

## Testing

```bash
cd src-tauri && cargo test    # 29 tests: scoring, migrations, rerate lifecycle, cache, RAWG params
npm test                      # 366 tests in 29 suites (vitest + testing-library)
npm run format:check          # prettier
```

Frontend tests mock the Tauri IPC at two layers: `src/api.test.ts` verifies every typed wrapper against the raw `invoke` mock, and everything else mocks the typed `src/api` module via the shared factory in `src/test/apiMock.ts`. Domain factories, async helpers and DOM stubs live in `src/test/utils.tsx`.

## Code style

Formatting is enforced by tooling: `cargo fmt` for Rust, Prettier (`npm run format`) for TypeScript/config files. Shared UI vocabulary (statuses, categories, default weights, theme ids, cycle sizes) lives in `src/types.ts`; shared data-loading hooks in `src/hooks/`.

## Privacy

No accounts. No analytics. No telemetry. The only network calls are to `api.rawg.io` (search) and `media.rawg.io` (cover art) — both results are cached locally, so you can revoke network access once your library is populated. Your data lives in the folders listed above and is yours to back up or delete; the uninstall script removes all of it.

## License

[MIT](LICENSE)
