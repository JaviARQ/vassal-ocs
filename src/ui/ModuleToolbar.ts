import type { DiceButtonDef } from "../vmod/buildfile";
import type { ToolbarItemDef } from "../vmod/toolbar-defs";
import type { ImageSource } from "../board/images";
import { resolveToolbarIcon } from "./icons";

export interface ModuleToolbarCallbacks {
  onOpenNotes: () => void;
  onOpenTurnTracker: () => void;
  onOpenOverview: (mapName: string) => void;
  onSwitchMap: (mapName: string) => void;
  onRollDice: (def: DiceButtonDef) => void;
  onTogglePalette: () => void;
  onOpenChartWindow: (item: Extract<ToolbarItemDef, { kind: "chartWindow" }>) => void;
}

/** Which item kinds have working UI behind them; the rest stay hidden. */
export interface SupportedKinds {
  notes: boolean;
  turnTracker: boolean;
}

/**
 * The module-defined toolbar row (the Java app's main button bar): buttons and
 * dropdown menus parsed from buildFile.xml in document order. Unsupported
 * components are hidden (no dead buttons) but stay visible to debug via
 * __vb.toolbarButtons().
 */
export class ModuleToolbar {
  readonly el: HTMLElement;
  private openMenu: { trigger: HTMLElement; popover: HTMLElement } | null = null;
  private readonly dismiss = (e: PointerEvent) => {
    const m = this.openMenu;
    if (m && !m.trigger.contains(e.target as Node) && !m.popover.contains(e.target as Node)) this.closeMenu();
  };
  private readonly reposition = () => this.closeMenu(); // anchor moved: just close

  constructor(
    items: ToolbarItemDef[],
    private readonly archive: ImageSource,
    private readonly supported: SupportedKinds,
    private readonly cb: ModuleToolbarCallbacks,
  ) {
    this.el = document.createElement("div");
    this.el.className = "module-toolbar";
    for (const item of items) {
      const el = this.renderItem(item);
      if (el) this.el.appendChild(el);
    }
    window.addEventListener("pointerdown", this.dismiss);
    window.addEventListener("resize", this.reposition);
    // Capture-phase scroll: the toolbar itself can scroll horizontally.
    window.addEventListener("scroll", this.reposition, { capture: true, passive: true });
  }

  private isRenderable(item: ToolbarItemDef): boolean {
    switch (item.kind) {
      case "unsupported":
        return false;
      case "notes":
        return this.supported.notes;
      case "turnTracker":
        return this.supported.turnTracker;
      case "menu":
        return item.items.some((c) => this.isRenderable(c));
      default:
        return true;
    }
  }

  private renderItem(item: ToolbarItemDef): HTMLElement | null {
    if (!this.isRenderable(item)) return null;
    if (item.kind === "menu") return this.renderMenu(item);
    return this.renderButton(item, () => this.activate(item));
  }

  private activate(item: ToolbarItemDef): void {
    switch (item.kind) {
      case "dice": this.cb.onRollDice(item.dice); break;
      case "notes": this.cb.onOpenNotes(); break;
      case "turnTracker": this.cb.onOpenTurnTracker(); break;
      case "map": this.cb.onSwitchMap(item.mapName); break;
      case "globalMap": this.cb.onOpenOverview(item.mapName); break;
      case "pieceWindow": this.cb.onTogglePalette(); break;
      case "chartWindow": this.cb.onOpenChartWindow(item); break;
    }
  }

  private renderButton(item: ToolbarItemDef, onClick: () => void, extraClass = ""): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = ("module-tb-btn " + extraClass).trim();
    btn.title = item.tooltip || item.text;
    const icon = resolveToolbarIcon(item.icon, item.kind, this.archive);
    if (icon.type === "svg") {
      const span = document.createElement("span");
      span.className = "module-tb-icon";
      span.innerHTML = icon.svg;
      btn.appendChild(span);
    } else if (icon.type === "url") {
      const img = document.createElement("img");
      img.className = "module-tb-icon";
      img.src = icon.url;
      img.alt = "";
      btn.appendChild(img);
    }
    if (item.text) {
      const label = document.createElement("span");
      label.textContent = item.text;
      btn.appendChild(label);
    }
    btn.addEventListener("click", onClick);
    return btn;
  }

  private renderMenu(menu: Extract<ToolbarItemDef, { kind: "menu" }>): HTMLElement {
    const root = document.createElement("div");
    root.className = "module-tb-menu";
    const trigger = this.renderButton({ ...menu, kind: "menu" }, () => {
      if (this.openMenu?.trigger === trigger) this.closeMenu();
      else this.showMenu(trigger, menu);
    });
    const caret = document.createElement("span");
    caret.className = "module-tb-caret";
    caret.textContent = "▾";
    trigger.appendChild(caret);
    root.appendChild(trigger);
    return root;
  }

  /**
   * The popover lives on document.body with a fixed position anchored to the
   * trigger — the toolbar row is a horizontal scroll container, so anything
   * absolutely positioned inside it would be clipped to the row's height.
   */
  private showMenu(trigger: HTMLElement, menu: Extract<ToolbarItemDef, { kind: "menu" }>): void {
    this.closeMenu();
    const popover = document.createElement("div");
    popover.className = "module-tb-popover";
    for (const child of menu.items) {
      if (!this.isRenderable(child)) continue;
      const btn = this.renderButton(child, () => {
        this.closeMenu();
        this.activate(child);
      }, "module-tb-popover-item");
      popover.appendChild(btn);
    }
    document.body.appendChild(popover);
    const r = trigger.getBoundingClientRect();
    const pw = popover.offsetWidth;
    const ph = popover.offsetHeight;
    popover.style.left = Math.max(4, Math.min(r.left, window.innerWidth - pw - 4)) + "px";
    popover.style.top = Math.max(4, Math.min(r.bottom + 4, window.innerHeight - ph - 4)) + "px";
    this.openMenu = { trigger, popover };
  }

  private closeMenu(): void {
    this.openMenu?.popover.remove();
    this.openMenu = null;
  }
}
