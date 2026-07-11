import type { GamePiece } from "../model/piece";
import type { ImageStore } from "./images";

export interface PieceBounds {
  hw: number;
  hh: number;
}

export interface RenderOptions {
  pieceScale?: number;
}

/**
 * Draw a single piece centered at its (world) position. The canvas context is
 * assumed to already carry the camera transform. Rotation is applied about the
 * piece center; Embellishment layers are drawn on top of the (rotated) base.
 *
 * VASSAL's `validAngles[i] = -i*(360/n)` encodes clockwise facings, so we
 * negate to get a screen-clockwise rotation as the index increases.
 */
export function drawPiece(ctx: CanvasRenderingContext2D, piece: GamePiece, images: ImageStore, opts: RenderOptions = {}): void {
  const pieceScale = opts.pieceScale ?? 1;
  const baseName = piece.baseImageName();
  const base = images.get(baseName);
  const layers = piece.activeLayers();
  ctx.save();
  ctx.translate(piece.x, piece.y);
  const deg = piece.rotationDegrees();
  if (deg) ctx.rotate((-deg * Math.PI) / 180);

  if (base && base.loaded) {
    const w = base.width * pieceScale;
    const h = base.height * pieceScale;
    ctx.drawImage(base.img, -w / 2, -h / 2, w, h);
  } else if (baseName?.trim() && layers.length === 0) {
    // Placeholder only for true base-image pieces. Extension-defined pieces often use an
    // intentionally blank BasicPiece and visible Embellishment layers.
    ctx.fillStyle = "rgba(120,140,160,0.6)";
    ctx.fillRect(-20, -20, 40, 40);
  }

  for (const layer of layers) {
    const li = images.get(layer.name);
    if (li && li.loaded) {
      const w = li.width * layer.scale * pieceScale;
      const h = li.height * layer.scale * pieceScale;
      ctx.drawImage(li.img, -w / 2 + layer.xOff * pieceScale, -h / 2 + layer.yOff * pieceScale, w, h);
    }
  }

  for (const mark of piece.movementMarks()) {
    const mi = images.get(mark.image);
    if (mi && mi.loaded) {
      ctx.drawImage(mi.img, mark.xOff * pieceScale, mark.yOff * pieceScale, mi.width * pieceScale, mi.height * pieceScale);
    }
  }

  ctx.restore();

  // Labels are drawn unrotated, just below the piece.
  const labels = piece.labels();
  if (labels.length) {
    ctx.save();
    ctx.translate(piece.x, piece.y);
    ctx.font = "12px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    const bh = pieceHalfExtent(piece, images, pieceScale).hh;
    let y = bh + 2;
    for (const text of labels.flatMap((t) => t.split("\n"))) {
      const w = ctx.measureText(text).width;
      ctx.fillStyle = "rgba(0,0,0,0.7)";
      ctx.fillRect(-w / 2 - 2, y - 1, w + 4, 14);
      ctx.fillStyle = "#fff";
      ctx.fillText(text, 0, y);
      y += 15;
    }
    ctx.restore();
  }
}

/** Half-extents (in world units) of the full visible piece footprint. */
export function pieceHalfExtent(piece: GamePiece, images: ImageStore, pieceScale = 1): PieceBounds {
  return extents(piece, images, pieceScale, true);
}

/**
 * Half-extents of the piece's SHAPE — what Java `piece.getShape()` covers:
 * base image bounds plus active layer bounds, excluding layers flagged
 * drawUnderneathWhenSelected (Embellishment.getShape). This is the hit box
 * (PieceFinder) and the selection outline; the big vision-arc/arrow overlays
 * render but don't become grabbable area.
 */
export function pieceShapeHalfExtent(piece: GamePiece, images: ImageStore, pieceScale = 1): PieceBounds {
  return extents(piece, images, pieceScale, false);
}

function extents(piece: GamePiece, images: ImageStore, pieceScale: number, includeUnderneath: boolean): PieceBounds {
  let hw = 0;
  let hh = 0;
  const include = (name: string, xOff: number, yOff: number, scale: number) => {
    const li = images.get(name);
    if (!li || !li.loaded) return;
    // Sprites often sit on much larger transparent canvases; use the tight
    // opaque bounds so hit boxes and outlines follow the actual art.
    const m = images.mask(name);
    const t = m ? m.trim : { x: 0, y: 0, w: li.width, h: li.height };
    const s = scale * pieceScale;
    const left = xOff * pieceScale + (t.x - li.width / 2) * s;
    const right = xOff * pieceScale + (t.x + t.w - li.width / 2) * s;
    const top = yOff * pieceScale + (t.y - li.height / 2) * s;
    const bottom = yOff * pieceScale + (t.y + t.h - li.height / 2) * s;
    hw = Math.max(hw, Math.abs(left), Math.abs(right));
    hh = Math.max(hh, Math.abs(top), Math.abs(bottom));
  };
  const baseName = piece.baseImageName();
  if (baseName) include(baseName, 0, 0, 1);
  for (const layer of piece.activeLayers()) {
    if (!includeUnderneath && layer.underneath) continue;
    include(layer.name, layer.xOff, layer.yOff, layer.scale);
  }
  if (hw > 0 && hh > 0) return { hw, hh };
  return { hw: 20, hh: 20 };
}

