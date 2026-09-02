# 🎮 GameTracker

**A privacy-first, offline-first desktop app for tracking, rating and understanding your game library.** Inspired by [Backloggd](https://backloggd.com), rebuilt as a native desktop application — no accounts, no cloud, no telemetry. Everything lives on your machine.

Built with **Tauri 2** (Rust backend) + **React 18** (TypeScript frontend) + **SQLite**.

---

## Why it's built this way

| Decision | Reasoning |
|---|---|
| **Tauri 2 + Rust** | ~10 MB binaries and low memory vs Electron's ~150 MB; Rust backend makes the data layer a genuine engineering artifact, not just CRUD over IPC. |
| **SQLite (rusqlite, WAL)** | Single-file, transactional, and fast enough that every filter/sort/analytics query is executed **in SQL** rather than shipping rows over IPC and filtering in JS. |
| **Cache-everything RAWG strategy** | Every successful RAWG response is upserted locally; search transparently falls back to the cache when offline. The library is 100% functional without a network. |
| **Two rating systems** | A 0–5 star "gut feeling" and a 0–100 weighted category score answer different questions. The dashboard explicitly analyzes where they diverge. |

## Features

- 🔍 **Search** the RAWG catalogue (900k+ games) with cover art, genres, platforms, release dates and developers — results cached locally, with an offline fallback badge.
- 📚 **Library management**: add games with a status (Want to Play / Playing / Completed / Dropped), favourite, playtime, start/finish dates and private notes.
- ⭐ **Quick rating**: half-step 0–5 stars.
- 🎯 **Detailed score**: four independent 0–100 category scores — Gameplay, Storytelling, Music, Technical Performance — combined with **user-configurable weights** (default equal). Partial scores renormalize; weights can be changed any time and all stored scores recompute in one transaction.
- 📊 **Analytics dashboard**: star & score distributions, category radar, genre/platform breakdowns with average scores, highest/lowest rated, monthly rating and category trends, and a **"then vs now"** panel comparing your first-quartile ratings to your most recent ones — designed to show how your taste evolves, not just what it is.
- 🧠 **Divergence analysis**: surfaces games where your gut rating and detailed score disagree ("loved more than its parts" vs "better than it felt").
- 🔌 **Fully offline**: search falls back to the local cache; cover art is downloaded once to a disk cache and served from there forever.

## Architecture

```
┌─────────────────────────────────────────────┐
│  React + TypeScript (Vite, Tailwind, Zustand)│
│  Search · Library · GameDetail · Dashboard   │
└───────────────┬─────────────────────────────┘
                │ typed IPC (serde ⇄ TS types)
┌───────────────┴─────────────────────────────┐
│  Rust backend (Tauri 2)                     │
│  commands/  thin IPC handlers               │
│  rawg.rs    API client + offline fallback   │
│  cache.rs   search-response cache           │
│  scoring.rs weighted score engine (tested)  │
│  db.rs      SQLite + versioned migrations   │
└───────────────┬─────────────────────────────┘
                ▼
         gametracker.db (WAL) + images/ + settings.json
         in the OS app-data directory
```

- **Versioned migrations** (`src-tauri/src/db.rs`): an ordered list of SQL scripts applied transactionally with a `schema_version` table.
- **Scoring engine** (`src-tauri/src/scoring.rs`): pure functions, unit-tested, including weight renormalization for partially-scored games.
- **Analytics** (`src-tauri/src/commands/analytics.rs`): window functions and CTEs compute trends/quartile shifts in SQL; the frontend receives ready-to-plot DTOs.
- **Error handling**: a single `AppError` enum with `thiserror` that serializes to readable messages across IPC.

## Getting started

**Prerequisites**: Node.js 18+, Rust toolchain (MSVC), a free [RAWG API key](https://rawg.io/apidocs).

```bash
npm install
npm run tauri dev     # development
npm run tauri build   # production build (installer lands in src-tauri/target/release/bundle)
```

On first launch: pick a local username, then paste your RAWG key in **Settings** (it's validated against the live API before being stored, and lives only in a local settings file).

## Testing

```bash
cd src-tauri && cargo test    # scoring engine + DB layer
npm test                      # (vitest, if frontend tests are added)
```

## Privacy

No accounts. No analytics. No network calls except `api.rawg.io` (search) and `media.rawg.io` (cover art) — both cached locally so you can revoke network access after your library is populated. Your data lives in the OS app-data directory and is yours to back up.
