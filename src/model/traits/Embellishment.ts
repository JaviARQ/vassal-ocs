import { SequenceDecoder } from "../../vmod/sequence";
import type { GamePiece, KeyCommand, LayerImage, Trait } from "../piece";
import { keyStrokeFromChar, parseKeyStroke, type KeyStroke } from "../keystroke";

/**
 * `emb2;...` — the Layer trait: how pieces cycle equipment states and
 * status-effect overlays. We parse the fields needed to draw the
 * current level image and to offer Activate / Increase (up) / Decrease (down).
 *
 * State: an integer `value`. |value| is the 1-based level; value <= 0 means the
 * layer is inactive (nothing drawn).
 */
export class Embellishment implements Trait {
  readonly id = "emb2;";
  private activateCommand = "";
  private upCommand = "";
  private downCommand = "";
  private xOff = 0;
  private yOff = 0;
  private scale = 1;
  private images: string[] = [""];
  private levelNames: string[] = [];
  private loop = true;
  private activateKey: KeyStroke | null = null;
  private upKey: KeyStroke | null = null;
  private downKey: KeyStroke | null = null;
  private alwaysActive = false;
  private firstLevel = 1;
  /** drawUnderneathWhenSelected: excluded from the piece's hit/selection shape
   *  (Java Embellishment.getShape skips these layers). */
  private underneath = false;

  /** Current level value; |value| = level (1-based), <=0 means inactive. */
  private value = 0;

  constructor(type: string) {
    const st = new SequenceDecoder(type.substring(this.id.length), ";");
    this.activateCommand = st.nextTokenOr("");
    const activateMods = st.nextInt(128);
    const activateKeyCh = st.nextTokenOr("A");
    this.upCommand = st.nextTokenOr("");
    const upMods = st.nextInt(128);
    const upKeyCh = st.nextTokenOr("");
    this.downCommand = st.nextTokenOr("");
    const downMods = st.nextInt(128);
    const downKeyCh = st.nextTokenOr("");
    st.nextTokenOr(""); // resetCommand
    st.nextTokenOr(""); // resetKey (named)
    st.nextTokenOr("1"); // resetLevel
    this.underneath = st.nextBoolean(false); // drawUnderneathWhenSelected
    this.xOff = st.nextInt(0);
    this.yOff = st.nextInt(0);
    this.images = st.nextStringArray(1);
    this.levelNames = st.nextStringArray(this.images.length);
    this.loop = st.nextBoolean(true);
    st.nextTokenOr(""); // name
    st.nextTokenOr(""); // rndKey
    st.nextTokenOr(""); // rndText
    st.nextBoolean(false); // followProperty
    st.nextTokenOr(""); // propertyName
    this.firstLevel = st.nextInt(1); // firstLevelValue
    const version = st.nextInt(0);
    this.alwaysActive = st.nextBoolean(true);
    // v1+ explicit keystrokes supersede the char+mods form
    const activateKs = st.nextTokenOr("");
    const upKs = st.nextTokenOr("");
    const downKs = st.nextTokenOr("");
    st.nextTokenOr(""); // description
    this.scale = st.hasMoreTokens() ? st.nextDouble(1) || 1 : 1;

    if (version >= 1) {
      this.activateKey = parseKeyStroke(activateKs);
      this.upKey = parseKeyStroke(upKs);
      this.downKey = parseKeyStroke(downKs);
    } else {
      this.activateKey = keyStrokeFromChar(activateKeyCh, activateMods);
      this.upKey = keyStrokeFromChar(upKeyCh, upMods);
      this.downKey = keyStrokeFromChar(downKeyCh, downMods);
    }
  }

  setState(s: string): void {
    // Java: value>0 = active level, value<0 = inactive (level remembered).
    // alwaysActive only seeds the initial value (Embellishment constructor).
    const n = parseInt(s, 10);
    this.value = Number.isNaN(n)
      ? (this.alwaysActive ? Math.max(1, this.firstLevel) : -Math.max(1, this.firstLevel))
      : n;
  }
  getState(): string {
    return String(this.value);
  }

  /** Every level image name (all levels, not just the active one). */
  allImages(): string[] {
    return this.images.filter(Boolean);
  }

  private isActive(): boolean {
    return this.value > 0;
  }
  private level(): number {
    const l = Math.abs(this.value);
    return l >= 1 ? l : 1; // 1-based; default to first level
  }

  layerImages(): LayerImage[] {
    if (!this.isActive()) return [];
    const idx = this.level() - 1;
    const name = this.images[idx];
    if (!name) return [];
    return [{ name, xOff: this.xOff, yOff: this.yOff, scale: this.scale, underneath: this.underneath }];
  }

  getProperty(key: string): string | null {
    // Expose the active level name so labels/menus can read it.
    if (key === "LayerLevelName") {
      const idx = this.level() - 1;
      return this.isActive() ? this.levelNames[idx] ?? "" : "";
    }
    return null;
  }

  private setLevel(newLevel: number): void {
    const n = this.images.length;
    if (this.loop) {
      newLevel = ((newLevel - 1 + n) % n) + 1;
    } else {
      newLevel = Math.max(1, Math.min(n, newLevel));
    }
    this.value = this.isActive() ? newLevel : -newLevel;
  }

  keyCommands(_piece: GamePiece): KeyCommand[] {
    const out: KeyCommand[] = [];
    // Menu names are the module's own, verbatim — Java only lists commands
    // with non-empty text; empty-named ones stay keyboard-only here.
    if (this.activateKey || this.activateCommand) {
      out.push({
        name: this.activateCommand,
        stroke: this.activateKey,
        perform: () => {
          this.value = this.isActive() ? -this.level() : this.level() || 1;
          return true;
        },
      });
    }
    if (this.images.length > 1 && (this.upKey || this.upCommand)) {
      out.push({
        name: this.upCommand,
        stroke: this.upKey,
        perform: () => {
          this.setLevel(this.level() + 1);
          return true;
        },
      });
    }
    if (this.images.length > 1 && (this.downKey || this.downCommand)) {
      out.push({
        name: this.downCommand,
        stroke: this.downKey,
        perform: () => {
          this.setLevel(this.level() - 1);
          return true;
        },
      });
    }
    return out;
  }
}
