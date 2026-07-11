// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { parseBuildFile } from "../src/vmod/buildfile";
import { zoomerInitialIndex, type ToolbarItemDef } from "../src/vmod/toolbar-defs";

/** A trimmed-down mirror of a real extension-heavy buildFile toolbar structure. */
const SAMPLE_MODULE = `<?xml version="1.0"?>
<VASSAL.build.GameModule name="Sample Game" version="9.2">
  <VASSAL.build.module.NotesWindow buttonText=" Game Notes" hotkey="" icon="" tooltip="Game Notes"/>
  <VASSAL.build.module.ToolbarMenu text="Player Boards" menuItems="Player 1,Player 2,Cards Table,Missing Window" tooltip="Display Menu Options"/>
  <VASSAL.build.module.ToolbarMenu text="Dice" menuItems="D6,2D6"/>
  <VASSAL.build.module.DiceButton name="D6" text="D6" nDice="1" nSides="6" icon="/images/die.gif"/>
  <VASSAL.build.module.DiceButton name="2D6" text="2D6" nDice="2" nSides="6" icon="/images/die.gif"/>
  <VASSAL.build.module.turn.TurnTracker buttonText=" Turn Counter" name="Turn Counter"
      reportFormat="* &lt;$playerId$&gt; It is now turn $newTurn$" turnFormat="$level1$ $level2$ $level3$">
    <VASSAL.build.module.turn.CounterTurnLevel incr="1" loop="false" loopLimit="-1" name="turn" property="turn" start="1" turnFormat="$value$">
      <VASSAL.build.module.turn.ListTurnLevel list="Player A,Player B" name="player" property="player" turnFormat="$value$">
        <VASSAL.build.module.turn.ListTurnLevel list="Command Phase,Movement Phase,Morale Phase" name="Phase" property="Phase" turnFormat="$value$"/>
      </VASSAL.build.module.turn.ListTurnLevel>
    </VASSAL.build.module.turn.CounterTurnLevel>
  </VASSAL.build.module.turn.TurnTracker>
  <VASSAL.build.module.ChessClockControl buttonText="Chess Clocks" name="Chess Clock Control"/>
  <VASSAL.build.module.PieceWindow name="Models" text="Models" tooltip="Show/Hide the model window"/>
  <VASSAL.build.module.Map mapName="Table" buttonName="Map" launch="true">
    <VASSAL.build.module.map.BoardPicker/>
    <VASSAL.build.module.map.Zoomer zoomLevels="0.1,0.25,0.5,0.75,1.0,1.5,2.0,2.5,3.0" zoomStart="7"/>
    <VASSAL.build.module.ToolbarMenu text="Overview" menuItems="Overview" tooltip=""/>
    <VASSAL.build.module.map.GlobalMap buttonText="Overview" color="255,255,0" icon="/images/overview.gif" scale="0.19444444" tooltip="Overview"/>
  </VASSAL.build.module.Map>
  <VASSAL.build.module.Map mapName="Player 1" buttonName="Player 1" launch="true"/>
  <VASSAL.build.module.Map mapName="Player 2" buttonName="Player 2" launch="true"/>
  <VASSAL.build.module.Map mapName="Cards" buttonName="Cards Table" launch="true"/>
</VASSAL.build.GameModule>`;

function menu(items: ToolbarItemDef[], text: string): Extract<ToolbarItemDef, { kind: "menu" }> {
  const m = items.find((it) => it.kind === "menu" && it.text === text);
  if (!m || m.kind !== "menu") throw new Error(`menu ${text} not found`);
  return m;
}

describe("module toolbar parsing", () => {
  const model = parseBuildFile(SAMPLE_MODULE);

  it("keeps document order and captures buttons into menus", () => {
    const kinds = model.toolbar.map((t) => `${t.kind}:${t.text}`);
    expect(kinds).toEqual([
      "notes:Game Notes",
      "menu:Player Boards",
      "menu:Dice",
      "turnTracker:Turn Counter",
      "unsupported:Chess Clocks",
      "pieceWindow:Models",
      "map:Map",
      "menu:Overview", // map-level ToolbarMenu, merged into the one toolbar
    ]);
  });

  it("captures dice buttons into the Dice menu by name", () => {
    const dice = menu(model.toolbar, "Dice");
    expect(dice.items.map((i) => i.kind)).toEqual(["dice", "dice"]);
    expect(dice.items.map((i) => i.text)).toEqual(["D6", "2D6"]);
    expect(dice.unresolved).toEqual([]);
  });

  it("captures map launch buttons and records unresolved names", () => {
    const boards = menu(model.toolbar, "Player Boards");
    expect(boards.items.map((i) => i.text)).toEqual(["Player 1", "Player 2", "Cards Table"]);
    expect(boards.items.every((i) => i.kind === "map")).toBe(true);
    expect(boards.unresolved).toEqual(["Missing Window"]);
  });

  it("captures the Table GlobalMap button into the Overview menu", () => {
    const overview = menu(model.toolbar, "Overview");
    expect(overview.items).toHaveLength(1);
    const gm = overview.items[0];
    expect(gm.kind).toBe("globalMap");
    if (gm.kind === "globalMap") {
      expect(gm.mapName).toBe("Table");
      expect(gm.def.color).toBe("255,255,0");
      expect(gm.def.scale).toBeCloseTo(0.19444444);
    }
  });

  it("parses turn tracker levels with nesting", () => {
    const turn = model.toolbar.find((t) => t.kind === "turnTracker");
    if (!turn || turn.kind !== "turnTracker") throw new Error("turn tracker missing");
    expect(turn.def.levels).toHaveLength(1);
    const counter = turn.def.levels[0];
    expect(counter.kind).toBe("counter");
    expect(counter.start).toBe(1);
    const player = counter.children[0];
    expect(player.list).toEqual(["Player A", "Player B"]);
    expect(player.children[0].list).toContain("Morale Phase");
  });

  it("attaches Zoomer and GlobalMap defs to the MapDef", () => {
    const table = model.maps.find((m) => m.name === "Table")!;
    expect(table.zoomer?.levels).toEqual([0.1, 0.25, 0.5, 0.75, 1.0, 1.5, 2.0, 2.5, 3.0]);
    // Java: initial = clamp(levels.length - zoomStart) = 9 - 7 = 2 -> 0.5
    expect(table.zoomer?.initialIndex).toBe(2);
    expect(table.globalMap?.color).toBe("255,255,0");
    const p1 = model.maps.find((m) => m.name === "Player 1")!;
    expect(p1.zoomer).toBeUndefined();
  });

  it("creates launch buttons only for launch=true maps", () => {
    const mapButtons = model.toolbar
      .flatMap((t) => (t.kind === "menu" ? t.items : [t]))
      .filter((t) => t.kind === "map");
    expect(mapButtons.map((t) => t.text)).toEqual(["Player 1", "Player 2", "Cards Table", "Map"]);
  });
});

