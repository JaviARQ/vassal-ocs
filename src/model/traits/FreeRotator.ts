import { SequenceDecoder } from "../../vmod/sequence";
import type { GamePiece, KeyCommand, Trait } from "../piece";
import { parseKeyStroke, type KeyStroke } from "../keystroke";

/**
 * `rotate;<facings>;<cwKey>;<ccwKey>;<cwText>;<ccwText>;...` (fixed facings)
 * or `rotate;1;<setAngleKey>;<setText>;...` (free rotation).
 * State: for fixed facings, the current angle index; for free, the angle.
 * validAngles[i] = -i * 360/facings (VASSAL rotates clockwise as index grows).
 */
export class FreeRotator implements Trait {
  readonly id = "rotate;";
  private validAngles: number[] = [0];
  private angleIndex = 0;
  private freeAngle = 0;
  private cwKey: KeyStroke | null = null;
  private ccwKey: KeyStroke | null = null;
  private cwText = "";
  private ccwText = "";
  /** Step/"random" rotate key. Extension-defined pieces often bind rotation here (e.g. Alt+X). */
  private stepKey: KeyStroke | null = null;
  private stepText = "";

  constructor(type: string) {
    const st = new SequenceDecoder(type.substring(this.id.length), ";");
    const facings = st.nextInt(1);
    this.validAngles = new Array(facings);
    for (let i = 0; i < facings; i++) this.validAngles[i] = (-i * 360) / facings;
    if (this.isFree()) {
      st.nextTokenOr(""); // setAngleKey (free rotate via drag; unsupported)
      this.cwText = st.nextTokenOr("Rotate");
    } else {
      this.cwKey = parseKeyStroke(st.nextTokenOr(""));
      this.ccwKey = parseKeyStroke(st.nextTokenOr(""));
      // Java FreeRotator: rotateCWText/rotateCCWText default to "" — an empty
      // menu text means keyboard-only, NOT a default menu entry.
      this.cwText = st.nextTokenOr("");
      this.ccwText = st.nextTokenOr("");
    }
    this.stepKey = parseKeyStroke(st.nextTokenOr("")); // rotateRNDKey
    this.stepText = st.nextTokenOr(""); // rotateRNDText ("" = keyboard-only)
  }

  private isFree(): boolean {
    return this.validAngles.length === 1;
  }

  setState(s: string): void {
    if (this.isFree()) {
      this.freeAngle = parseFloat(s) || 0;
    } else {
      const i = parseInt(s, 10);
      this.angleIndex = Number.isNaN(i) ? 0 : ((i % this.validAngles.length) + this.validAngles.length) % this.validAngles.length;
    }
  }
  getState(): string {
    return this.isFree() ? String(this.freeAngle) : String(this.angleIndex);
  }

  rotationDegrees(): number {
    return this.isFree() ? this.freeAngle : this.validAngles[this.angleIndex];
  }

  private stepCW(): boolean {
    this.angleIndex = (this.angleIndex + 1) % this.validAngles.length;
    return true;
  }
  private stepCCW(): boolean {
    this.angleIndex = (this.angleIndex - 1 + this.validAngles.length) % this.validAngles.length;
    return true;
  }

  keyCommands(_piece: GamePiece): KeyCommand[] {
    if (this.isFree()) return [];
    // Menu text is the module's own, verbatim — an empty name is a
    // keyboard-only command (Java myGetKeyCommands only lists non-empty
    // texts; the keystroke still works through the keyEvent chain).
    const cmds: KeyCommand[] = [
      // If the module bound no explicit CW key but did bind a step key, use it
      // so those pieces still rotate from the keyboard.
      { name: this.cwText, stroke: this.cwKey ?? this.stepKey, perform: () => this.stepCW() },
      { name: this.ccwText, stroke: this.ccwKey, perform: () => this.stepCCW() },
    ];
    // Expose a distinct step command when it has its own key/label.
    if (this.stepKey && !this.cwKey) {
      cmds.push({ name: this.stepText, stroke: this.stepKey, perform: () => this.stepCW() });
    }
    return cmds;
  }
}
