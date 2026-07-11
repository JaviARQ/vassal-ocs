import { SequenceDecoder } from "../../../vmod/sequence";
import type { GamePiece, KeyCommand, MovementMarkView, Trait } from "../../piece";

/**
 * `moved;` — MarkMoved ($VASL_SRC/counters/MarkMoved.java): a custom
 * moved-status marker. Type: `moved;image`; state: "true"/"false". Same
 * contract as stock MovementMarkable, so MapWindow's moved-flag flow applies.
 */
export class MovedMarker implements Trait {
  readonly id = "moved;";
  private image = "";
  private isMoved = false;

  constructor(type: string) {
    const st = new SequenceDecoder(type.substring(this.id.length), ";");
    this.image = st.nextTokenOr("");
  }

  setState(s: string): void {
    this.isMoved = s === "true";
  }

  getState(): string {
    return String(this.isMoved);
  }

  moved(): boolean | null {
    return this.isMoved;
  }

  setMoved(_piece: GamePiece, moved: boolean): void {
    this.isMoved = moved;
  }

  movementMark(): MovementMarkView | null {
    if (!this.isMoved || !this.image) return null;
    return { image: this.image, xOff: 0, yOff: 0 };
  }

  keyCommands(piece: GamePiece): KeyCommand[] {
    return [
      {
        name: this.isMoved ? "Mark unmoved" : "Mark moved",
        stroke: null,
        perform: () => {
          this.isMoved = !this.isMoved;
          if (!this.isMoved) piece.clearMoveTrail();
          return true;
        },
      },
    ];
  }
}
