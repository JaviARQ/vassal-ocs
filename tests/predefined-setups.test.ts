import { zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import type { MapDef } from "../src/vmod/buildfile";
import { applyPredefinedSetupBoards, parseBoardPickerCommands } from "../src/vmod/predefined-setups";
import { decodeVassalSavedGame } from "../src/vmod/vsav";
import type { ModuleArchive } from "../src/vmod/zip";

describe("predefined setup board layouts", () => {
  it("parses TableBoardPicker commands from decoded saved games", () => {
    const text = [
      "ignored",
      "TableBoardPicker\t2x2 Meadow\t0\t0\t2x2 Meadow Tile 1\t0\t1\t2x2 Buffer\t2\t0",
    ].join("\x1b");

    expect(parseBoardPickerCommands(text)).toEqual([
      {
        mapName: "Table",
        tiles: [
          { boardName: "2x2 Meadow", x: 0, y: 0 },
          { boardName: "2x2 Meadow Tile 1", x: 0, y: 1 },
          { boardName: "2x2 Buffer", x: 2, y: 0 },
        ],
      },
    ]);
  });

  it("decodes VASSAL-obfuscated savedGame streams", () => {
    const text = "TableBoardPicker\t2x2 Meadow\t0\t0";

    expect(decodeVassalSavedGame(obfuscate(text))).toBe(text);
  });

  it("adds predefined .vsav setups as composed Table boards", () => {
    const maps = [tableMap()];
    const vsav = zipSync({
      savedGame: obfuscate("TableBoardPicker\t2x2 Meadow\t0\t0\t2x2 Meadow Tile 1\t1\t0"),
      savedata: new Uint8Array(),
      moduledata: new Uint8Array(),
    });
    const archive = {
      bytes: (name: string) => (name === "4x4Meadow.vsav" ? vsav : null),
    } as ModuleArchive;

    applyPredefinedSetupBoards(
      maps,
      [{ name: "4x4 Meadow", file: "4x4Meadow.vsav", isMenu: false, useFile: true, menu: [] }],
      archive,
    );

    expect(maps[0].boards[0]).toMatchObject({
      id: "setup:4x4Meadow.vsav",
      name: "4x4 Meadow",
      image: "",
      tiles: [
        { boardName: "2x2 Meadow", image: "meadow_2.png", x: 0, y: 0 },
        { boardName: "2x2 Meadow Tile 1", image: "tile1.png", x: 1, y: 0 },
      ],
    });
  });
});

function tableMap(): MapDef {
  return {
    name: "Table",
    buttonName: "Table",
    boards: [
      { name: "2x2 Meadow", image: "meadow_2.png", reversible: false },
      { name: "2x2 Meadow Tile 1", image: "tile1.png", reversible: false },
    ],
    drawPiles: [],
    layerOrder: [],
    losScale: 25,
  };
}

function obfuscate(text: string): Uint8Array {
  const key = 0x5a;
  const raw = new TextEncoder().encode(text);
  const body = Array.from(raw, (byte) => (byte ^ key).toString(16).padStart(2, "0")).join("");
  return new TextEncoder().encode("!VCSK" + key.toString(16).padStart(2, "0") + body);
}
