# VASSAL Browser

A **browser-native player for [VASSAL](https://vassalengine.org/) modules**, including iOS Safari. It is **not** a port of the Java desktop app — it is a TypeScript **interpreter of the `.vmod` module format**: it reads a module's `buildFile.xml`, decodes each piece's trait chain, and reimplements the trait behaviors on an HTML canvas. No Java and no server are required to play; the built site is fully static.

It is developed against locally-bundled reference modules that span the format's range — an extension-heavy module (piece-roster extensions, prototypes, cards), a complex module (custom Java classes, hex grids, lazily-loaded board archives, DR/dr dice), and a legacy 3.1-era module — but **the code knows formats, not games**: no module names or content appear in the repo.

## What works today

- Load a `.vmod` plus any number of extension archives (`.vmdx` / extension zips) via file picker, drag-and-drop, bundled presets, or URL parameters.
- Full table play: multiple map windows, board picker, palette with counter preview, piece placement/drag/multi-select, z-order layers, rotation, layer cycling (weapons/status), labels, lock, clone/delete, range & LOS, dice, cards, local chatter.
- Module-driven toolbar (NotesWindow, ToolbarMenus, TurnTracker, GlobalMap overview, map launch buttons, dice), adaptive tool windows (floating on desktop/iPad, full-screen sheets on phones).
- **Java-compatible `.vsav` save/load** — saves made here open in desktop VASSAL and vice versa, including notes (`NOTES`/`PNOTES`/`PNOTE`/`SNOTE`) and turn-counter state, with unknown commands preserved byte-for-byte.

## Quick start (development)

```bash
npm install
npm run dev        # http://localhost:5173 — also served on your LAN for iOS testing
```

To have "bundled preset" buttons on the start screen, drop each module (plus its extensions) into its own directory under `public/modules/` and run `npm run presets` — this generates/updates `public/modules/presets.json`, the data file the app reads (see [Module assets](#module-assets-and-copyright)). The code has no knowledge of specific modules; presets are pure data. Without any of this the file picker and drag-and-drop still work.

Some modules keep their boards as separate archives: put them in a `boards/` subdirectory of the module's preset directory and run `npm run boards:manifest` to regenerate `boards/manifest.json`; the board picker then loads each board archive on demand.

## Production build & hosting

```bash
npm run build      # type-checks (tsc) then bundles -> dist/
npm run preview    # serve the production build locally (sanity check)
```

The output in `dist/` is a **self-contained static site**:

- No server-side code, no database, no API. Saves are downloaded/uploaded as `.vsav` files by the player.
- `vite.config.ts` sets `base: "./"`, so asset URLs are **relative** — the build works from a domain root, a subpath (`https://example.com/vassal/`), GitHub Pages, Netlify, Cloudflare Pages, or a plain nginx/Apache directory. No rewrite rules are needed (there is no client-side routing).
- Everything in `public/` is copied verbatim into `dist/`, so a deployment that should offer bundled presets needs the module directories and `presets.json` under `public/modules/` **at build time** (they end up under `dist/modules/`).

Any static file server works:

```bash
npx serve dist                 # quick local/LAN hosting
python3 -m http.server -d dist # ditto (handy for iOS testing on the LAN)
```

Server tuning that pays off:

- Enable **gzip/brotli** and range requests. Module archives are large (a full bundle with extensions can run to hundreds of MB); compression mostly helps the JS/CSS, while `.vmod`/extension files are already zip-compressed.
- Hashed bundle assets (`dist/assets/*`) can be cached forever; `dist/modules/**` is not content-hashed, so give it a modest cache lifetime or an `ETag`.
- Serve over HTTPS in production. Plain HTTP on a trusted LAN is fine for playtesting (the app uses no APIs that require a secure context).

### Deploying without bundled modules

If you don't have redistribution rights for a module (see below), deploy `dist/` without `modules/`. Players then load their own files via the picker/drag-and-drop, or you can link them to auto-load from any CORS-readable URL:

```
https://your-host/vassal-browser/?module=<url-to.vmod>&ext=<url>,<url>&board=<name>,<name>
```

Same-origin URLs (e.g. files you host next to the app) always work; cross-origin URLs need CORS headers on the file host. The optional `board=` list names boards to auto-select, tried in order (exact name first, then substring match).

### Module assets and copyright

**No game modules are committed to this repo** (`*.vmod`, `*.vsav`, `public/modules/` are gitignored): VASSAL modules contain copyrighted game artwork. To bundle a preset, obtain a module from the [VASSAL module library](https://vassalengine.org/wiki/Category:Modules), place it (plus any extensions) in its own directory under `public/modules/`, and run `npm run presets`. Preset buttons come entirely from `public/modules/presets.json` (also gitignored — it describes the local assets); hand-edit it to curate names, order, or a `defaultBoards` auto-selection list, and the generator preserves hand-edited entries. Only host modules publicly if you have the rights to redistribute them.

## Loading modules (all entry points)

| Entry point | How |
|---|---|
| File picker / drag-and-drop | Select or drop one `.vmod` and any number of extension archives together on the start screen |
| **Bundle zip** | Drop ONE plain `.zip` containing the module plus everything that belongs to it (see below) |
| Bundled preset buttons | Fetch the file lists declared in `public/modules/presets.json` (generate with `npm run presets`) |
| URL parameters | `?module=<url>&ext=<url>,<url>&board=<name>,…` — auto-loads on page open |

### Bundle zips

VASSAL games often ship as one `.vmod` plus a litter of loose extension files.
Instead of multi-selecting them every time, zip them up once and drop the one
file. Expected layout (all names are free-form — files are classified by
content, not filename):

```
my-game-bundle.zip
├─ SomeGame.vmod        exactly one module archive
├─ Extension A          any number of extension archives (.vmdx or no suffix)
├─ Extension B.vmdx
└─ boards/              optional: separate board archives for modules that
   ├─ bd01              keep boards outside the .vmod (loaded lazily when
   └─ bd02              picked, straight from the bundle)
```

Anything that isn't a nested archive (readme, screenshots) is ignored. This is
also exactly the layout a preset directory under `public/modules/<dir>/` uses,
so a working bundle can be unzipped there and served with one click after
`npm run presets`.

Saves: the toolbar's Save downloads a Java-compatible `.vsav`; Load accepts `.vsav` files produced by this app or by desktop VASSAL.

## Testing & verification

```bash
npm test                  # vitest unit tests — parsers, trait codecs, save round-trips
npm run typecheck         # tsc --noEmit (also runs as part of build)
npx playwright install chromium   # once, for the browser verifiers
npm run verify:smoke      # build + fast smoke: load, place, rotate, menu, layer cycle, lock
npm run verify:scenario   # build + full scenario: boards, cards, dice, notes, turn, windows, save round-trip
npm run verify:grid       # build + hex-grid module: board archives, hex snap/moves/range, custom traits, charts
npm run verify            # all three verifiers back to back
```

The verifiers drive the real production build in Chromium, assert via an in-page `window.__vb` debug hook, and write screenshots to `verify-shots/`. Unit tests include **byte-identical round-trips against a real Java-VASSAL save** (`example.vsav` fixture) for the notes and turn-counter codecs, and the sequence codec mirrors Java's `SequenceEncoder` quirks exactly.

Because no module content is committed, everything module-specific in tests and verifiers is data: the verifiers read `scripts/verify.config.local.mjs` and the content-coupled test suites read `tests/fixtures/expectations.local.json` (both gitignored; committed `.example` files document the shape). Without those files the affected suites/verifiers **skip cleanly** — the rest of `npm test` still runs on a fresh clone.

## Project layout

```
src/
  vmod/       .vmod/.vsav format: zip, buildFile.xml, trait-chain codec,
              notes/turn save-command codecs, toolbar defs, sequence codec
  model/      GamePiece + trait implementations (BasicPiece, Embellishment,
              FreeRotator, Labeler, SubMenu, …), keystroke handling
  board/      canvas rendering: MapWindow (camera/pointer), render, images,
              piece-preview
  ui/         DOM shell: module toolbar, palette + preview, chatter, notes,
              turn tracker, overview map, window manager (float/sheet), menus
  app.ts      wiring hub + boot/loader
tests/        vitest suites (pure logic; jsdom only where DOM parsing is tested)
scripts/      Playwright verifiers (verify-smoke, verify-scenario, verify-grid;
              config-driven via verify.config.local.mjs) + preset/manifest generators
public/       static assets copied into dist/ (modules/ is supplied locally)
```

Conventions: `tsc` is type-check only (`noEmit`) — never commit compiled `.js` twins; runtime dependency is `fflate` alone; pure logic lives in DOM-free modules so it's unit-testable. See `CLAUDE.md` for the format internals and porting workflow, and `TODO.md` for the roadmap.

## Status & affiliation

This is an independent project, not affiliated with or endorsed by the
[VASSAL Team](https://vassalengine.org/). It reimplements the module *format*
in TypeScript; behavior is ported by reading the open-source Java engine as
the reference. No VASSAL code, artwork, or game modules are included in this
repository.

## Compatibility

- **Desktop**: current Chrome/Edge/Firefox/Safari.
- **iOS Safari / iPadOS**: first-class target — pointer events, pinch zoom, safe-area insets, 100dvh layout, sheet-mode tool windows below 720px width.
- **Interop**: `.vsav` files round-trip with desktop VASSAL (Java) for board state, visible pieces, notes, and turn state; unsupported commands are preserved, not dropped.
