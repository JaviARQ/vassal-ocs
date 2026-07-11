import type { MapWindow } from "../board/MapWindow";

/**
 * The VASSAL GlobalMap: a mini-map of the whole board with a rectangle showing
 * the main view. Click/drag on it recenters the main map (Java behavior).
 * Redraws are rAF-coalesced and only happen while the window is open.
 */
export class OverviewMap {
  readonly el: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private queued = false;
  /** Scale + offset of the last render, for pointer→world mapping. */
  private view: { scale: number; ox: number; oy: number } | null = null;
  private dragging = false;
  private resizeObserver: ResizeObserver | null = null;

  constructor(
    private readonly getMap: () => MapWindow,
    private viewportColor = "rgb(255,255,0)",
  ) {
    this.el = document.createElement("div");
    this.el.className = "overview-map";
    this.canvas = document.createElement("canvas");
    this.canvas.className = "overview-canvas";
    this.canvas.style.touchAction = "none";
    this.el.appendChild(this.canvas);
    this.ctx = this.canvas.getContext("2d")!;

    const Observer = (window as unknown as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver;
    if (Observer) {
      this.resizeObserver = new Observer(() => this.refresh());
      this.resizeObserver.observe(this.el);
    }

    this.canvas.addEventListener("pointerdown", (e) => this.onPointerDown(e));
    this.canvas.addEventListener("pointermove", (e) => this.onPointerMove(e));
    window.addEventListener("pointerup", (e) => this.onPointerUp(e));
    window.addEventListener("pointercancel", (e) => this.onPointerUp(e));
  }

  setViewportColor(color: string): void {
    this.viewportColor = color;
  }

  /** Request a redraw (rAF-coalesced; cheap to call from onViewChanged). */
  refresh(): void {
    if (this.queued || !this.el.isConnected) return;
    this.queued = true;
    requestAnimationFrame(() => {
      this.queued = false;
      this.draw();
    });
  }

  /** Debug/verifier info about the last render. */
  info(): { scale: number; viewport: { x: number; y: number; w: number; h: number }; boardSize: { width: number; height: number } | null } | null {
    if (!this.view) return null;
    const map = this.getMap();
    return { scale: this.view.scale, viewport: map.worldViewport(), boardSize: map.boardSize() };
  }

  private draw(): void {
    const rect = this.el.getBoundingClientRect();
    if (rect.width < 4 || rect.height < 4) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (this.canvas.width !== Math.round(rect.width * dpr) || this.canvas.height !== Math.round(rect.height * dpr)) {
      this.canvas.width = Math.round(rect.width * dpr);
      this.canvas.height = Math.round(rect.height * dpr);
      this.canvas.style.width = rect.width + "px";
      this.canvas.style.height = rect.height + "px";
    }

    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.fillStyle = "#14161a";
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    const map = this.getMap();
    const size = map.boardSize();
    if (!size || size.width <= 0 || size.height <= 0) {
      this.view = null;
      return;
    }
    // Fit + center the board inside the padded canvas.
    const pad = 6;
    const availW = rect.width - pad * 2;
    const availH = rect.height - pad * 2;
    const scale = Math.min(availW / size.width, availH / size.height);
    const ox = pad + (availW - size.width * scale) / 2;
    const oy = pad + (availH - size.height * scale) / 2;
    this.view = { scale, ox, oy };

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.save();
    ctx.translate(ox, oy);
    map.renderOverview(ctx, size.width * scale, size.height * scale);

    // Main-view rectangle on top.
    const vp = map.worldViewport();
    ctx.strokeStyle = this.viewportColor;
    ctx.lineWidth = 2;
    ctx.strokeRect(vp.x * scale, vp.y * scale, vp.w * scale, vp.h * scale);
    ctx.restore();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  private centerMapAt(e: PointerEvent): void {
    if (!this.view) return;
    const r = this.canvas.getBoundingClientRect();
    const wx = (e.clientX - r.left - this.view.ox) / this.view.scale;
    const wy = (e.clientY - r.top - this.view.oy) / this.view.scale;
    this.getMap().centerOn(wx, wy);
  }

  private onPointerDown(e: PointerEvent): void {
    if (e.button === 2) return;
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      /* Older WebKit can reject capture during edge-case gesture handoff. */
    }
    this.dragging = true;
    this.centerMapAt(e);
    e.preventDefault();
  }

  private onPointerMove(e: PointerEvent): void {
    if (this.dragging) this.centerMapAt(e);
  }

  private onPointerUp(e: PointerEvent): void {
    if (!this.dragging) return;
    this.dragging = false;
    try {
      if (this.canvas.hasPointerCapture?.(e.pointerId)) this.canvas.releasePointerCapture(e.pointerId);
    } catch {
      /* Ignore capture release races during browser gesture cancellation. */
    }
  }
}
