import { SequenceDecoder } from "../../vmod/sequence";
import { evaluateValue } from "../../vmod/expression";
import type { GamePiece, KeyCommand, Trait } from "../piece";
import { parseKeyStroke, type KeyStroke } from "../keystroke";

/**
 * `placemark;` — PlaceMarker (VASSAL/counters/PlaceMarker.java): a command
 * that spawns another piece near this one. Type:
 *   placemark;name;key;markerSpec;markerText;xOffset;yOffset;matchRotation;
 *             afterBurnerKey;description;gpid;placement;above;copyDPs;params;version
 * markerSpec is either an inline AddPiece (`+/id/type/state`) or a component
 * path ending in `PieceSlot:<entryName>` (createBaseMarker). The spawn itself
 * is queued on the piece; the app resolves the spec and places the piece.
 *
 * `replace;` — Replace extends PlaceMarker: the placed piece replaces this one
 * (vehicle → Wreck). Same type fields; we flag the placement replaceSelf.
 *
 * `placeDM;` — PlaceDM ($VASL_SRC/counters) extends PlaceMarker with a guard: only fires when
 * the piece's name doesn't already read as broken and no DM is pending.
 */
export class PlaceMarker implements Trait {
  readonly id: string;
  protected commandName = "";
  protected key: KeyStroke | null = null;
  protected markerSpec: string | null = null;
  protected xOffset = "0";
  protected yOffset = "0";

  constructor(type: string, id = "placemark;") {
    this.id = id;
    const st = new SequenceDecoder(type.substring(id.length), ";");
    this.commandName = st.nextTokenOr("");
    this.key = parseKeyStroke(st.nextTokenOr(""));
    const spec = st.nextTokenOr("");
    this.markerSpec = spec === "null" || spec === "" ? null : spec;
    st.nextTokenOr("null"); // markerText (unused: null in practice)
    this.xOffset = st.nextTokenOr("0");
    this.yOffset = st.nextTokenOr("0");
  }

  setState(_s: string): void {}
  getState(): string {
    return "";
  }

  keyCommands(piece: GamePiece): KeyCommand[] {
    if (!this.commandName || !this.key) {
      // keyboard-only variants still need to react to their stroke
      return this.key ? [{ name: "", stroke: this.key, perform: () => this.place(piece) }] : [];
    }
    return [{ name: this.commandName, stroke: this.key, perform: () => this.place(piece) }];
  }

  protected place(piece: GamePiece): boolean {
    if (!this.markerSpec) return false;
    const lookup = (n: string) => piece.getProperty(n);
    const dx = Number(evaluateValue(this.xOffset, lookup) ?? "0") || 0;
    const dy = Number(evaluateValue(this.yOffset, lookup) ?? "0") || 0;
    piece.pendingPlacements.push({
      spec: this.markerSpec,
      dx,
      // VASSAL yOffset is "up" positive (PlaceMarker: p.y - yOffset)
      dy: -dy,
      replaceSelf: this.id === "replace;",
    });
    return true;
  }
}

export class Replace extends PlaceMarker {
  constructor(type: string) {
    super(type, "replace;");
  }
}

export class PlaceDM extends PlaceMarker {
  constructor(type: string) {
    super(type, "placeDM;");
  }

  protected place(piece: GamePiece): boolean {
    // PlaceDM.myKeyEvent: skip when the (inner) piece already reads as
    // broken — the same stroke also flips the piece, and Java checks pre-flip.
    if (piece.name().includes("broken")) return false;
    return super.place(piece);
  }
}
