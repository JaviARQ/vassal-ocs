import type { GamePiece, KeyCommand } from "../model/piece";
import { keyStrokeLabel, strokesEqual } from "../model/keystroke";

/** One rendered menu row: a command, or a submenu with nested entries. */
interface MenuEntry {
  cmd: KeyCommand;
  children: MenuEntry[] | null;
}

/**
 * A right-click / long-press menu for a piece. The items are exactly the
 * piece's aggregated trait KeyCommands that carry a menu name — mirroring
 * VASSAL's MenuDisplayer, including SubMenu grouping (KeyCommandSubMenu):
 * commands whose names appear in a `submenu;` trait's list are moved out of
 * the top level into a nested flyout.
 */
export class ContextMenu {
  /** Root menu plus any open submenu flyouts, root first. */
  private static open: HTMLElement[] = [];

  static show(
    piece: GamePiece,
    clientX: number,
    clientY: number,
    run: (cmd: KeyCommand) => void,
    extra: KeyCommand[] = [],
  ): void {
    ContextMenu.showCommands([...piece.keyCommands(), ...extra], clientX, clientY, run);
  }

  /** Show a menu for an arbitrary command list (deck piles, app commands). */
  static showCommands(commands: KeyCommand[], clientX: number, clientY: number, run: (cmd: KeyCommand) => void): void {
    ContextMenu.close();

    const entries = groupSubMenus(commands);
    const menu = ContextMenu.buildMenu(entries, run, 0);
    ContextMenu.place(menu, clientX, clientY);

    setTimeout(() => {
      window.addEventListener("pointerdown", ContextMenu.onOutside, { once: true, capture: true });
    }, 0);
  }

  private static buildMenu(entries: MenuEntry[], run: (cmd: KeyCommand) => void, depth: number): HTMLElement {
    const menu = document.createElement("div");
    menu.className = "context-menu";
    menu.dataset.depth = String(depth);

    if (entries.length === 0) {
      const empty = document.createElement("div");
      empty.className = "context-item disabled";
      empty.textContent = "(no actions)";
      menu.appendChild(empty);
      return menu;
    }

    for (const entry of entries) {
      const item = document.createElement("button");
      item.className = "context-item";
      const label = document.createElement("span");
      label.textContent = entry.cmd.name;
      item.appendChild(label);

      if (entry.children) {
        // Submenu row: arrow marker, opens a flyout. An empty submenu stays
        // visible but disabled (Java parity — it may convey information).
        item.classList.add("has-sub");
        const arrow = document.createElement("span");
        arrow.className = "context-key context-sub-arrow";
        arrow.textContent = "▸";
        item.appendChild(arrow);
        if (entry.children.length === 0) {
          item.classList.add("disabled");
        } else {
          const openSub = () => ContextMenu.openSubMenu(item, entry.children!, run, depth);
          item.addEventListener("click", openSub);
          item.addEventListener("pointerenter", (e) => {
            if (e.pointerType === "mouse") openSub();
          });
        }
      } else {
        if (entry.cmd.stroke) {
          const strokeText = keyStrokeLabel(entry.cmd.stroke);
          if (strokeText) {
            const kb = document.createElement("span");
            kb.className = "context-key";
            kb.textContent = strokeText;
            item.appendChild(kb);
          }
        }
        item.addEventListener("click", () => {
          ContextMenu.close();
          run(entry.cmd);
        });
        // Hovering a plain row closes any flyout from a sibling submenu row.
        item.addEventListener("pointerenter", (e) => {
          if (e.pointerType === "mouse") ContextMenu.closeDeeperThan(depth);
        });
      }
      menu.appendChild(item);
    }
    return menu;
  }

