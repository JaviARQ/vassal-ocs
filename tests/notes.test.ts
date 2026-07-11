import { existsSync, readFileSync } from "node:fs";
import { unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import {
  decodeNotesCommand,
  emptyNotes,
  encodeNotesCommands,
  escapeNewlines,
  formatSecretDate,
  restoreNewlines,
} from "../src/vmod/notes";
import { COMMAND_SEPARATOR, decodeVassalSavedGame } from "../src/vmod/vsav";
import { fixturePath, localExpectations } from "./helpers/local";

describe("escapeNewlines / restoreNewlines (TextConfigurer port)", () => {
  it("encodes newlines as | and blank lines as ||", () => {
    expect(escapeNewlines("a\nb")).toBe("a|b");
    expect(escapeNewlines("a\n\nb")).toBe("a||b");
    expect(escapeNewlines("Force 1: red chits\n\nForce 2: blue chits")).toBe("Force 1: red chits||Force 2: blue chits");
  });

  it("keeps Java's quirks: trailing newline dropped, \\r collapsed, | escaped", () => {
    expect(escapeNewlines("a\n")).toBe("a"); // one trailing newline dropped
    expect(escapeNewlines("a\r\nb")).toBe("a|b");
    expect(escapeNewlines("with | pipe")).toBe("with \\| pipe");
    expect(escapeNewlines("")).toBe("");
    expect(escapeNewlines("\n")).toBe("");
  });

  it("round-trips arbitrary multi-line text", () => {
    for (const text of ["a\nb\nc", "a\n\n\nb", "pipes | and \\ slashes\nsecond", "solo"]) {
      expect(restoreNewlines(escapeNewlines(text))).toBe(text);
    }
  });
});

describe("notes command codec", () => {
  it("round-trips a full NotesState through encode/decode", () => {
    const state = emptyNotes();
    state.scenario = "Turn 3.\n\nSide B ahead.";
    state.publicNotes = "House rule: no | in names";
    state.privateNotes.set("Player A", "hide the leader chit\nbehind terrain");
    state.privateNotes.set("Player B", "");
    state.secretNotes.push({
      name: "Ambush",
      owner: "Player A",
      hidden: true,
      text: "Reserves arrive turn 2\nfrom the east | flank",
      date: "07/06/2026 9:15 PM",
      handle: "Player A",
    });

    const commands = encodeNotesCommands(state);
    expect(commands[0].startsWith("NOTES\t")).toBe(true);
    expect(commands[1].startsWith("PNOTES\t")).toBe(true);

    const back = emptyNotes();
    for (const cmd of commands) expect(decodeNotesCommand(cmd, back)).toBe(true);
    expect(back).toEqual(state);
  });

  it("always emits NOTES and PNOTES even when empty (Java parity)", () => {
    const commands = encodeNotesCommands(emptyNotes());
    expect(commands).toEqual(["NOTES\t", "PNOTES\t"]);
  });

  it("replaces a secret note on re-send (reveal semantics)", () => {
    const state = emptyNotes();
    decodeNotesCommand("SNOTE\tAmbush\tPlayer A\ttrue\tsurprise\t\tPlayer A", state);
    expect(state.secretNotes[0].hidden).toBe(true);
    decodeNotesCommand("SNOTE\tAmbush\tPlayer A\tfalse\tsurprise\t\tPlayer A", state);
    expect(state.secretNotes).toHaveLength(1);
    expect(state.secretNotes[0].hidden).toBe(false);
  });

  it("tolerates old saves without date/handle tokens", () => {
    const state = emptyNotes();
    expect(decodeNotesCommand("SNOTE\tOld\tOwner\ttrue\ttext only", state)).toBe(true);
    expect(state.secretNotes[0]).toEqual({
      name: "Old",
      owner: "Owner",
      hidden: true,
      text: "text only",
      date: "",
      handle: "",
    });
  });

  it("ignores non-notes commands", () => {
    expect(decodeNotesCommand("TURNTurnTracker0\t0|1", emptyNotes())).toBe(false);
    expect(decodeNotesCommand("+/123/piece;/state", emptyNotes())).toBe(false);
  });
});

const EXP = localExpectations().example;
const HAVE_FIXTURE = EXP != null && existsSync(fixturePath("example.vsav"));

describe.skipIf(!HAVE_FIXTURE)("fixture fidelity (example.vsav)", () => {
  it("re-encodes the real Java notes commands byte-identically", () => {
    const zip = unzipSync(new Uint8Array(readFileSync(fixturePath("example.vsav"))));
    const stream = decodeVassalSavedGame(zip.savedGame);
    const noteCommands = stream
      .split(COMMAND_SEPARATOR)
      .filter((c) => c.startsWith("NOTES\t") || c.startsWith("PNOTES\t") || c.startsWith("PNOTE\t") || c.startsWith("SNOTE\t"));
    expect(noteCommands.length).toBeGreaterThan(0);
    expect(noteCommands.some((c) => c.startsWith("NOTES\t") && c.includes(EXP!.notesContain))).toBe(true);

    const state = emptyNotes();
    for (const cmd of noteCommands) expect(decodeNotesCommand(cmd, state)).toBe(true);
    const reencoded = encodeNotesCommands(state);
    // Every distinct fixture command must be reproduced exactly.
    for (const cmd of new Set(noteCommands)) {
      expect(reencoded).toContain(cmd);
    }
  });
});

describe("formatSecretDate", () => {
  it("matches Java's MM/dd/yyyy h:mm a", () => {
    expect(formatSecretDate(new Date(2026, 6, 6, 21, 5))).toBe("07/06/2026 9:05 PM");
    expect(formatSecretDate(new Date(2026, 0, 1, 0, 0))).toBe("01/01/2026 12:00 AM");
    expect(formatSecretDate(new Date(2026, 11, 31, 12, 30))).toBe("12/31/2026 12:30 PM");
  });
});
