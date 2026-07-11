import { SequenceDecoder } from "../../vmod/sequence";
import { substituteProperties } from "../../vmod/expression";
import type { GamePiece, KeyCommand, Trait } from "../piece";
import { decodeKeyList } from "./TriggerAction";

/**
 * `report;` — ReportState (VASSAL/counters/ReportState.java): posts a
 * formatted chat message whenever the piece receives one of its trigger
 * keystrokes. Type: report;keys;reportFormat;cycleKeys;cycleFormats;description.
 * The cycle variant rotates through cycleFormats each time a cycle key fires
 * (state = current index).
 */
export class ReportState implements Trait {
  readonly id = "report;";
  private keys = decodeKeyList("");
  private reportFormat = "";
  private cycleKeys = decodeKeyList("");
  private cycleFormats: string[] = [];
  private cycleIndex = -1;

  constructor(type: string) {
    const st = new SequenceDecoder(type.substring(this.id.length), ";");
    this.keys = decodeKeyList(st.nextTokenOr(""));
    this.reportFormat = st.nextTokenOr("$location$: $newPieceName$ *");
    this.cycleKeys = decodeKeyList(st.nextTokenOr(""));
    const formats = new SequenceDecoder(st.nextTokenOr(""), ",");
    while (formats.hasMoreTokens()) {
      const f = formats.nextToken();
      if (f) this.cycleFormats.push(f);
    }
  }

  setState(s: string): void {
    this.cycleIndex = Number.parseInt(s, 10);
    if (!Number.isFinite(this.cycleIndex)) this.cycleIndex = -1;
  }

  getState(): string {
    return String(this.cycleIndex);
  }

  keyCommands(piece: GamePiece): KeyCommand[] {
    const out: KeyCommand[] = [];
    for (const k of this.keys) {
      if (!k) continue;
      out.push({ name: "", stroke: k, perform: () => this.report(piece, this.reportFormat) });
    }
    for (const k of this.cycleKeys) {
      if (!k) continue;
      out.push({
        name: "",
        stroke: k,
        perform: () => {
          if (this.cycleFormats.length === 0) return false;
          this.cycleIndex = (this.cycleIndex + 1) % this.cycleFormats.length;
          return this.report(piece, this.cycleFormats[this.cycleIndex]);
        },
      });
    }
    return out;
  }

  private report(piece: GamePiece, format: string): boolean {
    const text = substituteProperties(format, (name) => {
      // ReportState-specific variables map to the piece's current name; the
      // app substitutes $location$ when it flushes pendingReports.
      if (name === "newPieceName" || name === "oldPieceName" || name === "pieceName") return piece.name();
      if (name === "location" || name === "newLocation" || name === "oldLocation") return null;
      return piece.getProperty(name);
    });
    if (!text.trim()) return false;
    piece.pendingReports.push(text);
    return false; // reporting alone doesn't change piece state
  }
}
