import { SequenceDecoder } from "../../vmod/sequence";
import { parseKeyStroke, type KeyStroke } from "../keystroke";
import type { GamePiece, KeyCommand, MovementMarkView, Trait } from "../piece";

/** VASSAL `markmoved;` — Mark When Moved. */
export class MovementMarkable implements Trait {
  readonly id = "markmoved;";
  protected image = "moved.gif";
  protected xOff = 0;
  protected yOff = 0;
  protected command = "Mark Moved";
  protected key: KeyStroke | null = null;
  protected commandTrue = "Mark Moved";
  protected keyTrue: KeyStroke | null = null;
  protected commandFalse = "Clear Moved";
  protected keyFalse: KeyStroke | null = null;
  protected hasMoved = false;
  protected ignoreSameLocation = false;

  constructor(type: string) {
    const st = new SequenceDecoder(type.substring(this.id.length), ";");
    this.image = st.nextTokenOr("moved.gif");
    this.xOff = st.nextInt(0);
    this.yOff = st.nextInt(0);
    this.command = st.nextTokenOr("Mark Moved");
    this.key = parseKeyStroke(st.nextTokenOr("77,0"));
    st.nextTokenOr(""); // description
    this.ignoreSameLocation = st.nextBoolean(false);
    this.commandTrue = st.nextTokenOr("Mark Moved");
    this.keyTrue = parseKeyStroke(st.nextTokenOr(""));
    this.commandFalse = st.nextTokenOr("Clear Moved");
    this.keyFalse = parseKeyStroke(st.nextTokenOr(""));
  }

  setState(s: string): void {
    this.hasMoved = s === "true";
  }

  getState(): string {
    return String(this.hasMoved);
  }

  getProperty(key: string): string | null {
    return key === "Moved" ? String(this.hasMoved) : null;
  }

  moved(): boolean {
    return this.hasMoved;
  }

  setMoved(piece: GamePiece, moved: boolean): void {
    this.hasMoved = moved;
    if (!moved) piece.clearMoveTrail();
  }

  movementMark(): MovementMarkView | null {
    return this.hasMoved ? { image: this.image, xOff: this.xOff, yOff: this.yOff } : null;
  }

  keyCommands(piece: GamePiece): KeyCommand[] {
    const out: KeyCommand[] = [];
    if (this.command) out.push({ name: this.command, stroke: this.key, perform: () => { piece.setMovedStatus(!this.hasMoved); return true; } });
    if (this.commandTrue && this.commandTrue !== this.command) {
      out.push({ name: this.commandTrue, stroke: this.keyTrue, perform: () => { piece.setMovedStatus(true); return true; } });
    }
    if (this.commandFalse && this.commandFalse !== this.command) {
      out.push({ name: this.commandFalse, stroke: this.keyFalse, perform: () => { piece.setMovedStatus(false); return true; } });
    }
    return out;
  }
}
