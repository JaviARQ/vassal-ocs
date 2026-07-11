import { SequenceDecoder } from "../../vmod/sequence";
import type { Trait } from "../piece";

/**
 * `immob;<selectionOptions>` — movement/selection constraints. We only need
 * `neverMove` ('V'), which pins terrain in place (the module's "lock").
 */
export class Immobilized implements Trait {
  readonly id = "immob;";
  private neverMove = false;
  private state = "";

  constructor(type: string) {
    const st = new SequenceDecoder(type.substring(this.id.length), ";");
    // Legacy first token is a movement flag char; the modern form is a string
    // of option chars. Either way, presence of 'V' means never-move.
    const opts = st.getRemaining() + st.nextTokenOr("");
    this.neverMove = opts.indexOf("V") >= 0;
  }

  setState(s: string): void {
    this.state = s;
  }
  getState(): string {
    return this.state;
  }

  immobile(): boolean {
    return this.neverMove;
  }

  keyCommands(): [] {
    return [];
  }
}
