import { SequenceDecoder } from "../../../vmod/sequence";
import type { GamePiece, KeyCommand, LayerImage, Trait } from "../../piece";
import { keyStrokeFromChar, type KeyStroke } from "../../keystroke";

/**
 * `conceal;` — Concealable ($VASL_SRC/counters/Concealable.java,
 * an Obscurable subclass): the "Conceal" command toggles concealment. Type:
 *   conceal;obscureKey;imageName;nation[;nation2;concealmentMarker]
 * State (from Obscurable): `owner;options` — "null" when unconcealed.
 *
 * Rendering matches the Java owner's view (drawObscuredToOthers): the counter
 * stays visible with the nation "?" image drawn on top — right for hotseat,
 * where the local player owns what they conceal.
 */
export class Concealable implements Trait {
  readonly id = "conceal;";
  private stroke: KeyStroke | null = null;
  private imageName = "";
  private obscuredBy: string | null = null;

  constructor(type: string) {
    const st = new SequenceDecoder(type.substring(this.id.length), ";");
    const keyChar = st.nextTokenOr("C");
    this.stroke = keyStrokeFromChar(keyChar.charAt(0).toUpperCase(), 128);
    this.imageName = st.nextTokenOr("");
  }

  setState(s: string): void {
    const st = new SequenceDecoder(s, ";");
    const owner = st.nextTokenOr("null");
    this.obscuredBy = owner === "null" || owner === "" ? null : owner;
  }

  getState(): string {
    return `${this.obscuredBy ?? "null"};`;
  }

  concealed(): boolean {
    return this.obscuredBy != null;
  }

  getProperty(key: string): string | null {
    if (key === "Obscured" || key === "ObscuredToOthers") return this.concealed() ? "true" : "false";
    return null;
  }

  layerImages(): LayerImage[] {
    if (!this.concealed() || !this.imageName) return [];
    return [{ name: this.imageName, xOff: 0, yOff: 0, scale: 1 }];
  }

  keyCommands(_piece: GamePiece): KeyCommand[] {
    return [
      {
        name: this.concealed() ? "Unconceal" : "Conceal",
        stroke: this.stroke,
        perform: () => {
          this.obscuredBy = this.concealed() ? null : "me";
          return true;
        },
      },
    ];
  }
}

/**
 * `concealment;` — Concealment ($VASL_SRC/counters/Concealment.java): the
 * standalone "?" counter. Type:
 * `concealment;owner;nation`; state is the owner. The stack-wide auto-conceal
 * behavior needs real stacking, so for now the counter is simply placeable
 * (its BasicPiece already renders the nation "?" image).
 */
export class Concealment implements Trait {
  readonly id = "concealment;";
  private owner: string | null = null;

  constructor(_type: string) {}

  setState(s: string): void {
    this.owner = s === "null" || s === "" ? null : s;
  }

  getState(): string {
    return this.owner ?? "null";
  }

  keyCommands(_piece: GamePiece): KeyCommand[] {
    return [];
  }
}
