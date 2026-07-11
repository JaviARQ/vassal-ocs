import { SequenceDecoder, TYPE_DELIM } from "./sequence";
import { GamePiece, type Trait } from "../model/piece";
import { BasicPiece } from "../model/traits/BasicPiece";
import { FreeRotator } from "../model/traits/FreeRotator";
import { Embellishment } from "../model/traits/Embellishment";
import { Marker } from "../model/traits/Marker";
import { Immobilized } from "../model/traits/Immobilized";
import { Delete } from "../model/traits/Delete";
import { Clone } from "../model/traits/Clone";
import { Labeler } from "../model/traits/Labeler";
import { MovementMarkable } from "../model/traits/MovementMarkable";
import { Footprint } from "../model/traits/Footprint";
import { SubMenu } from "../model/traits/SubMenu";
import { DynamicProperty } from "../model/traits/DynamicProperty";
import { TriggerAction } from "../model/traits/TriggerAction";
import { PlaceMarker, PlaceDM, Replace } from "../model/traits/PlaceMarker";
import { ReportState } from "../model/traits/ReportState";
import { Translate } from "../model/traits/Translate";
import { Concealable, Concealment } from "../model/traits/custom/Concealable";
import { TextInfo } from "../model/traits/custom/TextInfo";
import { MovedMarker } from "../model/traits/custom/MovedMarker";

/** A no-op trait for IDs we don't implement yet, so pieces still load/render. */
class UnknownTrait implements Trait {
  private state = "";
  constructor(public readonly id: string) {}
  setState(s: string): void {
    this.state = s;
  }
  getState(): string {
    return this.state;
  }
  keyCommands(): [] {
    return [];
  }
}

type TraitFactory = (type: string) => Trait;

const REGISTRY: Record<string, TraitFactory> = {
  "piece;": (t) => new BasicPiece(t),
  "rotate;": (t) => new FreeRotator(t),
  "emb2;": (t) => new Embellishment(t),
  "mark;": (t) => new Marker(t),
  "immob;": (t) => new Immobilized(t),
  "delete;": (t) => new Delete(t),
  "clone;": (t) => new Clone(t),
  "label;": (t) => new Labeler(t),
  "markmoved;": (t) => new MovementMarkable(t),
  "footprint;": (t) => new Footprint(t),
  "submenu;": (t) => new SubMenu(t),
  // stock traits (used across many modules)
  "PROP;": (t) => new DynamicProperty(t),
  "macro;": (t) => new TriggerAction(t),
  "placemark;": (t) => new PlaceMarker(t),
  "replace;": (t) => new Replace(t),
  "report;": (t) => new ReportState(t),
  "translate;": (t) => new Translate(t),
  // custom traits from module Java classes ($VASL_SRC/counters)
  "conceal;": (t) => new Concealable(t),
  "concealment;": (t) => new Concealment(t),
  "info;": (t) => new TextInfo(t),
  "placeDM;": (t) => new PlaceDM(t),
  "moved;": (t) => new MovedMarker(t),
};

/** The ID prefix of a trait segment: everything up to and including the first ';'. */
export function typeId(segment: string): string {
  const i = segment.indexOf(";");
  return i >= 0 ? segment.substring(0, i + 1) : segment;
}

// ---- prototype expansion ---------------------------------------------------

let PROTOTYPES = new Map<string, string>();

/** Register the module (and extension) prototype definitions for expansion. */
export function setPrototypes(map: Map<string, string>): void {
  PROTOTYPES = map;
}

const PROTOTYPE_ID = "prototype;";

/**
 * Replace every `prototype;NAME` segment with that prototype's trait segments
 * (all but its terminal BasicPiece), recursively. Extension-defined pieces reference
 * prototypes like Infantry / A / Warlord Traits; unknown traits inside them
 * become harmless no-ops, while the piece's own inline traits (emb2 weapon
 * layers, image) still render and cycle.
 */
export function expandPrototypes(typeSegs: string[], seen: Set<string> = new Set(), depth = 0): string[] {
  if (depth > 20) return typeSegs;
  const out: string[] = [];
  for (const seg of typeSegs) {
    if (typeId(seg) === PROTOTYPE_ID) {
      const name = seg.substring(PROTOTYPE_ID.length).split(";")[0];
      const def = PROTOTYPES.get(name);
      if (!def || seen.has(name)) continue; // missing or cyclic -> drop
      const inner = splitChain(decodeAddPiece(def).type);
      // drop the prototype's own terminal BasicPiece
      const traits = inner.filter((s, i) => !(i === inner.length - 1 && typeId(s) === "piece;"));
      out.push(...expandPrototypes(traits, new Set([...seen, name]), depth + 1));
    } else {
      out.push(seg);
    }
  }
  return out;
}

/**
 * Parallel type+state prototype expansion. For each `prototype;NAME` segment
 * the prototype definition's own trait segments AND state segments are spliced
 * in (minus its terminal BasicPiece pair); other segments keep their aligned
 * slot state. Mirrors how Java's UsePrototype-built inner pieces start from
 * the prototype's stored state.
 */
