# VASSAL Browser — Plan

The first-read document for this project: what we're building, **how new
modules are supported** (the porting method), and the principles that every
change must respect. Living detail lives elsewhere: `CLAUDE.md` (onboarding +
format cheatsheets), `TODO.md` (checklist/status), `README.md` (user docs).

## Goal

A **browser-native player for VASSAL modules** — desktop and **iOS Safari** —
with no Java and no server: the built site is static, play is local hotseat.
It is **not** a port of the Java Swing app; it is a **TypeScript interpreter
of the VASSAL module format** (`.vmod`).

The codebase is **module-agnostic** — like the Java engine, it knows formats,
not games. Everything module-specific is local, gitignored data: bundled
modules under `public/modules/` (+ `presets.json`), test-content expectations
in `tests/fixtures/expectations.local.json`, verifier targets in
`scripts/verify.config.local.mjs`. Three locally-bundled reference modules
span the format's range: a **complex** one (custom Java classes, external
board archives, hex grids, ~5,900 counters), a **simple extension-heavy** one
(piece-roster extensions, prototypes, cards, free placement), and a **legacy
3.1-era** one (imageless colored boards, buildFile-declared grids).

## The approach: everything is a porting exercise

A `.vmod` is a ZIP whose `buildFile.xml` **declares the whole game**: maps,
boards, grids, a palette of pieces, toolbar components. A piece is a chain of
**traits** (Java "Decorators") serialized as a delimited string. So the
engine is an interpreter with three layers:

1. **Parse** `buildFile.xml` into a typed model (`src/vmod/buildfile.ts`) and
   decode each piece's trait chain (`src/vmod/piece-type.ts`).
2. **Interpret** traits as small TypeScript classes (`src/model/traits/`),
   each keyed by its serialization id (`emb2;`, `rotate;`, `PROP;`, …).
3. **Render** per-map on Canvas 2D (`src/board/`), with the UI shell
   (palette, toolbar, tool windows, chatter) built from the parsed model.

**When a module needs something we don't have, we port it — never invent
it.** The Java engine (VASSAL, plus a module's own engine-extension classes)
is feature complete and authoritative. The workflow for a new module:

1. **Drop it in and see what degrades.** Unknown components are ignored;
   unknown traits become harmless no-ops; unparseable expressions evaluate to
   false. A module never crashes the loader — it plays at reduced fidelity,
   which tells you exactly what's missing.
2. **Identify the owning Java class.** Components map to
   `VASSAL.build.*` classes (tag name = class name); traits map to
   `$VASSAL_SRC/counters/<Class>.java` via their id prefix. Local checkouts
   of the engine sources are the reference (see CLAUDE.md).
3. **Port the semantics faithfully**: for a trait, its
   `myGetType`/`mySetType` (serialization), `myGetKeyCommands` (menu), and
   `myKeyEvent` (behavior); for a component, its attributes and draw/behavior
   methods. Byte-level codecs (saves, notes, turn state) are round-tripped
   against fixtures produced by the real jar.
4. **Pin it with tests**: pure-logic vitest for parsing/behavior, plus a
   Playwright verifier step if the feature is interaction-visible.

Module-specific Java code we cannot run is approximated generically:
- **Custom classes** (e.g. an `…ASLMap` subclass) resolve to the stock
  component with the best class-name suffix match — no per-module alias
  tables.
- **Custom trait ids** (e.g. `conceal;`) are ported once into the trait
  registry (`traits/custom/`); unknown ids stay no-ops.
- **Module knowledge is data, not code**: presets, expectations, and verifier
  targets are gitignored local files with committed `.example` templates.

## Principles (checked on every change)

- **Fidelity to the jar.** Same trait semantics, same save format (Java
  `.vsav` is the canonical save path, round-trippable both directions), same
  visual conventions. When our behavior deliberately exceeds Java's (e.g.
  pixel-accurate hit testing vs. rectangle unions), document why.
- **Mobile-first / touch-first.** One Pointer Events pipeline for
  mouse/touch/pen: pinch-zoom, drag-place from the palette, long-press
  context menus, ≥40px hit targets on coarse pointers, slide-over drawers and
  full-screen tool-window sheets on phone widths, 100dvh + safe-area insets,
  capped canvas DPR for iPad memory. iOS Safari is a release target, not an
  afterthought.
- **Protect the table state.** Pieces with the Immobilized trait don't drag;
  any piece can be manually locked from the toolbar so it can't be moved by
  mistake; terrain/aids vs. playing pieces have separate edit focus so moving
  a chit never drags the map furniture; destructive actions (delete, clear)
  act only on the explicit selection.
- **Graceful degradation, loud verification.** Missing art/components/traits
  degrade quietly at runtime, but the test suite pins what *must* work: unit
  tests for every pure module, three Playwright verifiers (smoke, scenario,
  grid) that drive the real browser and screenshot every step.
- **Performance on real modules**: lazy palette thumbnails, cached z-order,
  offscreen culling, lazy board-archive fetches, cached grid paths — a
  500-board archive directory and a multi-hundred-MB extension bundle are the
  sizing benchmarks.
