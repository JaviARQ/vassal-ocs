import { describe, expect, it } from "vitest";
import type { KeyCommand } from "../src/model/piece";
import { SubMenu } from "../src/model/traits/SubMenu";
import { groupSubMenus } from "../src/ui/ContextMenu";

function cmd(name: string): KeyCommand {
  return { name, stroke: null, perform: () => false };
}

describe("SubMenu trait (submenu;)", () => {
  it("parses a real range-circles submenu declaration", () => {
    const trait = new SubMenu('submenu;Range Circles;1",2",3",6",9",12",18",24",30",36",48",Multi Range;');
    const [command] = trait.keyCommands();
    expect(command.name).toBe("Range Circles");
    expect(command.subCommands).toEqual(['1"', '2"', '3"', '6"', '9"', '12"', '18"', '24"', '30"', '36"', '48"', "Multi Range"]);
    expect(command.perform()).toBe(false);
    expect(trait.getState()).toBe("");
  });

  it("parses a status-counters submenu declaration", () => {
    const trait = new SubMenu("submenu;Status Counters;Pinned,Down,On Fire,Out of Ammo,Vision Arc;");
    expect(trait.keyCommands()[0].subCommands).toEqual(["Pinned", "Down", "On Fire", "Out of Ammo", "Vision Arc"]);
  });
});

describe("keystroke collapse (MenuDisplayer.createPopup parity)", () => {
  const stroke = { code: 70, ctrl: true, shift: false, alt: false, meta: false };

  it("merges same-stroke commands into one row; longest name wins; all perform", () => {
    let flips = 0;
    let reports = 0;
    const commands: KeyCommand[] = [
      { name: "Flip", stroke, perform: () => (flips++, true) },
      // keyboard-only companion on the same stroke (e.g. a ReportState)
      { name: "", stroke, perform: () => (reports++, true) },
      { name: "Flip piece", stroke, perform: () => true },
      cmd("Delete"),
    ];
    const top = groupSubMenus(commands);
    expect(top.map((e) => e.cmd.name)).toEqual(["Flip piece", "Delete"]);
    expect(top[0].cmd.perform()).toBe(true);
    expect(flips).toBe(1);
    expect(reports).toBe(1);
  });

  it("keeps distinct-stroke same-name rows separate (module data may repeat names)", () => {
    const other = { ...stroke, code: 67 };
    const top = groupSubMenus([
      { name: "Increase", stroke, perform: () => true },
      { name: "Increase", stroke: other, perform: () => true },
    ]);
    expect(top.map((e) => e.cmd.name)).toEqual(["Increase", "Increase"]);
  });

  it("never collapses null-stroke commands", () => {
    const top = groupSubMenus([cmd("A"), cmd("B")]);
    expect(top.map((e) => e.cmd.name)).toEqual(["A", "B"]);
  });
});

describe("groupSubMenus (MenuDisplayer parity)", () => {
  it("moves matching commands into the submenu and off the top level", () => {
    const commands: KeyCommand[] = [
      cmd("Delete"),
      { ...cmd("Range Circles"), subCommands: ['1"', '2"', "Multi Range"] },
      cmd("Rotate CW"),
      cmd('1"'),
      cmd('2"'),
      cmd("Multi Range"),
    ];
    const top = groupSubMenus(commands);
    expect(top.map((e) => e.cmd.name)).toEqual(["Delete", "Range Circles", "Rotate CW"]);
    const sub = top.find((e) => e.cmd.name === "Range Circles")!;
    expect(sub.children?.map((e) => e.cmd.name)).toEqual(['1"', '2"', "Multi Range"]);
  });

  it("keeps an empty submenu visible (disabled row, Java parity)", () => {
    const top = groupSubMenus([{ ...cmd("Equipment"), subCommands: ["Not Present"] }, cmd("Delete")]);
    expect(top.map((e) => e.cmd.name)).toEqual(["Equipment", "Delete"]);
    expect(top[0].children).toEqual([]);
  });

  it("drops nameless commands and moves each row at most once", () => {
    const shared = cmd("Shared");
    const commands: KeyCommand[] = [
      { ...cmd("A"), subCommands: ["Shared"] },
      { ...cmd("B"), subCommands: ["Shared"] },
      shared,
      cmd(""),
    ];
    const top = groupSubMenus(commands);
    expect(top.map((e) => e.cmd.name)).toEqual(["A", "B"]);
    const a = top.find((e) => e.cmd.name === "A")!;
    const b = top.find((e) => e.cmd.name === "B")!;
    expect(a.children).toHaveLength(1);
    expect(b.children).toHaveLength(0);
  });

  it("supports submenus nested inside submenus", () => {
    const commands: KeyCommand[] = [
      { ...cmd("Outer"), subCommands: ["Inner"] },
      { ...cmd("Inner"), subCommands: ["Leaf"] },
      cmd("Leaf"),
    ];
    const top = groupSubMenus(commands);
    expect(top.map((e) => e.cmd.name)).toEqual(["Outer"]);
    const inner = top[0].children![0];
    expect(inner.cmd.name).toBe("Inner");
    expect(inner.children![0].cmd.name).toBe("Leaf");
  });
});
