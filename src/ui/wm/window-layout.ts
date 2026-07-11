/**
 * Pure geometry/persistence helpers for the in-page window manager. No DOM —
 * everything here is unit-testable in vitest.
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Size {
  w: number;
  h: number;
}

/** Minimum pixels of title bar that must stay reachable inside the viewport. */
export const TITLE_KEEP = 44;

export const MIN_SIZE: Size = { w: 220, h: 140 };

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi);
}

/** Move a window rect, keeping part of its title bar on-screen. */
export function moveRect(rect: Rect, dx: number, dy: number, viewport: Size): Rect {
  return {
    ...rect,
    x: clamp(rect.x + dx, TITLE_KEEP - rect.w, Math.max(TITLE_KEEP - rect.w, viewport.w - TITLE_KEEP)),
    y: clamp(rect.y + dy, 0, Math.max(0, viewport.h - TITLE_KEEP)),
  };
}

/** Resize from the bottom-right corner, clamped to min size and viewport. */
export function resizeRect(rect: Rect, dx: number, dy: number, min: Size, viewport: Size): Rect {
  return {
    ...rect,
    w: clamp(rect.w + dx, min.w, Math.max(min.w, viewport.w - rect.x)),
    h: clamp(rect.h + dy, min.h, Math.max(min.h, viewport.h - rect.y)),
  };
}

/** Default position for the nth opened window: a diagonal cascade. */
export function cascadeRect(index: number, size: Size, viewport: Size): Rect {
  const step = 28;
  const offset = 56 + step * (index % 8);
  return {
    x: clamp(offset, 0, Math.max(0, viewport.w - size.w)),
    y: clamp(offset, 0, Math.max(0, viewport.h - size.h)),
    w: size.w,
    h: size.h,
  };
}

/**
 * Sanitize a (possibly persisted-from-another-screen) rect so the window is
 * usable in the current viewport: shrink to fit and keep the title reachable.
 */
export function clampToViewport(rect: Rect, min: Size, viewport: Size): Rect {
  const w = clamp(rect.w, min.w, Math.max(min.w, viewport.w));
  const h = clamp(rect.h, min.h, Math.max(min.h, viewport.h));
  return {
    w,
    h,
    x: clamp(rect.x, 0, Math.max(0, viewport.w - Math.min(w, TITLE_KEEP * 2))),
    y: clamp(rect.y, 0, Math.max(0, viewport.h - TITLE_KEEP)),
  };
}

export function serializeRects(rects: ReadonlyMap<string, Rect>): string {
  const out: Record<string, Rect> = {};
  for (const [id, r] of rects) out[id] = { x: r.x, y: r.y, w: r.w, h: r.h };
  return JSON.stringify(out);
}

/** Parse persisted rects, dropping malformed entries. Never throws. */
export function deserializeRects(json: string | null | undefined): Map<string, Rect> {
  const out = new Map<string, Rect>();
  if (!json) return out;
  try {
    const parsed = JSON.parse(json) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") return out;
    for (const [id, v] of Object.entries(parsed)) {
      const r = v as Partial<Rect> | null;
      if (
        r &&
        typeof r.x === "number" && Number.isFinite(r.x) &&
        typeof r.y === "number" && Number.isFinite(r.y) &&
        typeof r.w === "number" && Number.isFinite(r.w) &&
        typeof r.h === "number" && Number.isFinite(r.h)
      ) {
        out.set(id, { x: r.x, y: r.y, w: r.w, h: r.h });
      }
    }
  } catch {
    /* corrupted storage — start fresh */
  }
  return out;
}
