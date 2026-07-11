import { SequenceDecoder } from "../../vmod/sequence";
import type { GamePiece, KeyCommand, Trait } from "../piece";
import { parseKeyStroke, type KeyStroke } from "../keystroke";

/** `delete;<command>;<key>;<description>` — removes the piece. */
export class Delete implements Trait {
  readonly id = "delete;";
  private commandName = "Delete";
  private key: KeyStroke | null = null;

  constructor(type: string) {
    const st = new SequenceDecoder(type.substring(this.id.length), ";");
    this.commandName = st.nextTokenOr("Delete");
    this.key = parseKeyStroke(st.nextTokenOr("")) ?? parseKeyStroke("68,130");
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
        perform: () => ((piece.pendingDelete = true), true),
      },
    ];
  }
}
