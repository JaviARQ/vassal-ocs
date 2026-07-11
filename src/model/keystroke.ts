/**
 * VASSAL stores key commands as `keycode,modifiers` (Java AWT), sometimes as a
 * NamedKeyStroke (a logical name). We normalize both into a browser-friendly
 * KeyStroke and can match it against a DOM KeyboardEvent.
 *
 * Java InputEvent masks we care about (old + new "DOWN" masks are OR'd by VASSAL):
 *   SHIFT=1|64  CTRL=2|128  META=4|256  ALT=8|512
 */
export interface KeyStroke {
  /** Java virtual key code (VK_*), or 0 when this is a pure named stroke. */
  code: number;
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  meta: boolean;
  /** Logical name for a NamedKeyStroke (rare); matched by name if present. */
  name?: string;
}

const CTRL = 2 | 128;
const SHIFT = 1 | 64;
const META = 4 | 256;
const ALT = 8 | 512;

/** Parse `"39,130"` or a named stroke into a KeyStroke, or null if empty. */
export function parseKeyStroke(spec: string | null | undefined): KeyStroke | null {
  if (!spec) return null;
  const s = spec.trim();
  if (s.length === 0) return null;

  // Forms seen in the wild:
  //   "code,mods"            raw keystroke (e.g. "39,130")
  //   "code,mods,Name"       NamedKeyStroke with a synthetic code + logical name
  //   "Name"                 bare named stroke
  const parts = s.split(",");
  const code = parseInt(parts[0], 10);
  const mods = parseInt(parts[1], 10);
  if (parts.length >= 2 && !Number.isNaN(code) && !Number.isNaN(mods)) {
    const named = parts.length >= 3 && parts[2].trim().length > 0 ? parts.slice(2).join(",") : undefined;
    // Synthetic NamedKeyStroke codes (>= 0xE000/57344) aren't real keys — keep
    // the name for display/matching, and don't treat the code as a raw key.
    const isNamed = named != null || code >= 0xe000;
    return {
      code: isNamed ? 0 : code,
      ctrl: (mods & CTRL) !== 0,
      shift: (mods & SHIFT) !== 0,
      alt: (mods & ALT) !== 0,
      meta: (mods & META) !== 0,
      name: named,
    };
  }
  // Fall back to a bare named stroke.
  return { code: 0, ctrl: false, shift: false, alt: false, meta: false, name: s };
}

/** Build a KeyStroke from an explicit char + Java modifier mask (Embellishment). */
export function keyStrokeFromChar(ch: string, mods: number): KeyStroke | null {
  if (!ch || ch.length === 0) return null;
  const code = ch.toUpperCase().charCodeAt(0); // VK_* for A-Z/0-9 matches ASCII
  return {
    code,
    ctrl: (mods & CTRL) !== 0,
    shift: (mods & SHIFT) !== 0,
    alt: (mods & ALT) !== 0,
    meta: (mods & META) !== 0,
  };
}

/**
 * Map a Java VK_* code to the browser KeyboardEvent.code / .key we compare
 * against. We only need the codes VASSAL modules actually bind.
 */
const VK_TO_KEY: Record<number, string> = {
  37: "ArrowLeft",
  38: "ArrowUp",
  39: "ArrowRight",
  40: "ArrowDown",
  8: "Backspace",
  127: "Delete",
  27: "Escape",
  32: " ",
  10: "Enter",
  13: "Enter",
  9: "Tab",
};

const NAMED_TO_EVENT: Record<string, { key: string; ctrl?: boolean; shift?: boolean; alt?: boolean; meta?: boolean }> = {
  RotateRight: { key: "ArrowRight", ctrl: true },
  RotateLeft: { key: "ArrowLeft", ctrl: true },
};

/**
 * True if a DOM keyboard event matches this VASSAL keystroke. On macOS many
 * users press Cmd where modules expect Ctrl, so we accept either for `ctrl`.
 */
export function matchesEvent(ks: KeyStroke, e: KeyboardEvent): boolean {
  if (ks.name && NAMED_TO_EVENT[ks.name]) {
    const mapped = NAMED_TO_EVENT[ks.name];
    const wantCtrl = mapped.ctrl ?? false;
    const gotCtrl = e.ctrlKey || e.metaKey;
    if (wantCtrl !== gotCtrl) return false;
    if ((mapped.shift ?? false) !== e.shiftKey) return false;
    if ((mapped.alt ?? false) !== e.altKey) return false;
    if ((mapped.meta ?? false) !== e.metaKey && !wantCtrl) return false;
    return e.key === mapped.key || e.code === mapped.key || e.key === mapped.key.replace("Arrow", "");
  }

  const wantCtrl = ks.ctrl;
  const gotCtrl = e.ctrlKey || e.metaKey;
  if (wantCtrl !== gotCtrl) return false;
  if (ks.shift !== e.shiftKey) return false;
  if (ks.alt !== e.altKey) return false;

  const mapped = VK_TO_KEY[ks.code];
  if (mapped) return e.key === mapped || e.key === mapped.replace("Arrow", "");
  // Letters / digits: compare case-insensitively against VK ASCII.
  const ch = String.fromCharCode(ks.code).toLowerCase();
  return e.key.toLowerCase() === ch;
}

/** Structural equality of two strokes (Trigger/ReportState key matching). */
export function strokesEqual(a: KeyStroke | null, b: KeyStroke | null): boolean {
  if (!a || !b) return false;
  if (a.name || b.name) return a.name === b.name;
  return a.code === b.code && a.ctrl === b.ctrl && a.shift === b.shift && a.alt === b.alt && a.meta === b.meta;
}

/** Human-readable label for menus, e.g. "Ctrl+Right". Empty for unbound. */
export function keyStrokeLabel(ks: KeyStroke): string {
  if (ks.name && NAMED_TO_EVENT[ks.name]) {
    const mapped = NAMED_TO_EVENT[ks.name];
    const mods: string[] = [];
    if (mapped.ctrl) mods.push("Ctrl");
    if (mapped.shift) mods.push("Shift");
    if (mapped.alt) mods.push("Alt");
    if (mapped.meta) mods.push("Meta");
    return [...mods, mapped.key.replace("Arrow", "")].join("+");
  }
  // Java parity (MenuDisplayer.makeMenuItem): named keystrokes show no
  // accelerator at all — a raw internal name like "hc" is not a shortcut.
  if (ks.name) return "";
  if (!ks.code || ks.code < 32) return ""; // unbound / control char
  const mods: string[] = [];
  if (ks.ctrl) mods.push("Ctrl");
  if (ks.shift) mods.push("Shift");
  if (ks.alt) mods.push("Alt");
  if (ks.meta) mods.push("Meta");
  const key = VK_TO_KEY[ks.code] ?? String.fromCharCode(ks.code);
  return [...mods, key.replace("Arrow", "")].join("+");
}
