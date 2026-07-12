import { SequenceDecoder } from "../../vmod/sequence";
import type { Trait } from "../piece";

/**
 * `immob;<selection>;<movement>;<stacking>` — movement/selection constraints
 * (VASSAL/counters/Immobilized.java). Selection chars: 'i' shift-to-select,
 * 'n' never select (implies never move), 'g' ignore the map grid. Movement
 * char 'V' = never move (pins terrain — the module's "lock").
 */
export class Immobilized implements Trait {
  readonly id = "immob;";
  private neverMove = false;
  private ignoreGrid = false;
  private state = "";

  constructor(type: string) {
    const st = new SequenceDecoder(type.substring(this.id.length), ";");
    const selection = st.nextTokenOr("");
    const movement = st.nextTokenOr("");
    this.neverMove = selection.includes("n") || movement.includes("V");
    this.ignoreGrid = selection.includes("g");
  }

  ignoresGrid(): boolean {
    return this.ignoreGrid;
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
