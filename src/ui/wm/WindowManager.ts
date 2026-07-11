import { WindowFrame, type WindowMode } from "./WindowFrame";
import {
  cascadeRect,
  clampToViewport,
  deserializeRects,
  serializeRects,
  MIN_SIZE,
  type Rect,
  type Size,
} from "./window-layout";

export interface WindowOptions {
  /** Stable key, e.g. "notes", "overview", "turn-tracker". */
  id: string;
  title: string;
  /** Adopted, never destroyed: closing detaches it so component state survives. */
  content: HTMLElement;
  width?: number;
  height?: number;
  x?: number;
  y?: number;
  minWidth?: number;
  minHeight?: number;
  resizable?: boolean;
  onClose?: () => void;
}

const RECTS_STORAGE_KEY = "vb.wm.rects";
/** Below this width, windows render as full-screen sheets instead of floats. */
export const SHEET_MAX_WIDTH = 720;

/**
 * Adaptive in-page window manager (the VASSAL floating tool windows). Float
 * mode on desktop/tablet: draggable/resizable frames, click-to-raise z-stack.
 * Sheet mode under SHEET_MAX_WIDTH: each window fills the screen, only the top
 * of the stack is visible, and a switcher bar swaps between open windows.
 */
export class WindowManager {
  readonly layer: HTMLElement;
  private frames = new Map<string, WindowFrame>();
  private order: string[] = [];
  private onCloseHooks = new Map<string, (() => void) | undefined>();
  private savedRects: Map<string, Rect>;
  private switcher: HTMLElement;
  private media: MediaQueryList;

  constructor(host: HTMLElement) {
    this.layer = document.createElement("div");
    this.layer.className = "wm-layer";
    host.appendChild(this.layer);

    this.switcher = document.createElement("nav");
    this.switcher.className = "wm-switcher";
    this.layer.appendChild(this.switcher);

    this.savedRects = deserializeRects(safeStorageGet(RECTS_STORAGE_KEY));

    this.media = window.matchMedia(`(max-width: ${SHEET_MAX_WIDTH}px)`);
    const onModeChange = () => this.applyMode();
    if (typeof this.media.addEventListener === "function") this.media.addEventListener("change", onModeChange);
    else this.media.addListener(onModeChange); // older WebKit
    this.applyMode();
  }

  mode(): WindowMode {
    return this.media.matches ? "sheet" : "float";
  }

  isOpen(id: string): boolean {
    return this.frames.has(id);
  }

  /** Create the window, or just raise it if already open. */
  open(opts: WindowOptions): void {
    const existing = this.frames.get(opts.id);
    if (existing) {
      this.focus(opts.id);
      return;
    }
    const viewport = this.viewport();
    const min: Size = { w: opts.minWidth ?? MIN_SIZE.w, h: opts.minHeight ?? MIN_SIZE.h };
    const size: Size = { w: opts.width ?? 380, h: opts.height ?? 420 };
    const saved = this.savedRects.get(opts.id);
    const rect: Rect = saved
      ? clampToViewport(saved, min, viewport)
      : opts.x != null && opts.y != null
        ? clampToViewport({ x: opts.x, y: opts.y, w: size.w, h: size.h }, min, viewport)
        : cascadeRect(this.order.length, size, viewport);

    const frame = new WindowFrame(opts.id, opts.title, opts.content, rect, min, opts.resizable ?? true, {
      onFocus: () => this.focus(opts.id),
      onClose: () => this.close(opts.id),
      onRectChanged: (r) => {
        this.savedRects.set(opts.id, r);
        safeStorageSet(RECTS_STORAGE_KEY, serializeRects(this.savedRects));
      },
    });
    frame.setMode(this.mode());
    this.frames.set(opts.id, frame);
    this.onCloseHooks.set(opts.id, opts.onClose);
    this.order.push(opts.id);
    this.layer.appendChild(frame.el);
    this.restack();
  }

  close(id: string): void {
    const frame = this.frames.get(id);
    if (!frame) return;
    frame.dispose();
    this.frames.delete(id);
    this.order = this.order.filter((x) => x !== id);
    const hook = this.onCloseHooks.get(id);
    this.onCloseHooks.delete(id);
    this.restack();
    hook?.();
  }

  /** Toolbar-button behavior: open if closed, close if open. */
  toggle(id: string, make: () => WindowOptions): void {
    if (this.isOpen(id)) this.close(id);
    else this.open(make());
  }

  focus(id: string): void {
    const idx = this.order.indexOf(id);
    if (idx < 0 || idx === this.order.length - 1) return;
    this.order.splice(idx, 1);
    this.order.push(id);
    this.restack();
  }

  list(): Array<{ id: string; title: string; mode: WindowMode; rect: Rect; order: number }> {
    return this.order.map((id, order) => {
      const frame = this.frames.get(id)!;
      return {
        id,
        title: frame.el.querySelector(".wm-title")?.textContent ?? id,
        mode: this.mode(),
        rect: { ...frame.rect },
        order,
      };
    });
  }

  private viewport(): Size {
    const r = this.layer.getBoundingClientRect();
    return r.width > 0 ? { w: r.width, h: r.height } : { w: window.innerWidth, h: window.innerHeight };
  }

  private applyMode(): void {
    const mode = this.mode();
    this.layer.classList.toggle("wm-mode-sheet", mode === "sheet");
    this.layer.classList.toggle("wm-mode-float", mode === "float");
    for (const frame of this.frames.values()) frame.setMode(mode);
    this.renderSwitcher();
  }

  private restack(): void {
    this.order.forEach((id, i) => {
      const frame = this.frames.get(id)!;
      frame.el.style.zIndex = String(500 + i);
      frame.el.classList.toggle("wm-top", i === this.order.length - 1);
    });
    this.renderSwitcher();
  }

  /** Sheet-mode tab row for hopping between open windows. */
  private renderSwitcher(): void {
    this.switcher.innerHTML = "";
    const show = this.mode() === "sheet" && this.order.length >= 2;
    this.switcher.classList.toggle("visible", show);
    this.layer.classList.toggle("wm-has-switcher", show);
    if (!show) return;
    const top = this.order[this.order.length - 1];
    for (const id of this.order) {
      const frame = this.frames.get(id)!;
      const tab = document.createElement("button");
      tab.type = "button";
      tab.className = "wm-switcher-tab" + (id === top ? " active" : "");
      tab.textContent = frame.el.querySelector(".wm-title")?.textContent ?? id;
      tab.addEventListener("click", () => this.focus(id));
      this.switcher.appendChild(tab);
    }
  }
}

function safeStorageGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null; // Safari private mode
  }
}

function safeStorageSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* Safari private mode / quota — positions just won't persist */
  }
}
