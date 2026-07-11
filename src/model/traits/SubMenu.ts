import { SequenceDecoder } from "../../vmod/sequence";
import type { KeyCommand, Trait } from "../piece";

/**
 * VASSAL Sub-Menu trait (`submenu;` — VASSAL.counters.SubMenu): groups other
 * traits' menu commands under a nested submenu. Type encoding:
 * `submenu;<menu name>;<comma-joined command names>;<description>`.
 * It contributes a single stateless KeyCommand carrying `subCommands`; the
 * context menu moves commands whose names match into the submenu (mirrors
 * MenuDisplayer + KeyCommandSubMenu).
 */
export class SubMenu implements Trait {
  readonly id = "submenu;";
  private menuName: string;
  private commands: string[];

  constructor(type: string) {
    const dec = new SequenceDecoder(type.substring(this.id.length), ";");
    this.menuName = dec.nextTokenOr("Sub-Menu");
    const list = new SequenceDecoder(dec.nextTokenOr(""), ",");
    const commands: string[] = [];
    while (list.hasMoreTokens()) {
      const name = list.nextToken();
      if (name) commands.push(name);
    }
    this.commands = commands;
  }

  setState(): void {}

  getState(): string {
    return "";
  }

  keyCommands(): KeyCommand[] {
    return [
      {
        name: this.menuName,
        stroke: null,
        perform: () => false,
        subCommands: [...this.commands],
      },
    ];
  }
}
