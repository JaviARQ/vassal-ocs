import { SequenceDecoder } from "../../vmod/sequence";
import type { GamePiece, KeyCommand, Trait } from "../piece";
import { parseKeyStroke, type KeyStroke } from "../keystroke";

/** `clone;<command>;<key>;<description>` — duplicates the piece. */
export class Clone implements Trait {
  readonly id = "clone;";
  private commandName = "Clone";
  private key: KeyStroke | null = null;

  constructor(type: string) {
    const st = new SequenceDecoder(type.substring(this.id.length), ";");
    this.commandName = st.nextTokenOr("Clone");
    this.key = parseKeyStroke(st.nextTokenOr("")) ?? parseKeyStroke("67,130");
  }

  setState(): void {}
  getState(): string {
    return "";
  }

  keyCommands(piece: GamePiece): KeyCommand[] {
    return [
      {
        name: this.commandName,
        stroke: this.key,
        perform: () => ((piece.pendingClone = true), true),
      },
    ];
  }
}
