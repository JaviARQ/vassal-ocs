// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { unzipSync } from "fflate";
import { parseBuildFile } from "../src/vmod/buildfile";
import { ModuleArchive } from "../src/vmod/zip";
import { parseBoardArchive } from "../src/vmod/board-archive";
import { HexGridModel } from "../src/vmod/hexgrid";
import type { WidgetNode } from "../src/vmod/buildfile";
import { localExpectations, repoPath } from "./helpers/local";

// These tests exercise the real (uncommitted) complex reference module —
// custom Java classes, multiple PieceWindows, ChartWindows, external board
// archives — described by tests/fixtures/expectations.local.json. They skip
// on checkouts without the assets or the expectations file.
const EXP = localExpectations().complex;
const HAVE = EXP != null && existsSync(repoPath(join(EXP.dir, EXP.archive)));

const readBuildFile = (): string => {
  const bytes = readFileSync(repoPath(join(EXP!.dir, EXP!.archive)));
  const zip = unzipSync(new Uint8Array(bytes), { filter: (f) => f.name === "buildFile" });
  return new TextDecoder().decode(zip["buildFile"]);
};

function countSlots(node: WidgetNode): number {
  return node.slots.length + node.children.reduce((n, c) => n + countSlots(c), 0);
}

describe.skipIf(!HAVE)("complex reference module buildFile", () => {
  it("parses the buildFile with custom classes aliased to stock components", () => {
    const model = parseBuildFile(readBuildFile());
    expect(model.name).toBe(EXP!.name);
    expect(model.version).toBe(EXP!.version);
    expect(model.maps.length).toBeGreaterThanOrEqual(1);
    expect(model.maps[0].name).toBe(EXP!.mainMap);
    expect(model.prototypes.size).toBeGreaterThan(EXP!.minPrototypes);
    expect(model.palette).toBeTruthy();
    expect(countSlots(model.palette!)).toBeGreaterThan(EXP!.minSlots);
  }, 30000);

  it("toolbar has Notes, the ChartWindow, and no hidden-window button", () => {
    const model = parseBuildFile(readBuildFile());

    expect(model.toolbar.some((t) => t.kind === "notes")).toBe(true);

    const chart = model.toolbar.find((t) => t.kind === "chartWindow");
    expect(chart).toBeTruthy();
    if (chart?.kind !== "chartWindow") return;
    expect(chart.name).toBe(EXP!.chart.name);
    const top = chart.charts[0];
    expect(top.kind).toBe("tabs");
    expect(top.children.map((c) => c.name)).toEqual(EXP!.chart.tabs);
    const chartCount = (n: typeof top): number =>
      (n.kind === "chart" ? 1 : 0) + n.children.reduce((s, c) => s + chartCount(c), 0);
    expect(chartCount(top)).toBe(EXP!.chart.chartCount);

    // Hidden PieceWindows must not become toolbar buttons.
    const windows = model.toolbar.filter((t) => t.kind === "pieceWindow");
    expect(windows.map((w) => w.tooltip)).toEqual(EXP!.pieceWindowTooltips);
  }, 30000);
});

describe.skipIf(!HAVE)("real board archives", () => {
  it("declared grids, image entries, and named locations parse per archive", async () => {
    for (const board of EXP!.boards) {
      const arc = await ModuleArchive.open(new Uint8Array(readFileSync(repoPath(join(EXP!.dir, board.file)))));
      const info = parseBoardArchive(arc, board.file.split("/").pop()!);
      expect(info.name).toBe(board.name);
      expect(info.imageEntry).toBe(board.image);
      if (board.widthHexes != null) expect(info.widthHexes).toBe(board.widthHexes);
      if (board.heightHexes != null) expect(info.heightHexes).toBe(board.heightHexes);
      if (board.originX != null) expect(info.grid.originX).toBe(board.originX);
      const grid = new HexGridModel(info.grid);
      for (const [x, y, name] of board.locations ?? []) {
        expect(grid.locationName(x, y)).toBe(name);
      }
    }
  });
});
