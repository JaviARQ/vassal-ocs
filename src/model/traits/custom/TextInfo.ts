import type { GamePiece, KeyCommand, Trait } from "../../piece";
import { keyStrokeFromChar } from "../../keystroke";

/**
 * `info;` — TextInfo ($VASL_SRC/counters/TextInfo.java): a
 * "Show Info" (Ctrl+I) toggle that displays the counter's rules text.
 * Type: `info;<text>` — everything after
 * the first ';' is the text. We render it like a label while toggled on and
 * echo it to the chatter on show.
 */
export class TextInfo implements Trait {
  readonly id = "info;";
  private readonly info: string;
  private showInfo = false;

  constructor(type: string) {
    this.info = type.substring(type.indexOf(";") + 1);
  }

  setState(_s: string): void {}
  getState(): string {
    return "";
  }

  labelText(): string | null {
    return this.showInfo ? this.info.replace(/\\+$/, "") : null;
  }

  keyCommands(piece: GamePiece): KeyCommand[] {
    return [
      {
        name: "Show Info",
        stroke: keyStrokeFromChar("I", 128),
        perform: () => {
          this.showInfo = !this.showInfo;
          if (this.showInfo && this.info.trim()) {
            piece.pendingReports.push(`${piece.name()}: ${this.info}`);
          }
          return true;
        },
      },
    ];
  }
}