export function expandPrototypesWithState(
  typeSegs: string[],
  stateSegs: string[],
  seen: Set<string> = new Set(),
  depth = 0,
): { typeSegs: string[]; stateSegs: string[] } {
  if (depth > 20) return { typeSegs, stateSegs };
  const outT: string[] = [];
  const outS: string[] = [];
  for (let i = 0; i < typeSegs.length; i++) {
    const seg = typeSegs[i];
    if (typeId(seg) === PROTOTYPE_ID) {
      const name = seg.substring(PROTOTYPE_ID.length).split(";")[0];
      const def = PROTOTYPES.get(name);
      if (!def || seen.has(name)) continue; // missing or cyclic -> drop
      const decoded = decodeAddPiece(def);
      const innerT = splitChain(decoded.type);
      const innerS = splitChain(decoded.state);
      const dropLast = typeId(innerT[innerT.length - 1] ?? "") === "piece;";
      const keptT = dropLast ? innerT.slice(0, -1) : innerT;
      const keptS = innerS.length === innerT.length && dropLast ? innerS.slice(0, -1) : innerS;
      const aligned = keptS.length === keptT.length;
      const inner = expandPrototypesWithState(
        keptT,
        aligned ? keptS : keptT.map(() => ""),
        new Set([...seen, name]),
        depth + 1,
      );
      outT.push(...inner.typeSegs);
      outS.push(...inner.stateSegs);
    } else {
      outT.push(seg);
      outS.push(stateSegs[i] ?? "");
    }
  }
  return { typeSegs: outT, stateSegs: outS };
}

/**
 * Split a nested VASSAL type/state string into per-trait segments, outer→inner.
 * Each level is `[thisSegment]\t[innerRemainder]` (see BasicCommandEncoder).
 */
export function splitChain(full: string | null): string[] {
  const segs: string[] = [];
  let cur: string | null = full && full.length > 0 ? full : null;
  while (cur != null) {
    const dec = new SequenceDecoder(cur, TYPE_DELIM);
    segs.push(dec.nextToken());
    cur = dec.hasMoreTokens() ? dec.nextToken() : null;
  }
  return segs;
}

/** Parsed `+/id/TYPE/STATE` AddPiece command from a PieceSlot definition. */
export interface AddPieceDef {
  id: string;
  type: string;
  state: string;
}

export function decodeAddPiece(def: string): AddPieceDef {
  const dec = new SequenceDecoder(def, "/");
  dec.nextToken(); // command char "+"
  const id = dec.nextTokenOr("");
  const type = dec.nextTokenOr("");
  const state = dec.hasMoreTokens() ? dec.nextToken() : "";
  return { id, type, state };
}

/** Build a GamePiece from a PieceSlot's stored `+/id/type/state` string. */
export function buildPiece(def: string): GamePiece {
  const { type, state } = decodeAddPiece(def);
  const piece = buildPieceFromTypeState(type, state);
  piece.sourceDef = def;
  return piece;
}

export function buildPieceFromTypeState(type: string, state: string): GamePiece {
  const rawSegs = splitChain(type);
  const rawStateSegs = splitChain(state);

  // When the slot state aligns 1:1 with the raw (pre-expansion) trait chain,
  // expand type and state in parallel: a `prototype;NAME` segment's traits take
  // their initial states from the prototype definition itself (Java
  // UsePrototype semantics). Without alignment fall back to type defaults.
  let typeSegs: string[];
  let stateSegs: string[] | null;
  if (rawStateSegs.length === rawSegs.length) {
    const expanded = expandPrototypesWithState(rawSegs, rawStateSegs);
    typeSegs = expanded.typeSegs;
    stateSegs = expanded.stateSegs;
  } else {
    typeSegs = expandPrototypes(rawSegs);
    stateSegs = null;
  }

  const traits: Trait[] = typeSegs.map((seg) => {
    const factory = REGISTRY[typeId(seg)];
    return factory ? factory(seg) : new UnknownTrait(typeId(seg));
  });
  traits.forEach((t, i) => t.setState(stateSegs ? stateSegs[i] ?? "" : ""));

  const piece = new GamePiece(traits);
  // BasicPiece state tail carries gpid (`...;gpid;...`); best-effort capture.
  const basicState = (stateSegs ?? rawStateSegs)[(stateSegs ?? rawStateSegs).length - 1] ?? "";
  const parts = basicState.split(";");
  if (parts.length >= 4) piece.gpid = parts[3];
  return piece;
}

/**
 * Rebuild the nested STATE chain from live trait states (for save/undo, M2).
 * Reconstructs inner→outer, escaping each level's delimiters once (mirrors the
 * decode in `splitChain`). Round-trips with `splitChain` for our trait states.
 */
export function encodeStateChain(piece: GamePiece): string {
  const values = piece.traits.map((t) => t.getState());
  let acc: string | null = null;
  for (let i = values.length - 1; i >= 0; i--) {
    acc = acc == null ? values[i] : `${values[i]}${TYPE_DELIM}${escapeLevel(acc)}`;
  }
  return acc ?? "";
}

/** Escape a nested value so its delimiters survive one decode level. */
function escapeLevel(inner: string): string {
  let out = "";
  for (const ch of inner) {
    if (ch === TYPE_DELIM) out += "\\";
    out += ch;
  }
  return out;
}
