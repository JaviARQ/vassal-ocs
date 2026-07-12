import { SequenceDecoder } from "../../vmod/sequence";
import type { GamePiece, KeyCommand, LabelPlacement, Trait } from "../piece";
import { parseKeyStroke, type KeyStroke } from "../keystroke";

/** Block-level tags become line breaks, other tags drop, entities decode. */
export function htmlLabelToText(html: string): string {
  return html
    .replace(/<(?:style|script)[^>]*>[\s\S]*?<\/(?:style|script)>/gi, "")
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
  private placement: LabelPlacement | null = null;
  private propertyName = "TextLabel";

  constructor(type: string) {
    const st = new SequenceDecoder(type.substring(this.id.length), ";");
    this.key = parseKeyStroke(st.nextTokenOr("")); // labelKey
    this.menuCommand = st.nextTokenOr("Change Label");
    st.nextInt(10); // fontSize
    st.nextTokenOr(""); // textBg
    st.nextTokenOr(""); // textFg
    // Anchor fields (Java Labeler.getLabelPosition); defaults mirror Java.
    this.placement = {
      vPos: st.nextTokenOr("t"),
      vOff: st.nextInt(0),
      hPos: st.nextTokenOr("c"),
      hOff: st.nextInt(0),
      vJust: st.nextTokenOr("b"),
      hJust: st.nextTokenOr("c"),
    };
    st.nextTokenOr(""); // nameFormat
    st.nextTokenOr(""); // fontFamily
    st.nextInt(0); // fontStyle
    st.nextInt(0); // rotateDegrees
    this.propertyName = st.nextTokenOr("TextLabel");
  }

  labelPlacement(): LabelPlacement | null {
    return this.placement;
  }

  setState(s: string): void {
    this.label = s;
  }
  getState(): string {
    return this.label;
  }

  labelText(): string | null {
    if (!this.label) return null;
    // Swing renders JLabel text starting with "<html>" as HTML (modules build
    // whole scenario cards this way). The renderer rasterizes htmlLabel();
    // this text form is the fallback when rasterization is unavailable.
    return /^\s*<html/i.test(this.label) ? htmlLabelToText(this.label) : this.label;
  }

  /** Raw markup when the label is Swing-HTML (rendered as real HTML). */
  htmlLabel(): string | null {
    return /^\s*<html/i.test(this.label) ? this.label : null;
  }

  getProperty(key: string): string | null {
    // Raw (unsubstituted) label, so a $label$ ref can't recurse.
    if (key === "LabelText" || key === "label" || key === this.propertyName) return this.label;
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
