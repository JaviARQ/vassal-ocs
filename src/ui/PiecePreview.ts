import type { ImageStore } from "../board/images";
import { renderPieceToCanvas } from "../board/piece-preview";
import type { GamePiece } from "../model/piece";
import type { PieceSlotDef } from "../vmod/buildfile";
import { buildPiece } from "../vmod/piece-type";

export interface PiecePreviewCallbacks {
  /** Place button / tap: drop at the current view center. */
  onPlace: (slot: PieceSlotDef) => void;
  /** Drag from the preview released at client coordinates. */
  onDrop: (slot: PieceSlotDef, clientX: number, clientY: number) => void;
}

/**
 * The counter preview pane at the bottom of the palette (VASSAL PieceWindow):
 * a composed rendering of the selected slot's piece, its name and trait
 * summary, a Place button, and drag-to-place onto the map canvas.
 */
export class PiecePreview {
  readonly el: HTMLElement;
  private canvas: HTMLCanvasElement;
  private nameEl: HTMLElement;
  private traitsEl: HTMLElement;
  private placeBtn: HTMLButtonElement;
  private slot: PieceSlotDef | null = null;
  private piece: GamePiece | null = null;
  private ghost: HTMLCanvasElement | null = null;
  private drag: { pointerId: number; startX: number; startY: number; moved: boolean } | null = null;
  private readonly onWindowMove = (e: PointerEvent) => this.onPointerMove(e);
  private readonly onWindowUp = (e: PointerEvent) => this.onPointerUp(e);

  constructor(
    private readonly images: ImageStore,
    private readonly cb: PiecePreviewCallbacks,
  ) {
    this.el = document.createElement("div");
    this.el.className = "piece-preview";
    this.el.hidden = true;

    this.canvas = document.createElement("canvas");
    this.canvas.className = "piece-preview-canvas";
    this.canvas.style.touchAction = "none";
    this.canvas.title = "Drag onto the table to place";
    this.canvas.addEventListener("pointerdown", (e) => this.onPointerDown(e));
    window.addEventListener("pointermove", this.onWindowMove);
    window.addEventListener("pointerup", this.onWindowUp);
    window.addEventListener("pointercancel", this.onWindowUp);

    const info = document.createElement("div");
    info.className = "piece-preview-info";
    this.nameEl = document.createElement("div");
    this.nameEl.className = "piece-preview-name";
    this.traitsEl = document.createElement("div");
    this.traitsEl.className = "piece-preview-traits";
    this.placeBtn = document.createElement("button");
    this.placeBtn.type = "button";
    this.placeBtn.className = "preview-place";
    this.placeBtn.textContent = "Place";
    this.placeBtn.title = "Place at the center of the current view";
    this.placeBtn.addEventListener("click", () => {
      if (this.slot) this.cb.onPlace(this.slot);
    });
    info.append(this.nameEl, this.traitsEl, this.placeBtn);

    this.el.append(this.canvas, info);
    this.images.addListener(() => this.redraw());
  }

  /** Show a slot in the pane (single click/tap on a palette entry). */
  show(slot: PieceSlotDef): void {
    this.slot = slot;
    try {
      this.piece = buildPiece(slot.def);
    } catch {
      this.piece = null;
    }
    this.el.hidden = false;
    this.nameEl.textContent = slot.name || this.piece?.name() || "(piece)";
    this.traitsEl.textContent = this.piece ? traitSummary(this.piece) : "";
    this.redraw();
  }

  /** Currently previewed slot, for the Place path and debug. */
  currentSlot(): PieceSlotDef | null {
    return this.slot;
  }

  /** Debug/verifier: does the preview canvas contain non-transparent pixels? */
  info(): { slotName: string | null; hasPixels: boolean } {
    let hasPixels = false;
    if (!this.el.hidden && this.piece) {
      const ctx = this.canvas.getContext("2d")!;
      const data = ctx.getImageData(0, 0, this.canvas.width, this.canvas.height).data;
      for (let i = 3; i < data.length; i += 4) {
        if (data[i] !== 0) {
          hasPixels = true;
          break;
        }
      }
    }
    return { slotName: this.slot?.name ?? null, hasPixels };
  }

  private redraw(): void {
    if (this.el.hidden || !this.piece || !this.canvas.isConnected) return;
    renderPieceToCanvas(this.canvas, this.piece, this.images, { size: 148 });
  }

  // ---- drag-to-place ---------------------------------------------------------

  private onPointerDown(e: PointerEvent): void {
    if (!this.slot || e.button === 2) return;
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      /* Older WebKit can reject capture during edge-case gesture handoff. */
    }
    this.drag = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, moved: false };
    e.preventDefault();
  }

  private onPointerMove(e: PointerEvent): void {
    const d = this.drag;
    if (!d || e.pointerId !== d.pointerId) return;
    if (!d.moved && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) > 6) {
      d.moved = true;
      this.ghost = this.canvas.cloneNode(true) as HTMLCanvasElement;
      this.ghost.className = "piece-preview-ghost";
      this.ghost.getContext("2d")!.drawImage(this.canvas, 0, 0);
      document.body.appendChild(this.ghost);
    }
    if (this.ghost) {
      const half = this.ghost.offsetWidth / 2 || 74;
      this.ghost.style.left = e.clientX - half + "px";
      this.ghost.style.top = e.clientY - half + "px";
    }
  }

  private onPointerUp(e: PointerEvent): void {
    const d = this.drag;
    if (!d || e.pointerId !== d.pointerId) return;
    this.drag = null;
    this.ghost?.remove();
    this.ghost = null;
    try {
      if (this.canvas.hasPointerCapture?.(e.pointerId)) this.canvas.releasePointerCapture(e.pointerId);
    } catch {
      /* Ignore capture release races during browser gesture cancellation. */
    }
    if (d.moved && this.slot) this.cb.onDrop(this.slot, e.clientX, e.clientY);
  }
}

/** Short human summary of the piece's interesting traits. */
function traitSummary(piece: GamePiece): string {
  const parts: string[] = [];
  const layers = piece.activeLayers();
  if (layers.length) parts.push(`${layers.length} layer${layers.length === 1 ? "" : "s"}`);
  const commands = piece.keyCommands().filter((c) => c.name);
  if (commands.some((c) => /rotate/i.test(c.name))) parts.push("rotates");
  if (piece.isImmobile()) parts.push("locked");
  if (commands.length) parts.push(`${commands.length} commands`);
  return parts.join(" • ");
}
