import type { GamePiece } from "../model/piece";
import type { ImageStore } from "./images";
import { drawPiece, pieceHalfExtent } from "./render";

export interface PreviewRenderOptions {
  /** CSS pixel size of the (square) canvas. Default 160. */
  size?: number;
  dprCap?: number;
  /** Never scale small pieces up beyond this factor. Default 1.5. */
  maxScale?: number;
}

/**
 * Render a composed piece (base image + active Embellishment layers + rotation
 * + labels) centered and fitted into a standalone square canvas — the palette
 * preview pane and composed thumbnails. Returns whether any of the piece's
 * images were already loaded (callers repaint via ImageStore listeners).
 */
export function renderPieceToCanvas(
  canvas: HTMLCanvasElement,
  piece: GamePiece,
  images: ImageStore,
  opts: PreviewRenderOptions = {},
): { anyImageLoaded: boolean; scale: number } {
  const size = opts.size ?? 160;
  const dpr = Math.min(window.devicePixelRatio || 1, opts.dprCap ?? 2);
  const pixels = Math.round(size * dpr);
  if (canvas.width !== pixels || canvas.height !== pixels) {
    canvas.width = pixels;
    canvas.height = pixels;
    canvas.style.width = size + "px";
    canvas.style.height = size + "px";
  }
  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const { hw, hh } = pieceHalfExtent(piece, images);
  const pad = Math.max(6, size * 0.06);
  const scale = Math.min(opts.maxScale ?? 1.5, (size - pad * 2) / (2 * hw), (size - pad * 2) / (2 * hh));

  // Pieces fresh from buildPiece sit at (0,0); draw about the canvas center.
  const px = piece.x;
  const py = piece.y;
  piece.x = 0;
  piece.y = 0;
  ctx.setTransform(scale * dpr, 0, 0, scale * dpr, (size / 2) * dpr, (size / 2) * dpr);
  drawPiece(ctx, piece, images);
  piece.x = px;
  piece.y = py;
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  const base = images.get(piece.baseImageName());
  const anyImageLoaded =
    (base?.loaded ?? false) || piece.activeLayers().some((l) => images.get(l.name)?.loaded);
  return { anyImageLoaded, scale };
}
