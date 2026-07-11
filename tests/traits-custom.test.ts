import { describe, expect, it } from "vitest";
import { GamePiece } from "../src/model/piece";
import { BasicPiece } from "../src/model/traits/BasicPiece";
import { DynamicProperty } from "../src/model/traits/DynamicProperty";
import { TriggerAction } from "../src/model/traits/TriggerAction";
import { PlaceMarker, PlaceDM, Replace } from "../src/model/traits/PlaceMarker";
import { ReportState } from "../src/model/traits/ReportState";
import { Concealable } from "../src/model/traits/custom/Concealable";
import { TextInfo } from "../src/model/traits/custom/TextInfo";
import { MovedMarker } from "../src/model/traits/custom/MovedMarker";

function pieceWith(...traits: ConstructorParameters<typeof GamePiece>[0]): GamePiece {
  return new GamePiece(traits);
}

function runNamed(piece: GamePiece, name: string): boolean {
  const cmd = piece.keyCommands().find((c) => c.name === name);
  expect(cmd, `command ${name}`).toBeTruthy();
  return cmd!.perform();
}

describe("DynamicProperty (PROP;)", () => {
  it("parses a TurnLevel property: increment with wrap and plain set", () => {
    // real module segment shape: PROP;TurnLevel;true,1,17,true;:70\,130:I\,1,:82\,650:P\,1;
    const dp = new DynamicProperty("PROP;TurnLevel;true,1,17,true;:70\\,130:I\\,1,:82\\,650:P\\,1;");
    dp.setState("17");
    const piece = pieceWith(dp, new BasicPiece("piece;K;D;;Squad"));
    expect(piece.getProperty("TurnLevel")).toBe("17");
    const cmds = dp.keyCommands(piece);
    expect(cmds).toHaveLength(2);
    // increment by 1 wraps 17 -> 1 (min 1, max 17, wrap)
    cmds[0].perform();
    expect(dp.getState()).toBe("1");
    // plain setter back to 1
    cmds[1].perform();
    expect(dp.getState()).toBe("1");
  });

  it("clamps non-wrapping numeric values", () => {
    const dp = new DynamicProperty("PROP;CVP;true,0,10,false;:45\\,195:I\\,4;");
    dp.setState("8");
    const piece = pieceWith(dp, new BasicPiece("piece;K;D;;Squad"));
    dp.keyCommands(piece)[0].perform();
    expect(dp.getState()).toBe("10");
  });
});

describe("TriggerAction (macro;)", () => {
  it("fires action keys at the piece when the property match passes", () => {
    // Trigger: on Ctrl+T (84,130), if Level==2 fire Ctrl+X (88,130) which increments Level
    const dp = new DynamicProperty("PROP;Level;true,0,10,false;:88\\,130:I\\,1;");
    dp.setState("2");
    const trig = new TriggerAction("macro;;Fire;84,130;{Level==2};;88\\,130;false;;;counted;;;;false;;1;1");
    const piece = pieceWith(trig, dp, new BasicPiece("piece;K;D;;Squad"));
    expect(runNamed(piece, "Fire")).toBe(true);
    expect(dp.getState()).toBe("3");
    // condition now false -> firing again changes nothing
    expect(runNamed(piece, "Fire")).toBe(false);
    expect(dp.getState()).toBe("3");
  });
});

describe("PlaceMarker family", () => {
  it("queues a placement with VASSAL-up-positive y offset", () => {
    const pm = new PlaceMarker("placemark;Place DM;68,130;VASSAL.build.module.PieceWindow:Markers\\/VASSAL.build.widget.PieceSlot:DM;null;10;20;false");
    const piece = pieceWith(pm, new BasicPiece("piece;K;D;;Squad"));
    runNamed(piece, "Place DM");
    expect(piece.pendingPlacements).toHaveLength(1);
    const pl = piece.pendingPlacements[0];
    expect(pl.spec).toContain("PieceSlot:DM");
    expect(pl.dx).toBe(10);
    expect(pl.dy).toBe(-20);
    expect(pl.replaceSelf).toBe(false);
  });

  it("Replace marks the placement replaceSelf", () => {
    const r = new Replace("replace;Wreck;70,130;path\\/VASSAL.build.widget.PieceSlot:Wrecked Boat;null;0;0;true");
    const piece = pieceWith(r, new BasicPiece("piece;K;D;;Boat"));
    runNamed(piece, "Wreck");
    expect(piece.pendingPlacements[0].replaceSelf).toBe(true);
  });

  it("PlaceDM skips pieces whose name reads broken", () => {
    const dm = new PlaceDM("placeDM;;66,130;x\\/VASSAL.build.widget.PieceSlot:DM;null;0;0;false");
    const broken = pieceWith(dm, new BasicPiece("piece;K;D;;broken squad"));
    for (const c of broken.keyCommands()) c.perform();
    expect(broken.pendingPlacements).toHaveLength(0);
  });
});

describe("ReportState (report;)", () => {
  it("queues a substituted report when its key fires", () => {
    const rs = new ReportState("report;66\\,130;$pieceName$ breaks in $location$;;");
    const piece = pieceWith(rs, new BasicPiece("piece;K;D;;4-6-7"));
    for (const c of piece.keyCommands()) c.perform();
    expect(piece.pendingReports).toEqual(["4-6-7 breaks in $location$"]);
  });
});

describe("custom traits: Concealable / TextInfo / MarkMoved", () => {
  it("Conceal toggles state and overlays the ? image", () => {
    const c = new Concealable("conceal;C;na/qmark58.png;na");
    const piece = pieceWith(c, new BasicPiece("piece;K;D;;4-6-7"));
    expect(c.concealed()).toBe(false);
    runNamed(piece, "Conceal");
    expect(c.concealed()).toBe(true);
    expect(c.getState()).toBe("me;");
    expect(c.layerImages()).toEqual([{ name: "na/qmark58.png", xOff: 0, yOff: 0, scale: 1 }]);
    runNamed(piece, "Unconceal");
    expect(c.concealed()).toBe(false);
    expect(c.layerImages()).toEqual([]);
  });

  it("TextInfo toggles the info text and reports it", () => {
    const info = new TextInfo("info;MP 3,FP 2,(un)loadx2");
    const piece = pieceWith(info, new BasicPiece("piece;K;D;;Boat"));
    expect(info.labelText()).toBeNull();
    runNamed(piece, "Show Info");
    expect(info.labelText()).toBe("MP 3,FP 2,(un)loadx2");
    expect(piece.pendingReports[0]).toContain("MP 3");
  });

  it("moved; marker exposes the MovementMarkable contract", () => {
    const mm = new MovedMarker("moved;moved.gif");
    const piece = pieceWith(mm, new BasicPiece("piece;K;D;;Squad"));
    expect(piece.movedStatus()).toBe(false);
    piece.setMovedStatus(true);
    expect(piece.movedStatus()).toBe(true);
    expect(mm.movementMark()).toEqual({ image: "moved.gif", xOff: 0, yOff: 0 });
  });
});