- **No game names in the repo.** Committed code, comments, tests, and docs
  reference format identifiers (trait ids, Java class names, buildFile
  paths), never specific games or their content.

## Architecture map

```
src/
  vmod/        # format: zip archives, buildFile parsing, trait-chain codec,
               # hex grids, board archives, .vsav save streams, notes/turn
               # codecs, expressions
  model/       # GamePiece + one file per trait (stock + traits/custom/)
  board/       # MapWindow canvas, renderer, images/masks, piece preview
  ui/          # palette, toolbars, context menu, chatter, window manager,
               # notes/turn/chart windows, icons
  input/       # keyboard dispatch to trait key commands
  app.ts       # loader, model assembly, debug hooks (window.__vb)
scripts/       # verifiers (Playwright, config-driven) + asset generators
tests/         # vitest: parsers, traits, codecs, grids + fixture round-trips
```

## Status

All three reference modules load and play: full table flow (boards, palette,
placement, movement, menus, dice, cards, saves, tool windows) on the
extension-heavy module; board archives, hex snapping/range, custom traits,
charts, and legacy-save import on the complex module; procedural boards and
grid numbering on the legacy module. `TODO.md` tracks the live checklist and
next steps. Baseline commands:

```bash
npm test          # unit suite
npm run verify    # all three browser verifiers (config-driven)
npm run presets   # regenerate the bundled-preset data after adding a module
```

## Roadmap

- **Deck/card fidelity**: full DrawPile semantics (draw/discard/ownership,
  `.vsav` deck commands).
- **Hex-grid module depth**: stacking offsets/expand, board `LOSData`-driven
  LOS, concealment stack semantics, multi-board `bd` layouts with crop.
- **Remaining stock traits** as modules need them: GlobalKeyCommand,
  SendToLocation, SetGlobalProperty, stock Obscurable behaviors.
- **Device passes**: manual iOS Safari sweep; PWA/offline caching.
- **Maybe later**: realtime multiplayer, undo stack.

## How to work on this codebase (human or AI)

Read order: this file → `CLAUDE.md` (format internals, trait cheatsheet,
porting workflow) → `TODO.md` (live checklist) → the area you're changing.
The verify recipe lives in `.claude/skills/verify/SKILL.md`.

**Invariants — every change must keep these:**

1. **Port, don't invent.** Any trait/component/grid behavior comes from the
   Java sources (`$VASSAL_SRC`, `$VASL_SRC` — local checkouts, see CLAUDE.md).
   When we deliberately exceed Java (pixel hit-testing), the deviation is
   documented at the site.
2. **No game/module names in committed files.** Format identifiers only
   (trait ids, Java class names, buildFile paths). Module-specific content
   lives in gitignored local files: `public/modules/` + `presets.json`,
   `tests/fixtures/expectations.local.json`, `scripts/verify.config.local.mjs`
   (each has a committed `.example`). Anything reading them must skip cleanly
   when they're absent.
3. **`tsc` is noEmit.** Never commit compiled `.js` next to `.ts`.
4. **Menu names are module data, verbatim.** An empty menu text means
   keyboard-only — never substitute defaults (that's how duplicate menu rows
   crept in). Keyboard dispatch goes stroke→every matching trait; empty-named
   commands must never dedupe.
5. **Everything lands with its test**: pure logic in vitest; interaction in a
   verifier step. Gates before calling anything done:
   `npm test && npm run typecheck && npm run verify`.

**Recipes:**

- *New trait*: find its id prefix in a piece's type chain → read
  `$VASSAL_SRC/counters/<Class>.java` (`mySetType`/`myGetKeyCommands`/
  `myKeyEvent`) → implement in `src/model/traits/` (or `traits/custom/` for
  module-Java classes) → register in `vmod/piece-type.ts` → unit-test parse +
  behavior with a synthetic type string.
- *New component*: tag name = Java class name under `VASSAL.build.*`; parse
  in `vmod/buildfile.ts` into the typed model; render from the model, never
  from raw XML elsewhere.
- *New module*: drop it in the picker (or as a bundle zip) and see what
  degrades — unknown parts no-op rather than crash. Then port the gaps. To
  bundle it: directory under `public/modules/`, `npm run presets`
  (+ `npm run boards:manifest` if it has a `boards/` dir).
- *Releasing publicly*: copy the working tree into a fresh `git init` (this
  repo's history predates the module-name scrub); confirm `public/modules/`,
  `*.local.*`, `*.vmod`, `*.vsav`, and `verify-shots/` stay gitignored; pick
  a LICENSE (mind that behavior is ported from the LGPL VASSAL engine).

## Risks / open questions

- Deep `.vsav` parity for decks/list windows still needs Java-side manual
  validation (export from browser → open in jar).
- BeanShell expressions are only a safe subset; complex modules may lean on
  more of the language.
- Custom Java module code (command encoders, bespoke UI classes) can only be
  approximated; each new "complex" module may surface one such class worth a
  targeted port.
