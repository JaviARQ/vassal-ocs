import { describe, expect, it } from "vitest";
import { keyStrokeFromChar, keyStrokeLabel, matchesEvent, parseKeyStroke } from "../src/model/keystroke";

/** Minimal stand-in for a DOM KeyboardEvent (only the fields we match on). */
function ev(init: { key: string; ctrl?: boolean; shift?: boolean; alt?: boolean; meta?: boolean }): KeyboardEvent {
  return {
    key: init.key,
    code: init.key,
    ctrlKey: init.ctrl ?? false,
    shiftKey: init.shift ?? false,
    altKey: init.alt ?? false,
    metaKey: init.meta ?? false,
  } as unknown as KeyboardEvent;
}

describe("parseKeyStroke", () => {
  it("parses a raw code,mods pair (old + DOWN modifier masks OR'd)", () => {
    const ks = parseKeyStroke("39,130")!; // VK_RIGHT, CTRL_MASK|CTRL_DOWN_MASK
    expect(ks).toMatchObject({ code: 39, ctrl: true, shift: false, alt: false, meta: false });
    expect(ks.name).toBeUndefined();
  });

  it("parses shift/alt masks", () => {
    expect(parseKeyStroke("65,65")).toMatchObject({ code: 65, shift: true, ctrl: false });
    expect(parseKeyStroke("54,520")).toMatchObject({ alt: true, ctrl: false, shift: false });
  });

  it("parses a NamedKeyStroke triple, keeping the name and dropping the synthetic code", () => {
    const ks = parseKeyStroke("57392,0,RotateRight")!;
    expect(ks.code).toBe(0);
    expect(ks.name).toBe("RotateRight");
  });

  it("treats a synthetic code (>= 0xE000) without a name as unbound", () => {
    expect(parseKeyStroke("57392,0")!.code).toBe(0);
  });

  it("parses a bare named stroke and rejects empties", () => {
    expect(parseKeyStroke("ModelInfo")).toMatchObject({ code: 0, name: "ModelInfo" });
    expect(parseKeyStroke("")).toBeNull();
    expect(parseKeyStroke(null)).toBeNull();
    expect(parseKeyStroke("   ")).toBeNull();
  });
});

describe("keyStrokeFromChar", () => {
  it("maps a char + Java modifier mask (Embellishment style)", () => {
    expect(keyStrokeFromChar("r", 130)).toMatchObject({ code: 82, ctrl: true });
    expect(keyStrokeFromChar("", 0)).toBeNull();
  });
});

describe("matchesEvent", () => {
  it("matches arrow keys via the VK map", () => {
    const ks = parseKeyStroke("39,130")!;
    expect(matchesEvent(ks, ev({ key: "ArrowRight", ctrl: true }))).toBe(true);
    expect(matchesEvent(ks, ev({ key: "ArrowRight" }))).toBe(false); // ctrl required
    expect(matchesEvent(ks, ev({ key: "ArrowLeft", ctrl: true }))).toBe(false);
  });

  it("accepts Cmd where a module expects Ctrl (macOS)", () => {
    const ks = parseKeyStroke("39,130")!;
    expect(matchesEvent(ks, ev({ key: "ArrowRight", meta: true }))).toBe(true);
  });

  it("matches letters case-insensitively against the VK ASCII code", () => {
    const ks = keyStrokeFromChar("R", 130)!;
    expect(matchesEvent(ks, ev({ key: "r", ctrl: true }))).toBe(true);
    expect(matchesEvent(ks, ev({ key: "R", ctrl: true }))).toBe(true);
  });

  it("matches known NamedKeyStrokes through their mapped physical keys", () => {
    const ks = parseKeyStroke("57392,0,RotateRight")!;
    expect(matchesEvent(ks, ev({ key: "ArrowRight", ctrl: true }))).toBe(true);
    expect(matchesEvent(ks, ev({ key: "ArrowRight" }))).toBe(false);
  });
});

describe("keyStrokeLabel", () => {
  it("renders modifier+key labels", () => {
    expect(keyStrokeLabel(parseKeyStroke("39,130")!)).toBe("Ctrl+Right");
    expect(keyStrokeLabel(keyStrokeFromChar("r", 130)!)).toBe("Ctrl+R");
    expect(keyStrokeLabel(parseKeyStroke("57392,0,RotateRight")!)).toBe("Ctrl+Right");
  });

  it("shows nothing for unmapped named strokes (Java: no accelerator) or unbound strokes", () => {
    expect(keyStrokeLabel(parseKeyStroke("ModelInfo")!)).toBe("");
    expect(keyStrokeLabel(parseKeyStroke("57392,0")!)).toBe("");
  });
});
