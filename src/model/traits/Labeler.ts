import { SequenceDecoder } from "../../vmod/sequence";
import type { GamePiece, KeyCommand, Trait } from "../piece";
import { parseKeyStroke, type KeyStroke } from "../keystroke";

/** Block-level tags become line breaks, other tags drop, entities decode. */
export function htmlLabelToText(html: string): string {
  return html
    .replace(/<(?:br|\/p|\/div|\/tr|\/li|\/h[1-6])[^>]*>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/&amp;/gi, "&")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .join("\n");
}

/**
 * `label;...` — a text label attached to the piece. The full type has many
 * styling fields; we parse the menu command + keystroke and render the
 * label text (which lives in the state). Editing prompts the user.
 */
export class Labeler implements Trait {
  readonly id = "label;";
  private menuCommand = "Change Label";
  private key: KeyStroke | null = null;
  private label = "";

  constructor(type: string) {
    const st = new SequenceDecoder(type.substring(this.id.length), ";");
    this.key = parseKeyStroke(st.nextTokenOr("")); // labelKey
    this.menuCommand = st.nextTokenOr("Change Label");
    // remaining styling fields not rendered
  }

  setState(s: string): void {
    this.label = s;
  }
  getState(): string {
    return this.label;
  }

  labelText(): string | null {
    if (!this.label) return null;
    // Swing renders JLabel text starting with "<html>" as HTML (modules use
    // this for styled scenario-setup labels). We draw plain text, so
    // convert instead of showing raw markup.
    return /^\s*<html/i.test(this.label) ? htmlLabelToText(this.label) : this.label;
  }

  getProperty(key: string): string | null {
    if (key === "LabelText") return this.label;
    return null;
  }

  keyCommands(_piece: GamePiece): KeyCommand[] {
    return [
      {
        // Verbatim menu text: Java's Labeler shows no menu entry when the
        // module left menuCommand empty (the label key still works).
        name: this.menuCommand,
        stroke: this.key,
        perform: () => {
          const next = typeof window !== "undefined" ? window.prompt("Label:", this.label) : null;
          if (next == null) return false;
          this.label = next;
          return true;
        },
      },
    ];
  }
}
