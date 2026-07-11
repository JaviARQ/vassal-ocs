import { SequenceDecoder } from "../../vmod/sequence";
import { evaluateValue } from "../../vmod/expression";
import type { GamePiece, KeyCommand, Trait } from "../piece";
import { parseKeyStroke, type KeyStroke } from "../keystroke";

/**
 * `PROP;` — DynamicProperty (VASSAL/counters/DynamicProperty.java): a named,
 * piece-local property with key commands that change it. Type:
 *   PROP;key;numeric,min,max,wrap;commandList;description
 * commandList items (',' separated): `menuName:keystroke:changer` where
 * changer is `code,args` with codes from PropertyChangerConfigurer:
 *   P=set value, R=prompt, E=enumerated prompt, I=increment.
 * State is the current value.
 */

interface DynamicKeyCommand {
  name: string;
  stroke: KeyStroke | null;
  changerCode: string;
  /** P: value expression · R/E: prompt text · I: increment expression. */
  arg: string;
  /** E only: the choices offered. */
  options: string[];
}

export class DynamicProperty implements Trait {
  readonly id = "PROP;";
  private key = "name";
  private numeric = false;
  private minValue = 0;
  private maxValue = 100;
  private wrap = false;
  private commands: DynamicKeyCommand[] = [];
  private value = "";

  constructor(type: string) {
    const sd = new SequenceDecoder(type.substring(this.id.length), ";");
    this.key = sd.nextTokenOr("name");
    const constraints = new SequenceDecoder(sd.nextTokenOr(""), ",");
    this.numeric = constraints.nextBoolean(false);
    this.minValue = constraints.nextInt(0);
    this.maxValue = constraints.nextInt(100);
    this.wrap = constraints.nextBoolean(false);

    const list = new SequenceDecoder(sd.nextTokenOr(""), ",");
    while (list.hasMoreTokens()) {
      const item = list.nextToken();
      if (!item) continue;
      const st = new SequenceDecoder(item, ":");
      const name = st.nextTokenOr("");
      const stroke = parseKeyStroke(st.nextTokenOr(""));
      const changer = new SequenceDecoder(st.nextTokenOr(""), ",");
      const code = changer.nextChar("P");
      const arg = changer.nextTokenOr(code === "I" ? "1" : "");
      const options: string[] = [];
      if (code === "E") while (changer.hasMoreTokens()) options.push(changer.nextToken());
      this.commands.push({ name, stroke, changerCode: code, arg, options });
    }
  }

  setState(s: string): void {
    this.value = s;
  }

  getState(): string {
    return this.value;
  }

  getProperty(key: string): string | null {
    return key === this.key ? this.value : null;
  }

  keyCommands(piece: GamePiece): KeyCommand[] {
    return this.commands.map((c) => ({
      name: c.name,
      stroke: c.stroke,
      perform: () => this.performChange(c, piece),
    }));
  }

  private performChange(c: DynamicKeyCommand, piece: GamePiece): boolean {
    const lookup = (name: string) => (name === this.key ? this.value : piece.getProperty(name));
    let next: string | null = null;
    switch (c.changerCode) {
      case "P": // PropertySetter
        next = evaluateValue(c.arg, lookup);
        break;
      case "R": { // PropertyPrompt
        const raw = typeof window !== "undefined" ? window.prompt(c.arg || "Enter new value", this.value) : null;
        if (raw == null) return false;
        next = raw;
        break;
      }
      case "E": { // EnumeratedPropertyPrompt
        const raw = typeof window !== "undefined"
          ? window.prompt(`${c.arg || "Select new value"}\n(${c.options.join(", ")})`, this.value)
          : null;
        if (raw == null) return false;
        next = raw;
        break;
      }
      case "I": { // IncrementProperty
        const incr = Number(evaluateValue(c.arg, lookup) ?? "");
        if (!Number.isFinite(incr)) return false;
        next = String((Number(this.value) || 0) + incr);
        break;
      }
    }
    if (next == null) return false;
    this.value = this.applyConstraints(next);
    return true;
  }

  /** IncrementProperty.Constraints: clamp or wrap numeric values. */
  private applyConstraints(raw: string): string {
    if (!this.numeric) return raw;
    let n = Number(raw);
    if (!Number.isFinite(n)) return raw;
    if (this.wrap) {
      const span = this.maxValue - this.minValue + 1;
      if (span > 0) {
        n = this.minValue + (((n - this.minValue) % span) + span) % span;
      }
    } else {
      n = Math.max(this.minValue, Math.min(this.maxValue, n));
    }
    return String(n);
  }
}
