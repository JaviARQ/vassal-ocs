# TODO — vassal-browser

Status legend: [ ] todo · [~] in progress · [x] done

Historical milestone logs were retired at stabilisation; git history has the
play-by-play. This file tracks the stable baseline and what's left.
Method, invariants, and maintainer recipes live in `PLAN.MD` ("How to work on
this codebase"); format internals in `CLAUDE.md`.

## Suggested order for the next maintainer

1. **Deck/DrawPile fidelity** (below) — DrawPiles now instantiate, render,
   and draw on their maps (`src/model/deck.ts` + MapWindow deck piles), and
   SetupStacks place at start. Remaining: `.vsav` deck-state commands (decks
   currently reset on save/load), discard/return-to-deck flows, ownership,
   and Obscurable mask rendering for face-down draws — port
   `VASSAL/counters/Deck.java` state semantics.
2. **Manual iOS Safari pass** — release gate; checklist under "Verification".
3. **Board-`LOSData` LOS engine** — biggest fidelity win for hex modules; the
   measure tool already honors the module's LOS_Thread declaration
   (`MapDef.losThread`), this adds terrain-aware sighting from board archives.
4. **Stacking offsets/expand** — the remaining z-order gap for hex modules.
Everything else below is opportunistic, driven by whatever module you load
next ("drop it in and see what degrades").

## Baseline (stable)

- [x] Module-agnostic engine: no module-specific logic in `src/` — custom Java
  classes alias to stock components by class-name suffix; bundled presets are
  pure data (`public/modules/presets.json`, `npm run presets`); feature gates
  come from module content (e.g. a `*DiceBot` component ⇒ the DR/dr dice row).
- [x] Formats: `.vmod`/extension parsing (incl. legacy `VASSAL.launch.BasicModule`
  and extensionless buildFiles), prototype expansion with parallel state
  (UsePrototype semantics), Java-compatible `.vsav` save/load with `!VCSK`
  obfuscation, byte-round-tripped notes (`NOTES`/`PNOTES`/`PNOTE`/`SNOTE`) and
  turn (`TURN`) codecs, predefined-setup `.vsav` boards, legacy saves
  (`Map<N>` ids, ASLBoardPicker `bd` commands, singleton-Stack unwrapping).
- [x] Boards & grids: image boards, composed setup tiles, imageless colored
  boards, external board archives fetched lazily (`vmod/board-archive.ts`,
  `npm run boards:manifest`), stock `HexGrid` + `ASLHexGrid` port with
  snapping/range/hexrow or `HexGridNumbering` naming, visible grid lines and
  labels.
- [x] Composed boards: stock BoardPicker tile setups AND ASLBoardPicker
  multi-board `bd` layouts (reversal, crops, lazy tile archives) draw as one
  table.
- [x] Map edge buffers: boards, grids, piles, and at-start stacks anchor at
  the map's `edgeWidth`/`edgeHeight` margin (Map.setBoardBoundaries parity) —
  piece coordinates are map-space, so aids placed beside/above the board land
  where the jar puts them.
- [x] Traits: BasicPiece, Embellishment, FreeRotator, Clone, Delete,
  Labeler (incl. `<html>` labels), Marker, Immobilized,
  MovementMarkable, Footprint, SubMenu, DynamicProperty, TriggerAction,
  PlaceMarker/Replace/PlaceDM, ReportState, Translate, plus custom
  Concealable/Concealment, TextInfo, MarkMoved (`traits/custom/`).
- [x] Interaction: pixel-accurate hit testing (opaque-pixel masks + trimmed
  bounds), keystrokes dispatched to every matching trait, multi-select,
  context menus with SubMenu flyouts, measure/LOS tool, lock, palette
  filtering + counter preview with drag-place.
- [x] Game aids: Swing-HTML labels (scenario cards, rule aids) render as REAL
  HTML — measured in a shadow root, rasterized via SVG foreignObject, cached;
  plain-text conversion is the fallback (style/script content stripped).
  Scripts never execute. Remote card assets inline best-effort (parallel,
  cached, time-capped); CORS-blocked hosts degrade to fallback colors.
- [x] Label geometry: Labeler position/justification fields port
  (Labeler.getLabelPosition), so cards/labels anchor exactly where the jar
  puts them. HTML-label pieces classify as aids (counters draw on top), are
  grabbable across their whole card face, and honor Immobilized's
  ignore-grid flag (no hex snapping).
- [x] Label $property$ substitution (FormattedString port): label text (plain
  and HTML) resolves against the piece — trait properties, Embellishment's
  `<name>_Level/_Active/_Name/_Image` surface, `pieceName`, then module
  GlobalProperty initial values (`src/model/globals.ts`); unknown refs stay
  verbatim. Labeler exposes its raw label under its declared propertyName.
- [x] Edit focus is a priority, not a wall: when no focused-layer piece is
  under the pointer, picking falls through to terrain/aids, so map furniture
  stays directly draggable while focused pieces still win overlaps.
- [x] Stacks: co-located pieces cascade visually per the map's StackMetrics
  (unexpanded separation; Java defaults when undeclared); logical positions
  and hit-testing unchanged, cycleHit still disambiguates.
- [x] UI shell: module-driven toolbar (NotesWindow, ToolbarMenus with capture
  semantics, TurnTracker, GlobalMap, map launch buttons, DiceButtons,
  ChartWindows), adaptive WindowManager (floating on desktop/iPad, sheets
  under 720px), notes/turn/overview/chart windows, chatter with dice.
- [x] Decks & at-start pieces: `DrawPile`s (incl. under folders) instantiate
  as live piles on their maps — face-down colored backs or face-up top piece,
  count badge, drag-to-draw, tap/right-click menu (Draw/Shuffle),
  `owningBoard` visibility; `SetupStack` pieces place at new-game setup;
  "Move to map ▸" context command sends a selection between map windows.
- [x] Map windows: stock `Map` plus its `PrivateMap`/`PlayerHand` subclasses
  (side-restricted in Java; hotseat renders them as ordinary windows) — many
  modules keep per-player counter trays there.
- [x] Scenarios: file-backed `PredefinedSetup`s appear in a toolbar Scenario
  picker; choosing one applies the embedded `.vsav` (boards + pieces) through
  the normal save-import path. Stack members that carry no map of their own
  adopt the enclosing stack's map/position on import (modern-save shape).
  Extensions contribute setups too (scenario-pack `.vmdx` files: hundreds of
  setups, grouped in the picker by the module's setup-menu hierarchy).
- [x] Loader: multi-file picker, drag-and-drop, presets, URL auto-load, and
  single **bundle zips** (module + extensions + optional `boards/` in one
  plain zip, resolved from memory).
- [x] iOS/responsive: 100dvh, safe-area insets, slide-over drawers ≤860px,
  ≥40px coarse-pointer targets, capped canvas DPR.
- [x] Module-specific content is quarantined in gitignored local files with
  committed `.example` templates: `public/modules/` + `presets.json`,
  `tests/fixtures/expectations.local.json`, `scripts/verify.config.local.mjs`.

## Remaining work

### Hex-grid module depth

- [ ] Stack expand/collapse and drag-of-whole-stack (visual cascade offsets
  are done; expanded-mode separation and stack-as-unit dragging are not).
- [ ] Board LOS engine: parse board-archive `LOSData` + port the module's
  hex-terrain LOS checks into the measure tool.
- [ ] Concealment stack semantics (canConceal over co-located pieces) and HIP
  (stock `hide;` trait).
- [ ] SendToLocation (`sendto;`), SetGlobalProperty (`setprop;`),
  RestrictCommands (`hideCmd;`) as real ports.
- [ ] Counter SVG rendering fidelity audit at high zoom; overlay-window
  placement UX.
- [x] Multi-board `bd` layouts: all real tiles render at their (col,row)
  cells with per-tile reversal (180°) and origin-anchored crops; Blank
  fillers hold their cells; tile archives lazy-load together; the first
  tile's grid anchors the whole layout (geo boards tile exactly); re-export
  emits the original `bd` command verbatim so crop/VER/overlay tokens
  survive. Known simplifications: cropped tiles drift at grid seams
  (per-board grids not stitched), moved-origin crops ignored, overlay (OVR)
  art not drawn.

### Grids

- [ ] Sideways hex grids and `SquareGrid`/`RegionGrid` (degrade to no grid).
- [ ] Descending (`hDescend`/`vDescend`) numbering axes are treated as
  ascending (needs board-size max row/col).

### Save / load

- [ ] Deck `.vsav` parity: DECK command import/export so pile contents
  survive save/load (today decks re-instantiate fresh on load); deck
  ownership, discard/achieved piles, face-down draws staying masked
  (needs stock Obscurable rendering).
- [ ] Expand save/load semantics for non-table windows and list-style
  components where the jar stores state outside visible pieces.
- [ ] Validate exported browser `.vsav` manually in the Java VASSAL jar
  (module + extensions; include a browser-authored note).

### Labels / piece information

- [ ] Audit commands/properties that look like labels but are actually piece
  stats or info popups; map `ModelInfo`-style NamedKeyStroke commands to the
  jar behavior; keep visible table labels separate from info popups and notes.
- [ ] Live GlobalProperty updates (SetGlobalProperty trait) — labels currently
  read static initial values only.

### Remaining VASSAL emulation

- [ ] More stock traits as modules need them: GlobalKeyCommand,
  Hideable/Obscurable (stock `obs;`) behaviors, SendToLocation,
  SetGlobalProperty, NonRectangular shape semantics.
- [ ] CounterDetailViewer / mouseover stack viewer (`src/board/piece-preview.ts`
  is the building block).
- [ ] Richer simultaneous Map-window layout while preserving the current
  one-map-at-a-time workflow.
- [ ] PWA/offline caching once the static asset strategy is settled.

### Verification

- [ ] Real iOS Safari pass: bundled preset load, pinch/pan, tap-place, pointer
  drag, long-press context menu, sidebars, card draw, `.vsav` import/export,
  window drag/resize, sheet mode + switcher, Notes editing, preview
  drag-place, safe-area insets on a notched device.
- [ ] Mobile/iPad-sized verifier pass focused on load time, palette filtering,
  canvas DPR, and touch interactions.

## Portability / Hosting

- [x] Production build & hosting are documented in `README.md` ("Production
  build & hosting"): static `dist/`, relative base (subpath-safe), server
  tuning, deploying with or without bundled modules, `?module=&ext=`
  auto-load, copyright notes.
- `public/modules/` must be present **at build time** for bundled presets
  (Vite copies `public/` → `dist/`); dev needs the same source tree. Not
  committed (copyrighted assets).

## Useful commands

```bash
npm test                 # unit tests (fixture-content suites skip without local assets)
npm run typecheck        # tsc --noEmit
npm run build            # production static site -> dist/
npm run verify           # verify:smoke + verify:scenario + verify:grid (Playwright)
npm run boards:manifest  # regenerate boards/manifest.json for every preset with boards/
npm run presets          # regenerate public/modules/presets.json
```
