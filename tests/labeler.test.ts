import { describe, expect, it } from "vitest";
import { Labeler, htmlLabelToText } from "../src/model/traits/Labeler";

describe("Labeler HTML labels", () => {
  it("converts Swing-style <html> labels to plain lines", () => {
    expect(htmlLabelToText('<HTML><DIV style="width:100px">Anytown, Province<br>1 May 1901</DIV></HTML>'))
      .toBe("Anytown, Province\n1 May 1901");
    expect(htmlLabelToText("<html><center><font size=5>S&amp;S <b>Rules</b> &lt;beta&gt;</font></center></html>"))
      .toBe("S&S Rules <beta>");
  });

  it("drops <style>/<script> content in the text fallback (scenario cards)", () => {
    expect(htmlLabelToText("<html><head><style>td { color: red; }</style></head><body>VC: hold N5<br>Turns: 5</body></html>"))
      .toBe("VC: hold N5\nTurns: 5");
    expect(htmlLabelToText("<html><script>alert(1)</script>safe</html>")).toBe("safe");
  });

  it("labelText converts only <html>-prefixed labels", () => {
    const plain = new Labeler("label;76,130;Label");
    plain.setState("Kill Zone <1>");
    expect(plain.labelText()).toBe("Kill Zone <1>");

    const html = new Labeler("label;76,130;Label");
    html.setState("<html>a<br>b</html>");
    expect(html.labelText()).toBe("a\nb");
    // The raw state is untouched (property substitution / save round-trip).
    expect(html.getState()).toBe("<html>a<br>b</html>");
    expect(html.getProperty("LabelText")).toBe("<html>a<br>b</html>");
  });

  it("htmlLabel exposes raw markup only for Swing-HTML labels", () => {
    const html = new Labeler("label;76,130;Label");
    html.setState("<html><table><tr><td>S1</td></tr></table></html>");
    expect(html.htmlLabel()).toBe("<html><table><tr><td>S1</td></tr></table></html>");
    // Plain labels render as text, never as HTML.
    const plain = new Labeler("label;76,130;Label");
    plain.setState("Objective A");
    expect(plain.htmlLabel()).toBeNull();
  });
});

describe("label $property$ substitution (FormattedString port)", () => {
  it("resolves piece properties in label text, keeping unknown refs", async () => {
    const { GamePiece } = await import("../src/model/piece");
    const { DynamicProperty } = await import("../src/model/traits/DynamicProperty");
    const { BasicPiece } = await import("../src/model/traits/BasicPiece");
    const dp = new DynamicProperty("PROP;Wounds;true,0,9,false;;");
    dp.setState("3");
    const labeler = new Labeler("label;76,130;Label");
    labeler.setState("$pieceName$: $Wounds$ wounds, $Mystery$");
    const piece = new GamePiece([labeler, dp, new BasicPiece("piece;K;D;;Grunt")]);
    expect(piece.labels()).toEqual(["Grunt: 3 wounds, $Mystery$"]);
  });

  it("resolves Embellishment layer properties (<name>_Level/_Active/_Name)", async () => {
    const { GamePiece } = await import("../src/model/piece");
    const { Embellishment } = await import("../src/model/traits/Embellishment");
    const { BasicPiece } = await import("../src/model/traits/BasicPiece");
    // emb2 layer named "TurnName" with two levels; state 2 = level 2 active.
    const emb = new Embellishment("emb2;Activate;128;A;;128;;;128;;;;1;false;0;0;t1.png,t2.png;+one,+two;true;TurnName;;;false;;1;1;true;;;;;1.0");
    emb.setState("2");
    const labeler = new Labeler("label;76,130;Label");
    labeler.setState("Turn $TurnName_Level$ ($TurnName_Name$, active=$TurnName_Active$)");
    const piece = new GamePiece([labeler, emb, new BasicPiece("piece;K;D;;Marker")]);
    expect(piece.labels()).toEqual(["Turn 2 (two, active=true)"]);
  });

  it("resolves module GlobalProperties as the last fallback", async () => {
    const { GamePiece } = await import("../src/model/piece");
    const { BasicPiece } = await import("../src/model/traits/BasicPiece");
    const { setGlobalProperties } = await import("../src/model/globals");
    setGlobalProperties(new Map([["AxisCVP", "7"]]));
    const labeler = new Labeler("label;76,130;Label");
    labeler.setState("CVP: $AxisCVP$");
    const piece = new GamePiece([labeler, new BasicPiece("piece;K;D;;Tally")]);
    expect(piece.labels()).toEqual(["CVP: 7"]);
    setGlobalProperties(new Map());
  });
});
