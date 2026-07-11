import { SequenceDecoder } from "../../vmod/sequence";
import type { GamePiece, KeyCommand, Trait } from "../piece";
import { keyStrokeFromChar } from "../keystroke";

/**
 * `piece;cloneKey;deleteKey;image;name` — the innermost, non-decorator base.
 * State: `mat;x;y;gpid;...` (parsed but otherwise ignored).
 */
export class BasicPiece implements Trait {
  readonly id = "piece;";
  private cloneKey = "";
  private deleteKey = "";
  private imageName = "";
  private commonName = "";
  private state = "";

  constructor(type: string) {
    const st = new SequenceDecoder(type.substring(this.id.length), ";");
    this.cloneKey = st.nextTokenOr("");
    this.deleteKey = st.nextTokenOr("");
    this.imageName = st.nextTokenOr("");
    this.commonName = st.nextTokenOr("");
  }

  setState(s: string): void {
    this.state = s;
  }
  getState(): string {
    return this.state;
  }

  baseImageName(): string | null {
    // Java ScaledImagePainter.setImageName: a blank name means "no image"
    // (modules use " " for pieces whose art is all Embellishment layers).
    return this.imageName.trim() ? this.imageName : null;
  }

  getProperty(key: string): string | null {
    if (key === "BasicName") return this.commonName;
    return null;
  }

  keyCommands(piece: GamePiece): KeyCommand[] {
    const out: KeyCommand[] = [];
    if (this.cloneKey) {
      out.push({
        name: "",
        stroke: keyStrokeFromChar(this.cloneKey, 128),
        perform: () => ((piece.pendingClone = true), true),
      });
    }
    if (this.deleteKey) {
      out.push({
        name: "",
        stroke: keyStrokeFromChar(this.deleteKey, 128),
        perform: () => ((piece.pendingDelete = true), true),
      });
    }
    return out;
  }
}
