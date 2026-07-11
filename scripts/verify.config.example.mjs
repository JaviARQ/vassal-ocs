/**
 * Copy to `verify.config.local.mjs` (gitignored) and fill in values for the
 * modules you bundle locally under public/modules/ — the committed verifier
 * scripts are module-agnostic and read everything module-specific from here.
 * A verifier whose section is missing skips with exit code 0.
 *
 * Conventions: "chit" = a unit counter/model, "terrain" = a lockable scenery
 * piece, "marker" = a status counter placed on/near a chit.
 */
export default {
  // verify:smoke — fast load/place/rotate/menu/layer/lock pass.
  smoke: {
    /** App query string: module + extensions + board auto-select list. */
    url: "/?module=/modules/<dir>/<module>.vmod&ext=/modules/<dir>/<ExtA>,/modules/<dir>/<ExtB>&board=<board name>",
    /** Palette label regexes for two placeable chits from different groups. */
    chitA: { place: /<chit a label>/i, probe: /<chit a family>/i },
    chitB: { place: /<chit b label>/i, probe: /<chit b family>/i },
  },

  // verify:scenario — full hotseat story on an extension-heavy module.
  scenario: {
    url: "/?module=/modules/<dir>/<module>.vmod&ext=<...>&board=<...>",
    titleIncludes: "<module name>",
    boardIncludes: "<selected board substring>",
    /** Boards contributed by board extensions (regex over board names). */
    extensionBoardRe: /<ext board names>/i,
    /** Predefined-setup .vsav boards exposed as composed boards. */
    composedSetups: [{ name: "<setup name>", minTiles: 4 }],
    selectSetup: "<setup name>",
    filterQuery: "<palette search that reveals a buried chit>",
    chitA: "<exact palette label>",
    chitALayerRe: /<layer image regex>/i,
    chitB: "<exact palette label>",
    chitBFallback: "<fallback label>",
    chitBLayerRe: /<layer image regex>/i,
    chitC: "<exact palette label>",
    chitByPath: { path: ["<group>", "<subgroup>", "<leaf group>"], label: "<label>" },
    terrainCandidates: ["<terrain slot labels to try>"],
    layerCommand: "<menu command that cycles a layer on chit B>",
    deckRe: /<card deck name>/i,
    diceMenu: { text: "<toolbar menu>", count: 12, item: "<dice button>" },
    mapMenu: { text: "<toolbar menu>", count: 5, item: "<map name>" },
    mainMap: "<main map name>",
    notesButton: "<NotesWindow button text>",
    submenu: { row: "<submenu row>", item: "<one item>", mustHave: ["<items>"], notTop: "<item folded out of top level>" },
    turnAfterNext: "<formatted turn after one Next>",
    turnReportRe: /<turn report substring>/,
    unsupported: "<an unsupported component name>",
  },

  // verify:grid — hex-grid module with lazy board archives + custom traits.
  grid: {
    /** Start-screen preset button text (from presets.json). */
    preset: "<preset name>",
    titleRe: /<module name>/,
    mainMap: "<main map name>",
    minBoards: 500,
    board: "<board id to select>",
    boardImage: "<board image entry>",
    hexA: "F5",
    hexACenter: { x: 0, y: 0 },
    hexB: "G5",
    hexC: "F7",
    rangeAC: 2,
    chitA: { name: "<palette label>", path: ["<group path>"] },
    chitB: { name: "<palette label>", path: ["<group path>"] },
    flipKey: "Control+f",
    concealOverlayRe: /<concealment overlay image>/i,
    triggerCommand: "<TriggerAction menu command>",
    markerSlot: { name: "<marker label>", path: ["<group path>"] },
    drCategory: "<DR category>",
    drRe: /\(<category> DR\) [1-6],[1-6]/,
    drSingleCategory: "<dr category>",
    drSingleRe: /\(<category> dr\) [1-6]/,
    chart: {
      id: "charts:<ChartWindow name>",
      tabs: ["<top-level tab names>"],
      nestedTab: "<tab with nested tabs>",
      nestedTabs: ["<nested tab names>"],
    },
    artProbe: { name: "<slot with legacy extensionless art>", path: ["<group path>"] },
    legacySave: { file: "tests/fixtures/legacy-save.vsav", boardImage: "<board image>", pieces: 0 },
  },
};
