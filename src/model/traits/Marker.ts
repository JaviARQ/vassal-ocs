import { SequenceDecoder } from "../../vmod/sequence";
import type { Trait } from "../piece";

/**
 * `mark;key1,key2,...` — static named properties. Values live in the state
 * (comma-separated, parallel to keys). Commonly provides `Layer` (z-order).
 */
export class Marker implements Trait {
  readonly id = "mark;";
  private keys: string[] = [];
  private values: string[] = [];

  constructor(type: string) {
    const st = new SequenceDecoder(type.substring(this.id.length), ",");
    while (st.hasMoreTokens()) this.keys.push(st.nextToken());
    this.values = this.keys.map(() => "");
  }

  setState(s: string): void {
    const st = new SequenceDecoder(s, ",");
    this.values = this.keys.map(() => (st.hasMoreTokens() ? st.nextToken() : ""));
  }
  getState(): string {
    return this.values.join(",");
  }

  getProperty(key: string): string | null {
    const i = this.keys.indexOf(key);
    return i >= 0 ? this.values[i] : null;
  }

  keyCommands(): [] {
    return [];
  }
}
