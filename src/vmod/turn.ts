/**
 * VASSAL TurnTracker runtime state + save-command codec, ported from
 * VASSAL/build/module/turn/{TurnTracker,TurnLevel,CounterTurnLevel,ListTurnLevel}.java.
 *
 * Save command: "TURN" + <component id> + "\t" + state, where
 *   state           = SequenceEncoder('|'): currentLevel, <level state>...
 *   counter state   = SequenceEncoder(';'): current, currentSubLevel, loop, loopLimit, <child state>...
 *   list state      = SequenceEncoder(';'): current, currentSubLevel, first, "b,b,..." actives, <child state>...
 */

import { SequenceDecoder, SequenceEncoder } from "./sequence";
import type { TurnLevelDef, TurnTrackerDef } from "./toolbar-defs";

export interface TurnLevelState {
  /** Counter value, or index into the list. */
  current: number;
  currentSubLevel: number;
  /** counter-only (persisted in the save stream, seeded from the def) */
  loop: boolean;
  loopLimit: number;
  /** list-only */
  first: number;
  active: boolean[];
  rolledOver: boolean;
  subLevelRolledOver: boolean;
  children: TurnLevelState[];
}

export interface TurnState {
  /** Save-command component id (e.g. "TurnTracker0"); preserved on import. */
  id: string;
  currentLevel: number;
  levels: TurnLevelState[];
}

export const TURN_PREFIX = "TURN";
export const DEFAULT_TURN_ID = "TurnTracker0";

export function initialTurnState(def: TurnTrackerDef, id = DEFAULT_TURN_ID): TurnState {
  return { id, currentLevel: 0, levels: def.levels.map(initialLevelState) };
}

function initialLevelState(def: TurnLevelDef): TurnLevelState {
  return {
    current: def.kind === "counter" ? def.start : 0,
    currentSubLevel: 0,
    loop: def.loop,
    loopLimit: def.loopLimit,
    first: 0,
    active: def.list.map(() => true),
    rolledOver: false,
    subLevelRolledOver: false,
    children: def.children.map(initialLevelState),
  };
}

// ---- codec -----------------------------------------------------------------

export function decodeTurnCommand(command: string, def: TurnTrackerDef): TurnState | null {
  if (!command.startsWith(TURN_PREFIX)) return null;
  const tab = command.indexOf("\t");
  if (tab < 0) return null;
  const id = command.substring(TURN_PREFIX.length, tab);
  try {
    const sd = new SequenceDecoder(command.substring(tab + 1), "|");
    const currentLevel = sd.nextInt(0);
    const levels = def.levels.map((levelDef) => decodeLevel(levelDef, sd.nextTokenOr("")));
    return { id: id || DEFAULT_TURN_ID, currentLevel, levels };
  } catch {
    return null;
  }
}

function decodeLevel(def: TurnLevelDef, code: string): TurnLevelState {
  const state = initialLevelState(def);
  const sd = new SequenceDecoder(code, ";");
  state.current = sd.nextInt(def.kind === "counter" ? def.start : 0);
  state.currentSubLevel = sd.nextInt(0);
  if (def.kind === "counter") {
    state.loop = sd.nextBoolean(false);
    state.loopLimit = sd.nextInt(-1);
  } else {
    state.first = sd.nextInt(0);
    const actives = sd.nextStringArray(0);
    state.active = def.list.map((_, i) => (i < actives.length ? actives[i] === "true" : true));
  }
  state.children = def.children.map((childDef) => decodeLevel(childDef, sd.nextTokenOr("")));
  return state;
}

export function encodeTurnCommand(def: TurnTrackerDef, state: TurnState): string {
  const se = new SequenceEncoder("|");
  se.append(state.currentLevel);
  def.levels.forEach((levelDef, i) => se.append(encodeLevel(levelDef, state.levels[i])));
  return `${TURN_PREFIX}${state.id}\t${se.getValue()}`;
}

function encodeLevel(def: TurnLevelDef, state: TurnLevelState): string {
  const se = new SequenceEncoder(";");
  se.append(state.current).append(state.currentSubLevel);
  if (def.kind === "counter") {
    se.append(state.loop).append(state.loopLimit);
  } else {
    se.append(state.first).append(state.active.map((b) => String(b)).join(","));
  }
  def.children.forEach((childDef, i) => se.append(encodeLevel(childDef, state.children[i])));
  return se.getValue();
}

