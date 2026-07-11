import { describe, expect, it } from "vitest";
import {
  cascadeRect,
  clampToViewport,
  deserializeRects,
  moveRect,
  resizeRect,
  serializeRects,
  MIN_SIZE,
  TITLE_KEEP,
  type Rect,
} from "../src/ui/wm/window-layout";

const viewport = { w: 1200, h: 800 };
const rect: Rect = { x: 100, y: 100, w: 300, h: 200 };

describe("moveRect", () => {
  it("applies deltas", () => {
    expect(moveRect(rect, 40, -30, viewport)).toEqual({ x: 140, y: 70, w: 300, h: 200 });
  });

  it("keeps part of the title bar reachable on every side", () => {
    const left = moveRect(rect, -10000, 0, viewport);
    expect(left.x).toBe(TITLE_KEEP - rect.w);
    const right = moveRect(rect, 10000, 0, viewport);
    expect(right.x).toBe(viewport.w - TITLE_KEEP);
    const up = moveRect(rect, 0, -10000, viewport);
    expect(up.y).toBe(0);
    const down = moveRect(rect, 0, 10000, viewport);
    expect(down.y).toBe(viewport.h - TITLE_KEEP);
  });
});

describe("resizeRect", () => {
  it("grows and clamps to the viewport edge", () => {
    const grown = resizeRect(rect, 200, 100, MIN_SIZE, viewport);
    expect(grown).toEqual({ x: 100, y: 100, w: 500, h: 300 });
    const huge = resizeRect(rect, 10000, 10000, MIN_SIZE, viewport);
    expect(huge.w).toBe(viewport.w - rect.x);
    expect(huge.h).toBe(viewport.h - rect.y);
  });

  it("never shrinks below the minimum size", () => {
    const tiny = resizeRect(rect, -10000, -10000, MIN_SIZE, viewport);
    expect(tiny.w).toBe(MIN_SIZE.w);
    expect(tiny.h).toBe(MIN_SIZE.h);
  });
});

describe("cascadeRect", () => {
  it("staggers successive windows and stays inside the viewport", () => {
    const a = cascadeRect(0, { w: 300, h: 200 }, viewport);
    const b = cascadeRect(1, { w: 300, h: 200 }, viewport);
    expect(b.x).toBeGreaterThan(a.x);
    expect(b.y).toBeGreaterThan(a.y);
    const small = { w: 320, h: 260 };
    const clampedCascade = cascadeRect(7, { w: 300, h: 250 }, small);
    expect(clampedCascade.x + 300).toBeLessThanOrEqual(small.w);
    expect(clampedCascade.y + 250).toBeLessThanOrEqual(small.h);
  });
});

describe("clampToViewport", () => {
  it("restores rects saved on a bigger monitor into the current screen", () => {
    const stale: Rect = { x: 2500, y: 1600, w: 500, h: 400 };
    const fixed = clampToViewport(stale, MIN_SIZE, viewport);
    expect(fixed.x).toBeLessThanOrEqual(viewport.w - TITLE_KEEP);
    expect(fixed.y).toBeLessThanOrEqual(viewport.h - TITLE_KEEP);
    expect(fixed.w).toBeLessThanOrEqual(viewport.w);
    expect(fixed.h).toBeLessThanOrEqual(viewport.h);
  });

  it("shrinks oversized rects but respects the minimum", () => {
    const oversized: Rect = { x: 0, y: 0, w: 5000, h: 5000 };
    const fixed = clampToViewport(oversized, MIN_SIZE, viewport);
    expect(fixed.w).toBe(viewport.w);
    expect(fixed.h).toBe(viewport.h);
    const undersized: Rect = { x: 0, y: 0, w: 10, h: 10 };
    const fixed2 = clampToViewport(undersized, MIN_SIZE, viewport);
    expect(fixed2.w).toBe(MIN_SIZE.w);
    expect(fixed2.h).toBe(MIN_SIZE.h);
  });
});

describe("rect persistence", () => {
  it("round-trips a map of rects", () => {
    const rects = new Map<string, Rect>([
      ["notes", { x: 10, y: 20, w: 380, h: 420 }],
      ["overview", { x: 900, y: 60, w: 300, h: 250 }],
    ]);
    expect(deserializeRects(serializeRects(rects))).toEqual(rects);
  });

  it("drops malformed entries and never throws", () => {
    expect(deserializeRects(null).size).toBe(0);
    expect(deserializeRects("not json").size).toBe(0);
    expect(deserializeRects('{"a":{"x":1,"y":2,"w":3}}').size).toBe(0); // missing h
    expect(deserializeRects('{"a":{"x":1,"y":2,"w":3,"h":"x"}}').size).toBe(0);
    expect(deserializeRects('{"a":{"x":1,"y":2,"w":300,"h":200},"b":null}').size).toBe(1);
  });
});