/**
 * True if world point (wx,wy) is over the piece (accounting for rotation).
 *
 * Two stages, stricter than Java's rectangle-union PieceFinder because module
 * art often ships on big transparent canvases that would block neighbours:
 * 1. fast reject against the trimmed shape bounds (base + non-underneath
 *    layers — Embellishment.getShape semantics);
 * 2. alpha test: the point must land on an actually-opaque pixel of the base
 *    or a shape layer (small neighbourhood sampled for touch forgiveness).
 * Images without pixel data fall back to the bounds result.
 */
export function hitTestPiece(piece: GamePiece, wx: number, wy: number, images: ImageStore, pieceScale = 1): boolean {
  const dx = wx - piece.x;
  const dy = wy - piece.y;
  const deg = piece.rotationDegrees();
  let lx = dx;
  let ly = dy;
  if (deg) {
    // inverse of the draw rotation (-deg): rotate the point by +deg
    const r = (-deg * Math.PI) / 180;
    const cos = Math.cos(-r);
    const sin = Math.sin(-r);
    lx = dx * cos - dy * sin;
    ly = dx * sin + dy * cos;
  }
  const { hw, hh } = pieceShapeHalfExtent(piece, images, pieceScale);
  if (Math.abs(lx) > hw || Math.abs(ly) > hh) return false;

  let sawMask = false;
  const opaqueAt = (name: string, xOff: number, yOff: number, scale: number): boolean => {
    const li = images.get(name);
    if (!li || !li.loaded) return false;
    const m = images.mask(name);
    if (!m) return false;
    sawMask = true;
    const s = scale * pieceScale;
    const px = (lx - xOff * pieceScale) / s + li.width / 2;
    const py = (ly - yOff * pieceScale) / s + li.height / 2;
    // sample a small neighbourhood so thin limbs stay grabbable
    for (const [ox, oy] of [[0, 0], [-2, 0], [2, 0], [0, -2], [0, 2]] as const) {
      const x = Math.round(px + ox / s);
      const y = Math.round(py + oy / s);
      if (x >= 0 && y >= 0 && x < m.width && y < m.height && m.alpha[y * m.width + x] > 32) return true;
    }
    return false;
  };

  const baseName = piece.baseImageName();
  if (baseName && opaqueAt(baseName, 0, 0, 1)) return true;
  for (const layer of piece.activeLayers()) {
    if (layer.underneath) continue;
    if (opaqueAt(layer.name, layer.xOff, layer.yOff, layer.scale)) return true;
  }
  // No pixel data available (still loading / unreadable): trust the bounds.
  return !sawMask;
}

/** Transform a world point into a piece's local (unrotated) frame. */
function toLocal(piece: GamePiece, wx: number, wy: number): { x: number; y: number } {
  const dx = wx - piece.x;
  const dy = wy - piece.y;
  const deg = piece.rotationDegrees();
  if (!deg) return { x: dx, y: dy };
  const r = (deg * Math.PI) / 180; // inverse of the draw rotation (-deg)
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  return { x: dx * cos - dy * sin, y: dx * sin + dy * cos };
}

/**
 * True if the world segment (x1,y1)-(x2,y2) crosses a piece's footprint.
 * Used for line-of-sight blocking against terrain. Liang–Barsky clip against
 * the piece's (rotation-aware) bounding box.
 */
export function segmentIntersectsPiece(
  piece: GamePiece,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  images: ImageStore,
  pieceScale = 1,
): boolean {
  const a = toLocal(piece, x1, y1);
  const b = toLocal(piece, x2, y2);
  const { hw, hh } = pieceHalfExtent(piece, images, pieceScale);
  return liangBarsky(a.x, a.y, b.x, b.y, -hw, -hh, hw, hh);
}

function liangBarsky(x1: number, y1: number, x2: number, y2: number, xmin: number, ymin: number, xmax: number, ymax: number): boolean {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const p = [-dx, dx, -dy, dy];
  const q = [x1 - xmin, xmax - x1, y1 - ymin, ymax - y1];
  let t0 = 0;
  let t1 = 1;
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return false; // parallel and outside
    } else {
      const r = q[i] / p[i];
      if (p[i] < 0) {
        if (r > t1) return false;
        if (r > t0) t0 = r;
      } else {
        if (r < t0) return false;
        if (r < t1) t1 = r;
      }
    }
  }
  return true;
}

/** Draw a selection outline around the piece's hit-testable shape. */
export function drawSelection(ctx: CanvasRenderingContext2D, piece: GamePiece, images: ImageStore, opts: RenderOptions = {}): void {
  const { hw, hh } = pieceShapeHalfExtent(piece, images, opts.pieceScale ?? 1);
  ctx.save();
  ctx.translate(piece.x, piece.y);
  const deg = piece.rotationDegrees();
  if (deg) ctx.rotate((-deg * Math.PI) / 180);
  ctx.strokeStyle = "#ffcf33";
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 3]);
  ctx.strokeRect(-hw - 1, -hh - 1, hw * 2 + 2, hh * 2 + 2);
  ctx.restore();
}
