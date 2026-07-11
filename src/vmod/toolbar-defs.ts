/**
 * Typed definitions for module-declared toolbar components (NotesWindow,
 * ToolbarMenu, TurnTracker, GlobalMap, Zoomer, Map launch buttons, …) plus the
 * pure ToolbarMenu resolution logic. Parsing out of the XML lives in
 * buildfile.ts; everything here is DOM-free and unit-testable.
 */

import type { DiceButtonDef } from "./buildfile";

export interface ToolbarButtonBase {
  /** Button label (VASSAL buttonText/text, trimmed). */
  text: string;
  tooltip: string;
  /** Raw icon attribute: "" | "/images/x.gif" (Java classpath) | module image. */
  icon: string;
}

export interface TurnLevelDef {
  kind: "counter" | "list";
  name: string;
  property: string;
  /** counter levels */
  start: number;
  incr: number;
  loop: boolean;
  loopLimit: number;
  /** list levels */
  list: string[];
  turnFormat: string;
  children: TurnLevelDef[];
}

export interface TurnTrackerDef {
  name: string;
  buttonText: string;
  reportFormat: string;
  turnFormat: string;
  levels: TurnLevelDef[];
}

export interface GlobalMapDef {
  buttonText: string;
  tooltip: string;
  icon: string;
  scale: number;
  /** "r,g,b" viewport rectangle color. */
  color: string;
}

export interface ZoomerDef {
  /** Ascending zoom levels as declared. */
  levels: number[];
  /** Initial index into `levels` (Java: clamp(levels.length - zoomStart)). */
  initialIndex: number;
}

/**
 * One node of a ChartWindow's widget tree: Charts are images,
 * organized by nested Tab/Panel/Box/List widgets.
 */
export interface ChartNodeDef {
  kind: "tabs" | "panel" | "chart";
  /** entryName (widgets) or chartName (charts) — the tab label. */
  name: string;
  /** Chart image entry in the module archive (kind "chart" only). */
  fileName?: string;
  /** PanelWidget vert attribute: stack children vertically. */
  vertical?: boolean;
  children: ChartNodeDef[];
}

export type ToolbarItemDef =
  | ({ kind: "dice"; dice: DiceButtonDef } & ToolbarButtonBase)
  | ({ kind: "notes" } & ToolbarButtonBase)
  | ({ kind: "turnTracker"; def: TurnTrackerDef } & ToolbarButtonBase)
  | ({ kind: "map"; mapName: string } & ToolbarButtonBase)
  | ({ kind: "pieceWindow" } & ToolbarButtonBase)
  | ({ kind: "globalMap"; mapName: string; def: GlobalMapDef } & ToolbarButtonBase)
  | ({ kind: "menu"; menuItems: string[]; items: ToolbarItemDef[]; unresolved: string[] } & ToolbarButtonBase)
  | ({ kind: "chartWindow"; name: string; charts: ChartNodeDef[] } & ToolbarButtonBase)
  | ({ kind: "unsupported"; component: string } & ToolbarButtonBase);

/** The name a ToolbarMenu menuItems entry is matched against (after text). */
function itemName(item: ToolbarItemDef): string {
  switch (item.kind) {
    case "dice": return item.dice.name;
    case "map": return item.mapName;
    case "turnTracker": return item.def.name;
    case "chartWindow": return item.name;
    default: return item.text;
  }
}

/**
 * Java ToolbarMenu behavior: each name in `menuItems` captures the toolbar
 * button whose text (or name) matches; captured buttons move inside the menu
 * and disappear from the top row. Unmatched names are kept in `unresolved`
 * (omitted from the UI, visible in debug). Returns the new top-row list.
 */
export function resolveToolbarMenus(items: ToolbarItemDef[]): ToolbarItemDef[] {
  const captured = new Set<ToolbarItemDef>();
  for (const menu of items) {
    if (menu.kind !== "menu") continue;
    for (const entry of menu.menuItems) {
      const match = items.find(
        (it) => it !== menu && it.kind !== "menu" && !captured.has(it) &&
          (it.text === entry || itemName(it) === entry),
      );
      if (match) {
        captured.add(match);
        menu.items.push(match);
      } else {
        menu.unresolved.push(entry);
      }
    }
  }
  return items.filter((it) => !captured.has(it));
}

/** Compute the initial zoom index per Java Zoomer semantics (1-based, reversed). */
export function zoomerInitialIndex(levelCount: number, zoomStart: number): number {
  return Math.max(0, Math.min(levelCount - 1, levelCount - zoomStart));
}

/** Debug-friendly flat summary of a toolbar tree (for __vb.toolbarButtons()). */
export function summarizeToolbar(items: ToolbarItemDef[]): Array<{
  kind: string;
  text: string;
  items?: Array<{ kind: string; text: string }>;
  unresolved?: string[];
  component?: string;
}> {
  return items.map((it) => ({
    kind: it.kind,
    text: it.text,
    ...(it.kind === "menu"
      ? {
          items: it.items.map((c) => ({ kind: c.kind, text: c.text })),
          unresolved: [...it.unresolved],
        }
      : {}),
    ...(it.kind === "unsupported" ? { component: it.component } : {}),
  }));
}
