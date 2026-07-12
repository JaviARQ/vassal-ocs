// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { unzipSync } from "fflate";
import { parseBuildFile, type ModuleModel } from "../src/vmod/buildfile";
import {
  buildVassalSaveText,
  importVassalSaveText,
  parseBdBoardCommand,
  readVassalSave,
} from "../src/vmod/vsav";
import { fixturePath, localExpectations, repoPath } from "./helpers/local";

// A real legacy-era save (VASSAL 3.2): board set through ASLBoardPicker's
// `bd` command, pieces recorded against the map *id* "Map0" (old saves used
// UniqueIdManager ids, not map names), and every piece wrapped in a singleton
// Stack AddPiece. tests/fixtures/legacy-save.vsav is the (uncommitted)
// fixture; expectations.local.json describes its contents.
const LOCAL = localExpectations();
const SAVE = fixturePath("legacy-save.vsav");
const HAVE =
  LOCAL.complex != null &&
  LOCAL.legacySave != null &&
  existsSync(SAVE) &&
  existsSync(repoPath(join(LOCAL.complex.dir, LOCAL.complex.archive)));

function modelWithBoards(): ModuleModel {
  const dir = repoPath(LOCAL.complex!.dir);
  const vmod = readFileSync(join(dir, LOCAL.complex!.archive));
  const xml = new TextDecoder().decode(
    unzipSync(new Uint8Array(vmod), { filter: (f) => f.name === "buildFile" })["buildFile"],
  );
  const model = parseBuildFile(xml);
  // The app grafts manifest boards onto the map at runtime; simulate that.
  const manifest: Array<{ file: string; name: string }> = JSON.parse(
    readFileSync(join(dir, "boards/manifest.json"), "utf8"),
  );
  for (const b of manifest) {
    model.maps[0].boards.push({ id: b.file, name: b.name, image: "", reversible: false, archiveFile: b.file });
  }
  return model;
}

describe("ASLBoardPicker bd command", () => {
  it("parses multi-board layouts with crop/VER noise and reversed names", () => {
    expect(
      parseBdBoardCommand("bd\t0\t0\ty\t0\t0\t1181\t-1\tVER\t6.0\tbd\t0\t1\tBlank0\tVER\t6.0\tbd\t1\t0\tBlank1\tVER\t6.0\t"),
    ).toEqual([
      { col: 0, row: 0, boardName: "y", reversed: false, crop: { x1: 0, y1: 0, x2: 1181, y2: -1 } },
      { col: 0, row: 1, boardName: "Blank0", reversed: false },
      { col: 1, row: 0, boardName: "Blank1", reversed: false },
    ]);
    // Leading "r" = reversed — except boards literally named r / rdx.
    expect(parseBdBoardCommand("bd\t0\t0\tr42\tVER\t6.0\t")).toEqual([
      { col: 0, row: 0, boardName: "42", reversed: true },
    ]);
    expect(parseBdBoardCommand("bd\t0\t0\tr\t")).toEqual([
      { col: 0, row: 0, boardName: "r", reversed: false },
    ]);
    expect(parseBdBoardCommand("TableBoardPicker\t2x2 Tundra\t0\t0")).toBeNull();
  });
});

describe("stack member map adoption", () => {
  it("members without their own map adopt the stack's map and position", () => {
    const model = parseBuildFile(`<?xml version="1.0"?>
<VASSAL.build.GameModule name="M" version="1">
  <VASSAL.build.module.Map mapName="Main"/>
</VASSAL.build.GameModule>`);
    const text = [
      "begin_save",
      // Modern save shape: stacked pieces carry x/y but mapId "null"; the
      // stack command that follows lists its members by AddPiece id.
      "+/101/piece;;;a.gif;Leader/null;1860;1227;9;0",
      "+/102/piece;;;b.gif;Escort/null;1860;1227;10;0",
      // Real saves end the stack state with a bare backslash.
      "+/200/stack/Main;1860;1227;999;101;102\\",
      "end_save",
    ].join("\x1b");
    const state = importVassalSaveText(text, model);
    const main = state.mapStates.get("Main");
    expect(main?.pieces.map((p) => p.name()).sort()).toEqual(["Escort", "Leader"]);
    expect(main?.pieces.every((p) => p.x === 1860 && p.y === 1227)).toBe(true);
    // Neither the stack nor the adopted members stay preserved.
    expect(state.preservedCommands.filter((c) => c.startsWith("+/"))).toEqual([]);
  });
});

describe("old-format map ids", () => {
  it('resolves "Map<N>" ids to the map at that build index', () => {
    const model = parseBuildFile(`<?xml version="1.0"?>
<VASSAL.build.GameModule name="M" version="1">
  <VASSAL.build.module.Map mapName="Main Map"/>
  <VASSAL.build.module.Map mapName="Casualties"/>
</VASSAL.build.GameModule>`);
    const text = [
      "begin_save",
      "+/1/piece;;;x.gif;A/Map0;10;20;;0",
      "+/2/piece;;;x.gif;B/Map1;30;40;;0",
      "+/3/stack/Map0;10;20",
      "end_save",
    ].join("\x1b");
    const state = importVassalSaveText(text, model);
    expect(state.mapStates.get("Main Map")?.pieces.map((p) => p.name())).toEqual(["A"]);
    expect(state.mapStates.get("Casualties")?.pieces.map((p) => p.name())).toEqual(["B"]);
    // Stacks are dropped: members carry their own positions, and a preserved
    // stack would pin them to the stale stack point in the jar.
    expect(state.preservedCommands.some((c) => c.includes("stack"))).toBe(false);
  });
});

describe.skipIf(!HAVE)("legacy-era save fixture (legacy-save.vsav)", () => {
  it("imports the board and every piece onto the main map", () => {
    const exp = LOCAL.legacySave!;
    const model = modelWithBoards();
    const state = readVassalSave(new Uint8Array(readFileSync(SAVE)), model);

    const main = state.mapStates.get(LOCAL.complex!.mainMap);
    expect(main?.boardImage).toBe(exp.boardImage);
    expect(main?.pieces.length).toBe(exp.pieces);
    // The bd command was consumed; only unrelated commands stay preserved.
    expect(state.preservedCommands.every((c) => !c.startsWith("bd\t"))).toBe(true);
    expect(state.notes.scenario).toContain(exp.scenarioContains);

    // Re-export restores the board through ASLBoardPicker's own format —
    // the original command verbatim, so crop/VER/filler tokens survive.
    const out = buildVassalSaveText({
      model,
      mapStates: state.mapStates,
      preservedCommands: state.preservedCommands,
      notes: state.notes,
    });
    expect(out.split("\x1b").some((c) => c.startsWith(`bd\t0\t0\t${exp.boardImage.replace(/^bd/, "")}\t`))).toBe(true);

    // And the re-exported text imports back to the same table.
    const again = importVassalSaveText(out, model);
    expect(again.mapStates.get(LOCAL.complex!.mainMap)?.boardImage).toBe(exp.boardImage);
    expect(again.mapStates.get(LOCAL.complex!.mainMap)?.pieces.length).toBe(exp.pieces);
  }, 60000);
});
