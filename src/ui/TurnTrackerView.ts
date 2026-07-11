import type { TurnTrackerDef } from "../vmod/toolbar-defs";
import { formatTurn, nextTurn, prevTurn, turnLevelValues, type TurnState } from "../vmod/turn";

export interface TurnTrackerCallbacks {
  getState: () => TurnState;
  /** Fired after next/prev with the chat report line (reportFormat applied). */
  onAdvanced: (report: string) => void;
}

/**
 * The VASSAL Turn Counter window: big formatted current-turn label with
 * prev/next controls and a per-level breakdown.
 */
export class TurnTrackerView {
  readonly el: HTMLElement;
  private display: HTMLElement;
  private levelsEl: HTMLElement;

  constructor(
    private readonly def: TurnTrackerDef,
    private readonly playerId: () => string,
    private readonly cb: TurnTrackerCallbacks,
  ) {
    this.el = document.createElement("div");
    this.el.className = "turn-tracker";

    const controls = document.createElement("div");
    controls.className = "turn-controls";
    const prev = document.createElement("button");
    prev.type = "button";
    prev.className = "turn-step";
    prev.title = "Previous";
    prev.textContent = "◀";
    prev.addEventListener("click", () => this.step(-1));
    this.display = document.createElement("div");
    this.display.className = "turn-display";
    const next = document.createElement("button");
    next.type = "button";
    next.className = "turn-step";
    next.title = "Next";
    next.textContent = "▶";
    next.addEventListener("click", () => this.step(1));
    controls.append(prev, this.display, next);

    this.levelsEl = document.createElement("div");
    this.levelsEl.className = "turn-levels";

    this.el.append(controls, this.levelsEl);
    this.render();
  }

  render(): void {
    const state = this.cb.getState();
    this.display.textContent = formatTurn(this.def, state) || "—";
    this.levelsEl.innerHTML = "";
    for (const { name, value } of turnLevelValues(this.def, state)) {
      const row = document.createElement("div");
      row.className = "turn-level-row";
      const label = document.createElement("span");
      label.className = "turn-level-name";
      label.textContent = name;
      const val = document.createElement("span");
      val.textContent = value;
      row.append(label, val);
      this.levelsEl.appendChild(row);
    }
  }

  private step(dir: 1 | -1): void {
    const state = this.cb.getState();
    if (dir > 0) nextTurn(this.def, state);
    else prevTurn(this.def, state);
    this.render();
    const report = (this.def.reportFormat || "It is now $newTurn$")
      .replace(/\$newTurn\$/g, formatTurn(this.def, state))
      .replace(/\$playerId\$/g, this.playerId())
      .replace(/^\*\s*/, "");
    this.cb.onAdvanced(report);
  }
}