// ---- advance / retreat (Java TurnLevel semantics) ----------------------------

/** TurnTracker.next() */
export function nextTurn(def: TurnTrackerDef, state: TurnState): void {
  stepTurn(def, state, +1);
}

/** TurnTracker.prev() */
export function prevTurn(def: TurnTrackerDef, state: TurnState): void {
  stepTurn(def, state, -1);
}

function stepTurn(def: TurnTrackerDef, state: TurnState, dir: 1 | -1): void {
  if (def.levels.length === 0) return;
  let levelDef = def.levels[state.currentLevel];
  let level = state.levels[state.currentLevel];
  const initialLevel = state.currentLevel;
  if (dir > 0) advance(levelDef, level);
  else retreat(levelDef, level);
  while (level.rolledOver) {
    state.currentLevel += dir;
    if (state.currentLevel >= def.levels.length) state.currentLevel = 0;
    if (state.currentLevel < 0) state.currentLevel = def.levels.length - 1;
    levelDef = def.levels[state.currentLevel];
    level = state.levels[state.currentLevel];
    if (initialLevel !== state.currentLevel) {
      if (dir > 0) setLow(levelDef, level);
      else setHigh(levelDef, level);
    } else {
      break; // all inactive — prevent an infinite loop
    }
  }
}

/** TurnLevel.advance() — the shared sub-level walk. */
function baseAdvance(def: TurnLevelDef, st: TurnLevelState): void {
  st.rolledOver = false;
  st.subLevelRolledOver = false;
  if (def.children.length > 0) {
    const initial = st.currentSubLevel;
    let subDef = def.children[st.currentSubLevel];
    let sub = st.children[st.currentSubLevel];
    advance(subDef, sub);
    while (sub.rolledOver) {
      st.currentSubLevel++;
      if (st.currentSubLevel >= def.children.length) {
        st.currentSubLevel = 0;
        st.subLevelRolledOver = true;
      }
      subDef = def.children[st.currentSubLevel];
      sub = st.children[st.currentSubLevel];
      if (initial !== st.currentSubLevel) setLow(subDef, sub);
      else break;
    }
  }
}

function baseRetreat(def: TurnLevelDef, st: TurnLevelState): void {
  st.rolledOver = false;
  st.subLevelRolledOver = false;
  if (def.children.length > 0) {
    const initial = st.currentSubLevel;
    let subDef = def.children[st.currentSubLevel];
    let sub = st.children[st.currentSubLevel];
    retreat(subDef, sub);
    while (sub.rolledOver) {
      st.currentSubLevel--;
      if (st.currentSubLevel < 0) {
        st.currentSubLevel = def.children.length - 1;
        st.subLevelRolledOver = true;
      }
      subDef = def.children[st.currentSubLevel];
      sub = st.children[st.currentSubLevel];
      if (initial !== st.currentSubLevel) setHigh(subDef, sub);
      else break;
    }
  }
}

function advance(def: TurnLevelDef, st: TurnLevelState): void {
  if (def.kind === "counter") {
    baseAdvance(def, st);
    if (def.children.length === 0 || st.subLevelRolledOver) {
      st.current += def.incr;
      if (st.loop && st.current > st.loopLimit) {
        st.current = def.start;
        st.rolledOver = true;
      }
    }
    return;
  }
  // ListTurnLevel.advance()
  const isCurrentInactive = st.current < st.active.length && !st.active[st.current];
  if (isCurrentInactive) {
    const subDef = def.children[st.currentSubLevel];
    if (subDef) reset(subDef, st.children[st.currentSubLevel]);
    st.rolledOver = false;
    st.subLevelRolledOver = false;
  } else {
    baseAdvance(def, st);
  }
  if (def.children.length === 0 || isCurrentInactive || st.subLevelRolledOver) {
    let done = false;
    for (let i = 0; i < def.list.length && !done; i++) {
      st.current++;
      if (st.current >= def.list.length) st.current = 0;
      if (st.current === st.first) st.rolledOver = true;
      done = st.active[st.current];
    }
    if (!done) st.rolledOver = true;
  }
}

