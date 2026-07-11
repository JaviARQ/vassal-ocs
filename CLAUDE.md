# CLAUDE.md — vassal-browser

> Living onboarding doc for any agent (or human) working on this project. Read this first.
> User-facing docs (quick start, **production build & hosting**, module loading, legal notes) live in `README.md`; roadmap in `TODO.md`; method/principles in `PLAN.MD`.

## What this is

A **browser-native player for VASSAL modules**, including **iOS Safari**. It is **not** a port of the Java desktop app — it is a **JavaScript interpreter of the VASSAL module format**. No Java, no server required to play; the built site is static.

**Working principle: everything is a porting exercise.** The Java engine (VASSAL, plus a module's own engine-extension classes) is feature-complete and authoritative; when adding a trait/component/grid, read its `myGetType`/`mySetType`/`myGetKeyCommands`/`myKeyEvent` (or equivalent) and port the semantics faithfully — do not invent new logic.

- **The code has no knowledge of specific games.** Everything module-specific is local data: bundled modules live under `public/modules/` (gitignored), described by `public/modules/presets.json`; test-fixture content expectations live in `tests/fixtures/expectations.local.json`; verifier targets live in `scripts/verify.config.local.mjs` (both gitignored, with committed `.example` templates).
- Reference modules (local, uncommitted): a **complex** one (custom Java classes, 4 PieceWindows, ~5,900 counters, external board archives, hex grids), a **simple extension-heavy** one (army-roster extensions, prototypes, cards, free placement), and a **legacy 3.1-era** one (imageless colored boards, buildFile-declared grids).
- Reference Java sources (for trait/component semantics) are **local sibling checkouts, not part of this repo** — set/locate them per machine:
  - VASSAL engine: a checkout of `vassal-engine/vassal` (paths below written as `$VASSAL_SRC` = `.../vassal-app/src/main/java/VASSAL/`).
  - The complex module's engine-extension sources (for its custom classes): written as `$VASL_SRC` below; its board files are where the bundled `boards/` directory came from.

## The key insight: modules are declarative

A `.vmod` is a **ZIP**. Inside:
- **`buildFile.xml`** (or `buildFile`, no extension, in older modules) — the whole game as a tree: `GameModule → Map(s) → BoardPicker/Boards, StackMetrics, LayeredPieceCollection, ToolbarMenu, DrawPile`, a `PieceWindow` **palette** of `PieceSlot`s, and `PrototypeDefinition`s.
- **`images/…`** and root board images — sprite/board assets.
- **`*.vsav`** — saved games; each is itself a ZIP with a `savedGame` command stream (pre-built board setups live here). May be obfuscated (`!VCSK` XOR header).

A **GamePiece is an ordered chain of "traits" (Decorators)**, serialized as a tab/backslash-delimited string. Decode it, run the traits, render on canvas.

## Trait cheatsheet (stock)

| mnemonic | Java class | purpose | our file |
|---|---|---|---|
| `piece` | BasicPiece | base image + BasicName | `traits/BasicPiece.ts` |
| `emb2` | Embellishment (Layer) | **cycle equipment/status layers** (Activate/Increase/Decrease) | `traits/Embellishment.ts` |
| `rotate` | FreeRotator | **rotate piece** (own keystroke; cycles `angleIndex` or free angle) | `traits/FreeRotator.ts` |
| `clone` | Clone | context-menu clone | `traits/Clone.ts` |
| `delete` | Delete | context-menu delete | `traits/Delete.ts` |
| `label` | Labeler | text labels | `traits/Labeler.ts` |
| `mark` | Marker | static property (often the `Layer` z-order value) | `traits/Marker.ts` |
| `immob` | Immobilized | **lock** (`NEVER_MOVE='V'`) — don't move by mistake | `traits/Immobilized.ts` |
| `markmoved` | MovementMarkable | moved flag + marker | `traits/MovementMarkable.ts` |
| `footprint` | Footprint | movement trail | `traits/Footprint.ts` |
| `submenu` | SubMenu (KeyCommandSubMenu) | nest menu commands | `traits/SubMenu.ts` |
| `PROP;` | DynamicProperty | piece-local property + set/prompt/increment commands | `traits/DynamicProperty.ts` |
| `macro;` | TriggerAction | fire action keystrokes when watched keys + property match | `traits/TriggerAction.ts` |
| `placemark;` | PlaceMarker | spawn another piece (inline def or PieceSlot path) | `traits/PlaceMarker.ts` |
| `replace;` | Replace | PlaceMarker that replaces this piece (vehicle→wreck, kill) | `traits/PlaceMarker.ts` |
| `report;` | ReportState | chat line when the piece receives a keystroke | `traits/ReportState.ts` |
| `translate;` | Translate | move fixed distance (e.g. six hex-direction commands) | `traits/Translate.ts` |
| `obs` / `hide` / `calcProp` | Obscurable (Mask) / Hideable / CalculatedProperty | fog / hidden side / computed prop | later |

**Custom traits** (from a module's own Java classes, `$VASL_SRC/counters/*.java`) live under `traits/custom/`: `conceal;`/`concealment;` = Concealable/Concealment (the "?" overlay/counter), `info;` = TextInfo (Ctrl+I rules text), `placeDM;` = PlaceDM (a guarded PlaceMarker), `moved;` = MarkMoved (`traits/custom/MovedMarker.ts`). Property/BeanShell-subset expressions: `vmod/expression.ts` (unsupported syntax degrades to false/no-op, never crashes). Trait-queued side effects (`pendingPlacements`, `pendingReports`) are flushed by `app.flushPieceEffects` after every command.

**Context menu = union of every trait's `keyCommands()`** (mirrors `VASSAL/build/module/map/MenuDisplayer` + `Decorator.getKeyCommands`). **Toolbar = the Map's child components** (Zoomer, LOS_Thread, GlobalMap, ImageSaver, ToolbarMenu).

To learn a trait's exact encoding, read its Java: `myGetType()` (type string), `mySetType()` (parse), `myGetKeyCommands()`, `myKeyEvent()` in `$VASSAL_SRC/counters/<Class>.java`.

## Extensions & prototypes

Some modules keep most of their pieces in **extension files** (`.vmdx` or extensionless zips). An extension is a ZIP with a `buildFile` whose `<ModuleExtension>` has `<ExtensionElement target="…path…">` grafts — the target is a `Class:entryName/…` path into the base palette (e.g. `…PieceWindow:Models/BoxWidget:GroupB`). `parseExtension` + `applyExtension` (`vmod/buildfile.ts`) splice the graft widgets into the tree; images resolve across all archives (base + extensions) via the composite `ImageSource`.

Extension pieces typically use **`prototype;NAME`** references plus inline `emb2` layers. `expandPrototypes` (`vmod/piece-type.ts`) splices each prototype's traits (minus its BasicPiece) into the chain, recursively. Unimplemented prototype traits become harmless no-ops; the piece's own inline `emb2` layers still render and cycle. Fresh palette drops start at type-derived default state. Java `.vsav` load imports visible non-deck pieces by applying VASSAL restore commands to the expanded piece chain; deeper deck/list command semantics remain future work.

### Piece state fidelity (matters to every module)

`buildPieceFromTypeState` expands prototypes **with states in parallel** (`expandPrototypesWithState`): when the slot state chain aligns 1:1 with the raw type chain, a `prototype;NAME` segment contributes its definition's own trait states (Java UsePrototype semantics), so pieces start on the correct emb2 levels instead of type defaults. `Embellishment.isActive()` is strictly `value > 0` (negative = inactive, level remembered) — `alwaysActive` only seeds the initial value.

## Complex-module support (custom classes, board archives, hex grids)

All ported and verified by `npm run verify:grid`:

- **Custom Java subclasses** (e.g. `VASL.build.module.ASLMap`, `ASLBoardPicker`, `VASLThread` in the complex reference module) are resolved generically: `normalizeCustomClasses` (`vmod/buildfile.ts`) aliases any custom dotted tag to the stock component with the best class-name suffix match (`stockClassFor` — exact suffix beats longest common word-suffix ≥ 4 chars). There is NO per-module alias table; unmatched custom tags are ignored like any unknown component.
- **Multiple PieceWindows** merge into one palette tree, including `hidden="true"` windows (no toolbar button, not rendered, but kept in the tree so PlaceMarker paths resolve through them).
- **External board archives**: some modules keep boards out of the `.vmod` — each board is a separate ZIP with the board image + grid metadata (`BoardMetadata.xml` modern / `data` legacy) + binary `LOSData`. Put them in a `boards/` subdirectory of the preset and run `npm run boards:manifest`; the app fetches a board archive lazily when picked (`app.loadBoardArchive`), parses it via `vmod/board-archive.ts`, and pushes it onto the image-source list.
- **Hex grid** (`vmod/hexgrid.ts`, class `HexGridModel`): exact port of stock `HexGrid` + the `ASLHexGrid` subclass — geomorphic constants (hexWidth 1800/32 = 56.25, hexHeight 64.5, A1 center (0, 32.25), 33×10 hexes) from `BoardArchive.java`; staggered columns give B0/B10 half-hexes; `snapToHex` uses hex-polygon containment; `range()` uses odd-q offset → cube coordinates. MapWindow snaps placements/drags, reports moves as `X moves F5 -> G5 *`, measures range in hexes, and outlines the selected hex. BuildFile-declared stock `HexGrid`/`HexGridNumbering` under `Board` parse into the same model (drawn grid lines/labels when `visible`).
- **DiceBot row**: a module declaring a custom `*DiceBot` component (`ModuleModel.hasDiceBot`) gets a DR/dr row in the chatter (`Chatter.setDiceBotRow`) porting the `ASLDiceBot` report shape `*** (CAT DR) c,w ***`.
- **ChartWindow**: Chart images under nested Tab/Panel/Box/List widgets parse from the buildFile (`parseChartNodes`) into a toolbar button + WindowManager window with lazy nested tabs (`src/ui/ChartWindowView.ts`).

### Hit testing (pixel-accurate; deliberately stricter than PieceFinder)

Java's `PieceFinder` tests `getShape().contains(pt)` where the shape is the rectangle union of base + active layer bounds, **excluding** layers flagged `drawUnderneathWhenSelected` (emb2 field 13) — but module art ships on big transparent canvases, so raw rects let a large sprite block clicks on a neighbour. We keep the Java shape semantics for the fast path and go one step further (`render.ts hitTestPiece` + `ImageStore.mask`):

1. bounds are trimmed to each image's **opaque pixels** (per-image alpha mask + trim rect, computed lazily once);
2. a click must land on an actually-opaque pixel (small neighbourhood sampled for touch) of the base or a non-underneath layer; unloaded/unreadable images fall back to the bounds test.

The selection outline uses the same trimmed shape extents. Overlapping opaque pieces still disambiguate through `MapWindow.cycleHit` (alt/double-click cycles). Keystrokes dispatch to **every** matching trait command (keymap + `GamePiece.dispatch`), mirroring the Decorator keyEvent chain. Diagnostics: `__vb.selectedBounds()`.

### Image name resolution (DataArchive port)

`ModuleArchive.resolveKey` (`vmod/zip.ts`) mirrors Java `DataArchive`: try the name as given, then under `images/`, then — "Maybe it's an extensionless GIF? Aauugh!" — the same with `.gif` appended (legacy modules reference art extensionless: `MS/Ctrl…` → `images/MS/Ctrl….gif`). Basename-only matching is the **last** resort because big modules have thousands of duplicate basenames across directories. A blank (`" "`) BasicPiece image name means "no image" (`ScaledImagePainter.setImageName` isBlank check). The whole referenced surface is regression-swept by `tests/module-images.test.ts`, which pins the image names genuinely missing from the module archive (broken in the jar too) via `expectations.local.json`.

### Legacy modules (VASSAL 3.1-and-earlier era)

Old modules differ in ways the Java engine still supports; we port the same tolerances: root tag `VASSAL.launch.BasicModule` (= GameModule; `LEGACY_CLASSES` in buildfile.ts), **imageless boards** that are a `width×height` solid `color` rectangle keyed by name (`boardKey`), and **buildFile-declared grids** — `HexGrid` under `Board` (parsed into `BoardDef.grid`, drawn when `visible` via a cached Path2D in MapWindow) with `HexGridNumbering` labels ("0101"-style; `locationName` uses the numbering def when present, hexrow naming otherwise; `axisName` ports `RegularGridNumbering.getName`). Sideways grids and descending numbering axes degrade gracefully (no grid / ascending).

### Legacy `.vsav` saves (old-format quirks that matter)

Old saves (VASSAL 3.2 era; fixture `tests/fixtures/legacy-save.vsav`) differ from modern stock saves in three ways, all handled in `vmod/vsav.ts`:

1. **Map ids, not names**: piece states say `Map0`/`Map1` — Java `UniqueIdManager` ids ("Map" + build index); lookups match name OR id (`normalizeMapName`).
2. **Boards restore via ASLBoardPicker's own `bd` command** (`bd\t` + descriptors: col, row, name-with-`r`-reversal-prefix, optional crop bounds, `VER`, overlays, SSR). We select the first non-Blank board and lazy-load its archive; re-export emits `bd\t0\t0\t<name>\t` because the jar's ASLBoardPicker ignores stock BoardPicker commands. Multi-board layouts / crop are a known simplification (TODO).
3. **Every on-map piece is wrapped in a singleton Stack AddPiece** (`type "stack"`). Stacks are dropped on import — members carry their own map/x/y, and a preserved stack would pin members to the stale stack point in the jar (StackMetrics draws members at the stack's position).

Also: Swing renders labels beginning `<html>` as HTML (scenario-setup labels); `Labeler.labelText()` converts those to plain multi-line text.

### SVG assets

Module counter SVGs may reference raster depictions (`xlink:href="svg/….png"`) and fonts (`url("../fonts/….ttf")`) **relative to the SVG's location in the archive**. Blob URLs can't resolve those and canvas rasterization requires self-contained SVGs, so `ModuleArchive.imageUrl` inlines archive-relative refs as data: URIs (`zip.ts inlineSvgRefs`) — without it those counters render as blank squares with only vector text.

## Board model (typical extension-heavy module)

- **Multiple Map windows**: a main table plus card/staging maps. Each Map is its own canvas + camera.
- **Z-order layers**: the main map's `LayeredPieceCollection layerOrder` (e.g. `…Terrain,…,Objectives,…,Vehicle,Infantry,Template`). A piece's z-index = index of its `Layer` property value in that list (the `mark;Layer` trait).
- **Background**: a board is one image, or composed of obstacle/terrain pieces; smoke/VFX are pieces on upper layers.
- **Lock**: `Immobilized` pieces don't drag; the UI also offers a manual lock toggle.

## Stack & conventions

- **Vite + TypeScript**, static output. Runtime dep: `fflate` (zip). No game framework. Dev-only: `jsdom` for DOM-parsing unit tests.
- **`tsc` is type-check only (`noEmit`)** — never commit compiled `.js` twins next to `.ts`; Vite bundles and vitest resolves `.ts` sources directly (see `vite.config.ts` resolve.extensions).
- **Rendering**: Canvas 2D per MapWindow. Draw order: boards → pieces by layer → selection/LOS overlay. Pointer Events (unified mouse/touch); keyboard dispatcher routes shortcuts to the selected piece's KeyCommands.
- Trait interface: `id`, `keyCommands()`, `handle(stroke)`, `draw(ctx,x,y,zoom)`, `getProperty(key)`, `state`. A `GamePiece` folds these across its chain.
- Keep files small and one-concept. Pure logic (parsers, trait math) must be unit-testable without a DOM.
- **No game/module names in committed code, comments, tests, or docs.** Cite format identifiers instead (trait ids, Java class names like `ASLBoardPicker`, buildFile paths); module-specific content lives in the gitignored local config/expectations files.

## UI shell

- **Two toolbar rows**: `ModuleToolbar` (src/ui/ModuleToolbar.ts) renders the module-declared buttons parsed into `ModuleModel.toolbar` (NotesWindow, ToolbarMenus with Java capture semantics, TurnTracker, GlobalMap, Map launch buttons, DiceButtons, ChartWindow); the `Toolbar` below it is the browser utility bar (map/board/edit/tool/zoom/save/load/selection). Hidden PieceWindows get no toolbar button and don't render in the palette; anonymous container widgets render their children in place, headerless. Toolbar parsing lives in `src/vmod/buildfile.ts` + pure types/resolution in `src/vmod/toolbar-defs.ts`; icons resolve module images or built-in SVGs (`src/ui/icons.ts`) — Java classpath paths like `/images/die.gif` are NOT in module zips.
- **WindowManager** (`src/ui/wm/`): adaptive in-page tool windows — floating drag/resize frames with z-stack and localStorage rect persistence on desktop/iPad; full-screen sheets + switcher bar under 720px (`matchMedia`). Pure geometry in `wm/window-layout.ts` (vitest'd). Windows: Overview (`OverviewMap.ts`, GlobalMap mini-map, drag pans main view), Notes (`NotesWindow.ts`, Scenario/Public/Private/Delayed with capture/Save/Cancel), Turn Counter (`TurnTrackerView.ts`), Charts (`ChartWindowView.ts`). ContextMenu stays a separate transient popup at z 1000.
- **Palette + counter preview**: single click selects a slot into the `PiecePreview` pane (composed canvas render via `src/board/piece-preview.ts` `renderPieceToCanvas`, Place button, drag-from-preview to the map); double-click places immediately. Layer-only slots get composed canvas thumbnails.
- **Save-stream codecs**: `src/vmod/notes.ts` (NOTES/PNOTES/PNOTE/SNOTE — verbatim TextConfigurer escapeNewlines port) and `src/vmod/turn.ts` (TURN state, CounterTurnLevel/ListTurnLevel advance/retreat port). Both are byte-round-trip tested against `tests/fixtures/example.vsav`. `vsav.ts` regenerates these; unknown commands still pass through preserved.
- **Responsive/iOS**: 100dvh app height, `env(safe-area-inset-*)` on bars, side panels become slide-over drawers ≤860px (start closed on phone-width loads), ≥40px touch targets on coarse pointers, pointer-capture try/catch pattern everywhere (copied from MapWindow).

## How to run

```bash
npm install
npx playwright install chromium   # once, for the verifiers
npm run dev        # http://localhost:5173  (also on LAN for iOS: host is on)
npm run typecheck  # tsc --noEmit (also the first step of build)
npm test           # vitest: parser + trait/codec round-trip tests (fast, no browser)
npm run build      # -> dist/ (static; see README "Production build & hosting")
npm run verify:smoke     # build + fast smoke: load, place, rotate, menu, layer, lock
npm run verify:scenario  # larger hotseat scenario (boards, cards, windows, saves)
npm run verify:grid      # hex-grid module: board archives, snapping, custom traits
npm run verify           # all three verifiers back to back
```
`npm test` includes jsdom-backed parsing tests plus fixture byte-round-trips for notes and turn commands. Tests/verifiers that exercise real module content read the gitignored `tests/fixtures/expectations.local.json` / `scripts/verify.config.local.mjs` (committed `.example` templates document the shape) and **skip cleanly when those are absent**.

Load a `.vmod` (and optional `.vmdx`/extension archives) via the multi-file picker, or auto-load with `?module=<url>&ext=<url>,<url>&board=<name>,…`. Bundled presets are **pure data**: one directory per module under `public/modules/<dir>/`, described by `public/modules/presets.json` (generate/refresh with `npm run presets` — it preserves hand-curated entries, which may add `defaultBoards`/`pieceScale`; both files are gitignored with the assets). `npm run build` copies `public/` into `dist/`, so a static deployment only needs the built `dist/` tree; `npm run dev` needs the same source `public/modules/` tree. See `.claude/skills/verify/SKILL.md` for the verification recipe.

## Status & risks

All three reference modules load and play (see PLAN.MD "Status"); `TODO.md` tracks the live checklist. Known limitations:
- **NamedKeyStrokes** (RotateRight, …): menu commands work; keyboard shortcuts on extension pieces need a name→physical-key map. Base pieces already rotate via raw keys (Ctrl+Right, unit-tested).
- Java VASSAL `.vsav` is the canonical save/load path; remaining work is fuller deck/list/window semantics and manual jar validation of exported saves.
- Unimplemented traits are no-ops (GlobalKeyCommand, stock `obs;` behaviors, `nonRect`, SendToLocation, SetGlobalProperty). Add as needed via the porting workflow.
- Custom module command encoders can't run; `.vsav` `!VCSK` obfuscation is implemented; BeanShell expressions are a safe subset only.
