import { SequenceDecoder } from "../../vmod/sequence";
import { evaluateCondition } from "../../vmod/expression";
import type { GamePiece, KeyCommand, Trait } from "../piece";
import { keyStrokeFromChar, parseKeyStroke, type KeyStroke } from "../keystroke";

/**
 * `macro;` — TriggerAction (VASSAL/counters/TriggerAction.java): when its menu
 * command or any watched keystroke fires and the property-match expression
 * passes, it dispatches a list of action keystrokes at the piece. Type:
 *   macro;name;command;key;propertyMatch;watchKeys;actionKeys;loop;…
 * Loop support is parsed but only the non-looping form executes (`loop=false`
 * everywhere on the pieces of the reference modules).
 */
export class TriggerAction implements Trait {
  readonly id = "macro;";
  private commandName = "Trigger";
  private key: KeyStroke | null = null;
  private propertyMatch = "";
  private watchKeys: Array<KeyStroke | null> = [];
  private actionKeys: Array<KeyStroke | null> = [];
  private loop = false;

  constructor(type: string) {
    const st = new SequenceDecoder(type.substring(this.id.length), ";");
    st.nextTokenOr(""); // name (description)
    this.commandName = st.nextTokenOr("Trigger");
    this.key = parseKeyStroke(st.nextTokenOr(""));
    this.propertyMatch = st.nextTokenOr("");
    this.watchKeys = decodeKeyList(st.nextTokenOr(""));
    this.actionKeys = decodeKeyList(st.nextTokenOr(""));
    this.loop = st.nextBoolean(false);
  }

  setState(_s: string): void {}
  getState(): string {
    return "";
  }

  keyCommands(piece: GamePiece): KeyCommand[] {
    const out: KeyCommand[] = [];
    const fire = () => this.fire(piece);
    if (this.commandName && this.key) {
      out.push({ name: this.commandName, stroke: this.key, perform: fire });
    } else if (this.key) {
      out.push({ name: "", stroke: this.key, perform: fire });
    }
    for (const k of this.watchKeys) {
      if (k) out.push({ name: "", stroke: k, perform: fire });
    }
    return out;
  }

  private fire(piece: GamePiece): boolean {
    if (this.loop) return false; // looping triggers unsupported (unused in the reference modules)
    if (!evaluateCondition(this.propertyMatch, (n) => piece.getProperty(n))) return false;
    let changed = false;
    for (const k of this.actionKeys) {
      if (k) changed = piece.dispatch(k) || changed;
    }
    return changed;
  }
}

/**
 * NamedKeyStrokeArrayConfigurer.decode: comma-separated keystroke specs. The
 * legacy form (no comma) is a run of chars, each meaning Ctrl+char.
 */
export function decodeKeyList(encoded: string): Array<KeyStroke | null> {
  if (!encoded) return [];
  if (!encoded.includes(",")) {
    return [...encoded].map((ch) => keyStrokeFromChar(ch, 128));
  }
  const out: Array<KeyStroke | null> = [];
  const sd = new SequenceDecoder(encoded, ",");
  while (sd.hasMoreTokens()) {
    const tok = sd.nextToken();
    if (tok) out.push(parseKeyStroke(tok));
  }
  return out;
}
