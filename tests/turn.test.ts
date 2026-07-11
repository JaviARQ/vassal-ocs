import { readFileSync } from "node:fs";
import { unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import type { TurnLevelDef, TurnTrackerDef } from "../src/vmod/toolbar-defs";
import {
  decodeTurnCommand,
  encodeTurnCommand,
  formatTurn,
  initialTurnState,
  nextTurn,
  prevTurn,
  turnLevelValues,
} from "../src/vmod/turn";
import { COMMAND_SEPARATOR, decodeVassalSavedGame } from "../src/vmod/vsav";
import { existsSync } from "node:fs";
import { fixturePath } from "./helpers/local";

function counter(overrides: Partial<TurnLevelDef> = {}): TurnLevelDef {
  return {
    kind: "counter",
    name: "turn",
    property: "turn",
    start: 1,
    incr: 1,
    loop: false,
    loopLimit: -1,
    list: [],
    turnFormat: "$value$",
    children: [],
    ...overrides,
  };
}

function list(name: string, items: string[], children: TurnLevelDef[] = []): TurnLevelDef {
  return {
    kind: "list",
    name,
    property: name,
    start: 0,
    incr: 1,
    loop: false,
    loopLimit: -1,
    list: items,
    turnFormat: "$value$",
    children,
  };
}

/** Mirrors the example.vsav module's tracker: turn counter > player list > 7 phases. */
function fixtureTracker(): TurnTrackerDef {
  return {
    name: "Turn Counter",
    buttonText: " Turn Counter",
    reportFormat: "* <$playerId$> It is now turn $newTurn$",
    turnFormat: "$level1$ $level2$ $level3$ $level4$",
    levels: [
      counter({
        children: [
          list("player", ["Player A", "Player B"], [
            list("Phase", [
              "Command Phase",
              "Movement Phase",
              "Psychic Phase",
              "Shooting Phase",
              "Charge Phase",
              "Fight Phase",
              "Morale Phase",
            ]),
          ]),
        ],
      }),
    ],
  };
}

describe("turn advance semantics (Java TurnLevel port)", () => {
  it("starts at turn 1, Player A, Command Phase", () => {
    const def = fixtureTracker();
    const state = initialTurnState(def);
    expect(formatTurn(def, state)).toBe("1 Player A Command Phase");
  });

  it("advances the deepest level first and rolls over upward", () => {
    const def = fixtureTracker();
    const state = initialTurnState(def);
    nextTurn(def, state);
    expect(formatTurn(def, state)).toBe("1 Player A Movement Phase");
    // Finish all 7 phases -> Player B, phases reset.
    for (let i = 0; i < 6; i++) nextTurn(def, state);
    expect(formatTurn(def, state)).toBe("1 Player B Command Phase");
    // Finish Player B's 7 phases -> turn 2, Player A.
    for (let i = 0; i < 7; i++) nextTurn(def, state);
    expect(formatTurn(def, state)).toBe("2 Player A Command Phase");
  });

  it("prev undoes next exactly", () => {
    const def = fixtureTracker();
    const state = initialTurnState(def);
    const seen: string[] = [formatTurn(def, state)];
    for (let i = 0; i < 17; i++) {
      nextTurn(def, state);
      seen.push(formatTurn(def, state));
    }
    for (let i = seen.length - 2; i >= 0; i--) {
      prevTurn(def, state);
      expect(formatTurn(def, state)).toBe(seen[i]);
    }
  });

  it("exposes the level chain for the window rows", () => {
    const def = fixtureTracker();
    const state = initialTurnState(def);
    expect(turnLevelValues(def, state)).toEqual([
      { name: "turn", value: "1" },
      { name: "player", value: "Player A" },
      { name: "Phase", value: "Command Phase" },
    ]);
  });
});

describe("TURN command codec", () => {
  it("round-trips state through encode/decode", () => {
    const def = fixtureTracker();
    const state = initialTurnState(def);
    for (let i = 0; i < 9; i++) nextTurn(def, state);
    const cmd = encodeTurnCommand(def, state);
    expect(cmd.startsWith("TURNTurnTracker0\t")).toBe(true);
    const back = decodeTurnCommand(cmd, def);
    expect(back).not.toBeNull();
    expect(formatTurn(def, back!)).toBe(formatTurn(def, state));
    expect(encodeTurnCommand(def, back!)).toBe(cmd);
  });

  it("keeps the imported component id on re-encode", () => {
    const def = fixtureTracker();
    const state = initialTurnState(def, "TurnTracker3");
    expect(encodeTurnCommand(def, state).startsWith("TURNTurnTracker3\t")).toBe(true);
  });

  it("returns null for non-TURN commands", () => {
    expect(decodeTurnCommand("NOTES\thello", fixtureTracker())).toBeNull();
  });
});

describe.skipIf(!existsSync(fixturePath("example.vsav")))("fixture fidelity (example.vsav)", () => {
  it("re-encodes the real Java TURN command byte-identically", () => {
    const zip = unzipSync(new Uint8Array(readFileSync(fixturePath("example.vsav"))));
    const stream = decodeVassalSavedGame(zip.savedGame);
    const turnCommand = stream.split(COMMAND_SEPARATOR).find((c) => c.startsWith("TURN"));
    expect(turnCommand).toBeTruthy();

    const def = fixtureTracker();
    const decoded = decodeTurnCommand(turnCommand!, def);
    expect(decoded).not.toBeNull();
    expect(encodeTurnCommand(def, decoded!)).toBe(turnCommand);
  });
});
