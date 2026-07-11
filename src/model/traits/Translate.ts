import { SequenceDecoder } from "../../vmod/sequence";
import { evaluateValue } from "../../vmod/expression";
import type { GamePiece, KeyCommand, Trait } from "../piece";
import { parseKeyStroke, type KeyStroke } from "../keystroke";

/**
 * `translate;` — Translate / "Move Fixed Distance"
 * (VASSAL/counters/Translate.java). Hex-grid modules typically bind six of
 * these (dir1..dir6) in a prototype for one-hex direction moves (±56/±32/±64
 * px on geomorphic boards). Type: translate;commandName;key;xDist;yDist;moveStack;xIndex;
 * yIndex;xOffset;yOffset;description.
 */
export class Translate implements Trait {
  readonly id = "translate;";
  private commandName = "Move";
  private key: KeyStroke | null = null;
  private xDist = "0";
  private yDist = "0";

  constructor(type: string) {
    const st = new SequenceDecoder(type.substring(this.id.length), ";");
    this.commandName = st.nextTokenOr("Move");
    this.key = parseKeyStroke(st.nextTokenOr(""));
    this.xDist = st.nextTokenOr("0");
    this.yDist = st.nextTokenOr("0");
  }

  setState(_s: string): void {}
  getState(): string {
    return "";
  }

  keyCommands(piece: GamePiece): KeyCommand[] {
    if (!this.key) return [];
    return [
      {
        name: this.commandName,
        stroke: this.key,
        perform: () => {
          const lookup = (n: string) => piece.getProperty(n);
          const dx = Number(evaluateValue(this.xDist, lookup) ?? "0") || 0;
          const dy = Number(evaluateValue(this.yDist, lookup) ?? "0") || 0;
          if (!dx && !dy) return false;
          piece.x += dx;
          piece.y += dy;
          return true;
        },
      },
    ];
  }
}