describe("zoomerInitialIndex", () => {
  it("mirrors the Java reversed one-based semantics with clamping", () => {
    expect(zoomerInitialIndex(9, 7)).toBe(2);
    expect(zoomerInitialIndex(9, 9)).toBe(0);
    expect(zoomerInitialIndex(9, 1)).toBe(8);
    expect(zoomerInitialIndex(9, 0)).toBe(8); // clamped high
    expect(zoomerInitialIndex(9, 99)).toBe(0); // clamped low
  });
});

/** The exact shape of a real nested ChartWindow subtree (trimmed). */
const CHART_MODULE = `<?xml version="1.0"?>
<VASSAL.build.GameModule name="Chart Sample" version="1.0">
  <VASSAL.build.module.ChartWindow hotkey="116,0" icon="QRC" name="QRC" text="" tooltip="QRC">
    <VASSAL.build.widget.TabWidget>
      <VASSAL.build.widget.PanelWidget entryName="Alpha" fixed="false" nColumns="3" scale="1.0" vert="true">
        <VASSAL.build.widget.TabWidget entryName="Alpha">
          <VASSAL.build.widget.Chart chartName="Alpha" fileName="tables/ALPHA_DR"/>
          <VASSAL.build.widget.Chart chartName="Alpha2" fileName="tables/ALPHA2_DR"/>
        </VASSAL.build.widget.TabWidget>
        <VASSAL.build.widget.PanelWidget fixed="false" nColumns="3" scale="1.0" vert="false">
          <VASSAL.build.widget.Chart chartName="Bravo" fileName="tables/BRAVO"/>
        </VASSAL.build.widget.PanelWidget>
      </VASSAL.build.widget.PanelWidget>
      <VASSAL.build.widget.Chart chartName="Ranged Fire" fileName="tables/RF"/>
      <VASSAL.build.widget.Chart chartName="Status" fileName="StatusTall1.gif"/>
    </VASSAL.build.widget.TabWidget>
  </VASSAL.build.module.ChartWindow>
  <VASSAL.build.module.ChartWindow name="Empty" text="" tooltip=""/>
  <VASSAL.build.module.PieceWindow name="Counters" text="" tooltip="counters"/>
  <VASSAL.build.module.PieceWindow hidden="true" name="?" text="" tooltip=""/>
  <VASSAL.build.module.Map mapName="Main Map"/>
</VASSAL.build.GameModule>`;

describe("ChartWindow parsing", () => {
  const model = parseBuildFile(CHART_MODULE);

  it("parses the chart widget tree with tab/panel nesting", () => {
    const chart = model.toolbar.find((t) => t.kind === "chartWindow");
    expect(chart).toBeTruthy();
    if (chart?.kind !== "chartWindow") return;
    expect(chart.name).toBe("QRC");
    expect(chart.icon).toBe("QRC");
    expect(chart.charts).toHaveLength(1);
    const top = chart.charts[0];
    expect(top.kind).toBe("tabs");
    expect(top.children.map((c) => `${c.kind}:${c.name}`)).toEqual([
      "panel:Alpha",
      "chart:Ranged Fire",
      "chart:Status",
    ]);
    const alpha = top.children[0];
    expect(alpha.vertical).toBe(true);
    expect(alpha.children[0].kind).toBe("tabs");
    expect(alpha.children[0].children.map((c) => c.fileName)).toEqual([
      "tables/ALPHA_DR",
      "tables/ALPHA2_DR",
    ]);
  });

  it("keeps an empty ChartWindow unsupported and hides hidden PieceWindows", () => {
    const kinds = model.toolbar.map((t) => `${t.kind}:${t.text || t.tooltip}`);
    expect(kinds).toContain("unsupported:Empty");
    expect(kinds).toContain("pieceWindow:counters");
    expect(model.toolbar.filter((t) => t.kind === "pieceWindow")).toHaveLength(1);
  });
});
