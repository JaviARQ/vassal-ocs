import { describe, expect, it } from "vitest";
import { evaluateCondition, evaluateValue, substituteProperties } from "../src/vmod/expression";

const props: Record<string, string> = {
  CurrentPhase_Facing: "1",
  Player_Level: "1",
  TurnLevel: "17",
  iCVP: "2",
  Nation: "Northland",
};
const lookup = (n: string) => props[n] ?? null;

describe("evaluateCondition", () => {
  it("empty expression passes (PropertyExpression.isNull)", () => {
    expect(evaluateCondition("", lookup)).toBe(true);
  });

  it("old-style = with && (module NextTurn-style trigger)", () => {
    expect(evaluateCondition("CurrentPhase_Facing = 1 && Player_Level = 1", lookup)).toBe(true);
    expect(evaluateCondition("CurrentPhase_Facing = 2 && Player_Level = 1", lookup)).toBe(false);
    expect(evaluateCondition("CurrentPhase_Facing = 2 || Player_Level = 1", lookup)).toBe(true);
  });

  it("old-style comparisons are numeric when both sides are numbers", () => {
    expect(evaluateCondition("TurnLevel >= 17", lookup)).toBe(true);
    expect(evaluateCondition("TurnLevel < 17", lookup)).toBe(false);
    expect(evaluateCondition("Nation != Southland", lookup)).toBe(true);
  });

  it("BeanShell subset: {TurnLevel==17} and logic", () => {
    expect(evaluateCondition("{TurnLevel==17}", lookup)).toBe(true);
    expect(evaluateCondition("{TurnLevel==16}", lookup)).toBe(false);
    expect(evaluateCondition('{Nation=="Northland" && iCVP>1}', lookup)).toBe(true);
    expect(evaluateCondition('{GetProperty("Nation")=="Northland"}', lookup)).toBe(true);
  });

  it("unsupported BeanShell degrades to false, not a crash", () => {
    expect(evaluateCondition("{SomeFn(1).method}", lookup)).toBe(false);
  });
});

describe("evaluateValue", () => {
  it("plain values pass through with $...$ substitution", () => {
    expect(evaluateValue("7", lookup)).toBe("7");
    expect(evaluateValue("$Nation$ chit", lookup)).toBe("Northland chit");
  });

  it("BeanShell If() (module property-setter style)", () => {
    expect(evaluateValue("{If(iCVP==2,iCVP-1,iCVP+1)}", lookup)).toBe("1");
    expect(evaluateValue("{If(iCVP==3,iCVP-1,iCVP+1)}", lookup)).toBe("3");
  });

  it("arithmetic and concatenation", () => {
    expect(evaluateValue("{TurnLevel+1}", lookup)).toBe("18");
    expect(evaluateValue('{Nation+"!"}', lookup)).toBe("Northland!");
  });

  it("unparseable returns null so callers keep the old value", () => {
    expect(evaluateValue("{broken syntax", lookup)).toBeNull();
  });
});

describe("substituteProperties", () => {
  it("keeps unknown $refs$ verbatim (FormattedString behavior)", () => {
    expect(substituteProperties("$Nation$ in $location$", lookup)).toBe("Northland in $location$");
  });
});
