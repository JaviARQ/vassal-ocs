import { moveRect, resizeRect, type Rect, type Size } from "./window-layout";

export type WindowMode = "float" | "sheet";

export interface FrameCallbacks {
  onFocus: () => void;
  onClose: () => void;
  /** Fired when a drag/resize gesture ends — the manager persists the rect. */
  onRectChanged: (rect: Rect) => void;
}

/**
 * One managed window: title-bar chrome around an adopted content element.
 * Dragging/resizing uses the same iOS-safe Pointer Events pattern as
 * MapWindow: try/catch pointer capture, window-level move/up listeners,
 * touch-action none on the grab surfaces.
 */
export class WindowFrame {
  readonly el: HTMLElement;
  readonly body: HTMLElement;
  rect: Rect;
  private mode: WindowMode = "float";
  private gesture: {
    pointerId: number;
    kind: "move" | "resize";
    startX: number;
    startY: number;
    startRect: Rect;
  } | null = null;
  private readonly onWindowMove = (e: PointerEvent) => this.onPointerMove(e);
  private readonly onWindowUp = (e: PointerEvent) => this.onPointerUp(e);

  constructor(
    readonly id: string,
    title: string,
    content: HTMLElement,
    rect: Rect,
    private readonly minSize: Size,
    resizable: boolean,
    private readonly cb: FrameCallbacks,
  ) {
    this.rect = rect;
    this.el = document.createElement("section");
    this.el.className = "wm-window";
    this.el.dataset.windowId = id;

    const bar = document.createElement("header");
    bar.className = "wm-titlebar";
    bar.style.touchAction = "none";
    const titleEl = document.createElement("span");
    titleEl.className = "wm-title";
    titleEl.textContent = title;
    const closeBtn = document.createElement("button");
    closeBtn.className = "wm-close";
    closeBtn.type = "button";
    closeBtn.title = "Close";
    closeBtn.setAttribute("aria-label", `Close ${title}`);
    closeBtn.textContent = "✕";
    closeBtn.addEventListener("pointerdown", (e) => e.stopPropagation());
    closeBtn.addEventListener("click", () => this.cb.onClose());
    bar.append(titleEl, closeBtn);
    bar.addEventListener("pointerdown", (e) => this.startGesture(e, "move", bar));
    this.el.appendChild(bar);

    this.body = document.createElement("div");
    this.body.className = "wm-body";
    this.body.appendChild(content);
    this.el.appendChild(this.body);

    if (resizable) {
      const grip = document.createElement("div");
      grip.className = "wm-resize";
      grip.style.touchAction = "none";
      grip.addEventListener("pointerdown", (e) => this.startGesture(e, "resize", grip));
      this.el.appendChild(grip);
    }

    // Raise on any interaction with the frame (capture so content can't eat it).
    this.el.addEventListener("pointerdown", () => this.cb.onFocus(), { capture: true });

    window.addEventListener("pointermove", this.onWindowMove);
    window.addEventListener("pointerup", this.onWindowUp);
    window.addEventListener("pointercancel", this.onWindowUp);

    this.applyLayout();
  }

  setMode(mode: WindowMode): void {
    this.mode = mode;
    this.gesture = null;
    this.applyLayout();
  }

  setRect(rect: Rect): void {
    this.rect = rect;
    this.applyLayout();
  }

  /** Detach the content element (kept alive by the caller) and remove the frame. */
  dispose(): HTMLElement | null {
    const content = this.body.firstElementChild as HTMLElement | null;
    if (content) this.body.removeChild(content);
    window.removeEventListener("pointermove", this.onWindowMove);
    window.removeEventListener("pointerup", this.onWindowUp);
    window.removeEventListener("pointercancel", this.onWindowUp);
    this.el.remove();
    return content;
  }

  private applyLayout(): void {
    this.el.classList.toggle("wm-sheet", this.mode === "sheet");
    if (this.mode === "sheet") {
      this.el.style.left = "";
      this.el.style.top = "";
      this.el.style.width = "";
      this.el.style.height = "";
    } else {
      this.el.style.left = `${this.rect.x}px`;
      this.el.style.top = `${this.rect.y}px`;
      this.el.style.width = `${this.rect.w}px`;
      this.el.style.height = `${this.rect.h}px`;
    }
  }

  private viewport(): Size {
    const host = this.el.parentElement;
    const r = host?.getBoundingClientRect();
    return r && r.width > 0 ? { w: r.width, h: r.height } : { w: window.innerWidth, h: window.innerHeight };
  }

  private startGesture(e: PointerEvent, kind: "move" | "resize", surface: HTMLElement): void {
    if (this.mode === "sheet" || e.button === 2) return;
    try {
      surface.setPointerCapture(e.pointerId);
    } catch {
      /* Older WebKit can reject capture during edge-case gesture handoff. */
    }
    this.gesture = {
      pointerId: e.pointerId,
      kind,
      startX: e.clientX,
      startY: e.clientY,
      startRect: { ...this.rect },
    };
    e.preventDefault();
  }

  private onPointerMove(e: PointerEvent): void {
    const g = this.gesture;
    if (!g || e.pointerId !== g.pointerId) return;
    const dx = e.clientX - g.startX;
    const dy = e.clientY - g.startY;
    this.rect = g.kind === "move"
      ? moveRect(g.startRect, dx, dy, this.viewport())
      : resizeRect(g.startRect, dx, dy, this.minSize, this.viewport());
    this.applyLayout();
  }

  private onPointerUp(e: PointerEvent): void {
    const g = this.gesture;
    if (!g || e.pointerId !== g.pointerId) return;
    this.gesture = null;
    this.cb.onRectChanged({ ...this.rect });
  }
}
