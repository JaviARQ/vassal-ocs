import type { GamePiece, KeyCommand } from "../model/piece";
import { matchesEvent } from "../model/keystroke";

/**
 * Global keyboard dispatcher: routes a keystroke to the currently-selected
 * piece's matching KeyCommand (rotate, layer-cycle, delete, …). Mirrors how
 * VASSAL forwards keystrokes to the KeyBuffer's pieces.
 */
export function installKeymap(opts: {
  getSelected: () => GamePiece | null;
  run: (piece: GamePiece, cmd: KeyCommand) => void;
  deleteSelected?: () => void;
}): void {
  window.addEventListener("keydown", (e) => {
    // don't hijack typing in inputs
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;

    const piece = opts.getSelected();
    if (!piece) return;

    if ((e.key === "Delete" || e.key === "Backspace") && opts.deleteSelected) {
      e.preventDefault();
      opts.deleteSelected();
      return;
    }

    // A keystroke goes to every trait bound to it (Decorator.keyEvent chain):
    // one stroke may both flip an Embellishment level AND fire a
    // ReportState line. Snapshot first — commands can mutate the chain.
    const matched = piece.keyCommands().filter((cmd) => cmd.stroke && matchesEvent(cmd.stroke, e));
    if (matched.length === 0) return;
    e.preventDefault();
    for (const cmd of matched) opts.run(piece, cmd);
  });
}