  private static openSubMenu(row: HTMLElement, entries: MenuEntry[], run: (cmd: KeyCommand) => void, parentDepth: number): void {
    ContextMenu.closeDeeperThan(parentDepth);
    const sub = ContextMenu.buildMenu(entries, run, parentDepth + 1);
    const r = row.getBoundingClientRect();
    document.body.appendChild(sub);
    const sr = sub.getBoundingClientRect();
    // Prefer opening to the right of the row; flip left when out of room.
    const x = r.right + sr.width + 2 <= window.innerWidth ? r.right + 2 : Math.max(4, r.left - sr.width - 2);
    const y = Math.max(4, Math.min(r.top, window.innerHeight - sr.height - 4));
    sub.style.left = x + "px";
    sub.style.top = y + "px";
    ContextMenu.open.push(sub);
  }

  private static place(menu: HTMLElement, clientX: number, clientY: number): void {
    document.body.appendChild(menu);
    const r = menu.getBoundingClientRect();
    menu.style.left = Math.max(4, Math.min(clientX, window.innerWidth - r.width - 4)) + "px";
    menu.style.top = Math.max(4, Math.min(clientY, window.innerHeight - r.height - 4)) + "px";
    ContextMenu.open = [menu];
  }

  /** Close flyouts deeper than `depth` (keep the root at depth 0). */
  private static closeDeeperThan(depth: number): void {
    while (ContextMenu.open.length > depth + 1) {
      ContextMenu.open.pop()?.remove();
    }
  }

  private static onOutside = (e: Event) => {
    if (ContextMenu.open.length === 0) return;
    if (ContextMenu.open.some((m) => m.contains(e.target as Node))) {
      // clicked inside one of the menus; keep listening
      window.addEventListener("pointerdown", ContextMenu.onOutside, { once: true, capture: true });
      return;
    }
    ContextMenu.close();
  };

  static close(): void {
    for (const m of ContextMenu.open) m.remove();
    ContextMenu.open = [];
  }
}

/**
 * MenuDisplayer.createPopup keystroke collapse: commands sharing one non-null
 * keystroke render as a single row at the first occurrence's position, and
 * the longest name wins. Clicking the row performs every collapsed command —
 * in Java a menu click fires the keystroke at the whole decorator chain
 * (KeyCommand.actionPerformed → outer.keyEvent(stroke)), so all same-stroke
 * traits act. Null-stroke commands and submenus never collapse.
 */
function collapseByStroke(commands: KeyCommand[]): KeyCommand[] {
  const rows: Array<{ cmd: KeyCommand; performs: Array<() => boolean> }> = [];
  for (const cmd of commands) {
    const prev = cmd.stroke && !cmd.subCommands
      ? rows.find((r) => !r.cmd.subCommands && r.cmd.stroke && strokesEqual(r.cmd.stroke, cmd.stroke))
      : undefined;
    if (prev) {
      prev.performs.push(cmd.perform);
      if (cmd.name.length > prev.cmd.name.length) prev.cmd = { ...cmd };
      continue;
    }
    rows.push({ cmd, performs: [cmd.perform] });
  }
  return rows.map((r) =>
    r.performs.length === 1
      ? r.cmd
      : { ...r.cmd, perform: () => r.performs.reduce((changed, p) => p() || changed, false) },
  );
}

/**
 * MenuDisplayer.createPopup grouping: build the named rows in trait order,
 * then move every row whose command name appears in a submenu's list inside
 * that submenu. A row moves at most once (first submenu that claims it wins).
 */
export function groupSubMenus(commands: KeyCommand[]): MenuEntry[] {
  const entries: MenuEntry[] = collapseByStroke(commands)
    .filter((c) => c.name && c.name.trim().length > 0)
    .map((cmd) => ({ cmd, children: cmd.subCommands ? [] : null }));

  const byName = new Map<string, MenuEntry[]>();
  for (const e of entries) {
    const list = byName.get(e.cmd.name) ?? [];
    list.push(e);
    byName.set(e.cmd.name, list);
  }

  const moved = new Set<MenuEntry>();
  for (const submenu of entries) {
    if (!submenu.children || !submenu.cmd.subCommands) continue;
    for (const name of submenu.cmd.subCommands) {
      for (const match of byName.get(name) ?? []) {
        if (match === submenu || moved.has(match)) continue;
        submenu.children.push(match);
        moved.add(match);
      }
    }
  }
  return entries.filter((e) => !moved.has(e));
}
