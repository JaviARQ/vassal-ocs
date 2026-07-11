import { existsSync, readFileSync } from "node:fs";
import { unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import type { MapDef, ModuleModel } from "../src/vmod/buildfile";
import {
  decodeVassalSavedGame,
  encodeVassalSavedGame,
  parseAddPieceCommand,
  parseBasicPieceState,
  parseBoardPickerCommand,
  readVassalSave,
  writeVassalSave,
} from "../src/vmod/vsav";
import { fixturePath, localExpectations } from "./helpers/local";

describe("VASSAL .vsav streams", () => {
  it("round-trips VASSAL !VCSK obfuscation", () => {
    const text = "begin_save\x1bTableBoardPicker\t2x2 Tundra\t0\t0\x1bend_save";

    expect(decodeVassalSavedGame(encodeVassalSavedGame(text))).toBe(text);
  });

  it("parses board picker and AddPiece commands", () => {
    expect(parseBoardPickerCommand("TableBoardPicker\t2x2 Tundra\t0\t0\t2x2 Buffer/rev\t1\t0")).toEqual({
      mapName: "Table",
      tiles: [
        { boardName: "2x2 Tundra", x: 0, y: 0, reversed: false },
        { boardName: "2x2 Buffer", x: 1, y: 0, reversed: true },
      ],
    });

    const add = parseAddPieceCommand("+/id-1/piece;;;token.gif;Victory Marker/Table;383;833;CAT:2349;0");
    expect(add).toMatchObject({ id: "id-1", type: "piece;;;token.gif;Victory Marker" });
    expect(parseBasicPieceState(add!.state)).toMatchObject({ mapId: "Table", x: 383, y: 833, gpid: "CAT:2349" });
  });
});

// Fixture-coupled tests: they need the local (uncommitted) example.vsav plus
// the expectations file that describes its contents.
const EXP = localExpectations().example;
const HAVE_FIXTURE = EXP != null && existsSync(fixturePath("example.vsav"));

describe.skipIf(!HAVE_FIXTURE)("real Java .vsav fixture (example.vsav)", () => {
  it("imports the provided Java VASSAL example save", () => {
    const imported = readVassalSave(readFixture(), fixtureModel());
    const table = imported.mapStates.get(EXP!.tableName);

    expect(table?.boardImage).toMatch(/^save:/);
    expect(table?.pieces.length).toBe(EXP!.pieceCount);
    expect(table?.pieces.some((piece) => piece.name() === EXP!.pieceName)).toBe(true);
    expect(imported.notes.scenario).toContain(EXP!.notesContain);
    expect(imported.preservedCommands.some((command) => command.startsWith(EXP!.preservedPrefix))).toBe(true);
  });

  it("exports a Java VASSAL-compatible zip instead of browser JSON", () => {
    const model = fixtureModel();
    const imported = readVassalSave(readFixture(), model);
    const exported = writeVassalSave({
      model,
      mapStates: imported.mapStates,
      preservedCommands: imported.preservedCommands,
      notes: imported.notes,
    });
    const zip = unzipSync(exported);
    const text = decodeVassalSavedGame(zip.savedGame);

    expect(Object.keys(zip).sort()).toEqual(["moduledata", "savedGame", "savedata"]);
    expect(text).toContain("begin_save");
    expect(text).toContain(EXP!.boardCommand);
    expect(text).toContain("+/");
    expect(text).toContain("NOTES\t" + EXP!.notesContain);
    expect(text).toContain(EXP!.preservedPrefix);
    expect(text).toContain("end_save");
  });
});

function readFixture(): Uint8Array {
  return new Uint8Array(readFileSync(fixturePath("example.vsav")));
}

/** A minimal ModuleModel matching the module the fixture was saved from. */
function fixtureModel(): ModuleModel {
  return {
    name: EXP!.moduleName,
    version: EXP!.version,
    maps: [tableMap(), ...EXP!.sideMaps.map((name) => emptyMap(name))],
    diceButtons: [],
    predefinedSetups: [],
    palette: null,
    prototypes: new Map(),
    toolbar: [],
    hasDiceBot: false,
  };
}

function tableMap(): MapDef {
  return {
    name: EXP!.tableName,
    buttonName: EXP!.tableName,
    boards: EXP!.tableBoards.map(([name, image]) => ({ name, image, reversible: false })),
    drawPiles: [],
    layerOrder: [],
    losScale: 0,
  };
}

function emptyMap(name: string): MapDef {
  return {
    name,
    buttonName: name,
    boards: [{ name: EXP!.sideMapBoard[0], image: EXP!.sideMapBoard[1], reversible: false }],
    drawPiles: [],
    layerOrder: [],
    losScale: 0,
  };
}