function retreat(def: TurnLevelDef, st: TurnLevelState): void {
  if (def.kind === "counter") {
    const oldCurrent = st.current;
    baseRetreat(def, st);
    if (def.children.length === 0 || st.subLevelRolledOver) {
      st.current -= def.incr;
      if (st.loop && oldCurrent <= def.start) {
        st.current = st.loopLimit;
        st.rolledOver = true;
      }
    }
    return;
  }
  // ListTurnLevel.retreat()
  const isCurrentInactive = st.current < st.active.length && !st.active[st.current];
  if (isCurrentInactive) {
    const subDef = def.children[st.currentSubLevel];
    if (subDef) setHigh(subDef, st.children[st.currentSubLevel]);
    st.rolledOver = false;
    st.subLevelRolledOver = false;
  } else {
    baseRetreat(def, st);
  }
  if (def.children.length === 0 || isCurrentInactive || st.subLevelRolledOver) {
    let done = false;
    for (let i = 0; i < def.list.length && !done; i++) {
      if (st.current === st.first) st.rolledOver = true;
      st.current--;
      if (st.current < 0 || st.current > def.list.length - 1) st.current = def.list.length - 1;
      done = st.active[st.current];
    }
    if (!done) st.rolledOver = true;
  }
}

function reset(def: TurnLevelDef, st: TurnLevelState): void {
  def.children.forEach((childDef, i) => reset(childDef, st.children[i]));
  st.currentSubLevel = 0;
  if (def.kind === "list") st.active = def.list.map(() => true);
  setLow(def, st);
}

function setLow(def: TurnLevelDef, st: TurnLevelState): void {
  if (def.kind === "counter") {
    st.current = def.start;
    st.rolledOver = false;
  } else {
    st.current = st.first;
    st.rolledOver = false;
    if ((st.current < st.active.length && !st.active[st.current]) || (def.list.length === 0 && def.children.length === 0)) {
      advance(def, st);
    }
  }
  if (def.children.length > 0) {
    st.currentSubLevel = 0;
    setLow(def.children[0], st.children[0]);
  }
}

function setHigh(def: TurnLevelDef, st: TurnLevelState): void {
  if (def.kind === "counter") {
    st.current = st.loopLimit;
    st.rolledOver = false;
  } else {
    st.rolledOver = false;
    st.current = st.first;
    let highIndex = st.current - 1;
    if (highIndex < 0) highIndex = def.list.length - 1;
    if (highIndex >= 0) st.current = highIndex;
    if ((st.current < st.active.length && !st.active[st.current]) || (highIndex < 0 && def.children.length === 0)) {
      retreat(def, st);
    }
  }
  if (def.children.length > 0) {
    st.currentSubLevel = def.children.length - 1;
    setHigh(def.children[st.currentSubLevel], st.children[st.currentSubLevel]);
  }
}

// ---- display ----------------------------------------------------------------

/** The active chain of level values, top-down (for $level1$..$levelN$). */
export function turnLevelValues(def: TurnTrackerDef, state: TurnState): Array<{ name: string; value: string }> {
  const out: Array<{ name: string; value: string }> = [];
  let levelDef = def.levels[state.currentLevel];
  let level = state.levels[state.currentLevel];
  while (levelDef && level) {
    out.push({ name: levelDef.name, value: levelValue(levelDef, level) });
    levelDef = levelDef.children[level.currentSubLevel];
    level = level.children[level.currentSubLevel];
  }
  return out;
}

function levelValue(def: TurnLevelDef, st: TurnLevelState): string {
  const raw = def.kind === "counter" ? String(st.current) : def.list[st.current] ?? "";
  return def.turnFormat.replace(/\$value\$/g, raw);
}

/** The tracker's turnFormat with $level1$..$levelN$ substituted. */
export function formatTurn(def: TurnTrackerDef, state: TurnState): string {
  const values = turnLevelValues(def, state);
  return def.turnFormat
    .replace(/\$level(\d+)\$/g, (_, n) => values[Number(n) - 1]?.value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}
