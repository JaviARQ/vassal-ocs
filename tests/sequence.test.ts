import { describe, expect, it } from "vitest";
import { SequenceDecoder, SequenceEncoder, TYPE_DELIM } from "../src/vmod/sequence";

function decodeAll(value: string | null, delim: string): string[] {
  const dec = new SequenceDecoder(value, delim);
  const out: string[] = [];
  while (dec.hasMoreTokens()) out.push(dec.nextToken());
  return out;
}

describe("SequenceDecoder", () => {
  it("splits plain tokens on the delimiter", () => {
    expect(decodeAll("piece;;;Meadow.png;Meadow", ";")).toEqual(["piece", "", "", "Meadow.png", "Meadow"]);
  });

  it("treats a backslash-escaped delimiter as a literal", () => {
    expect(decodeAll("a\\;b;c", ";")).toEqual(["a;b", "c"]);
  });

  it("yields an empty final token after a trailing delimiter (Java parity)", () => {
    expect(decodeAll("a;", ";")).toEqual(["a", ""]);
  });

  it("has no tokens for a null value, one empty token for an empty string", () => {
    expect(new SequenceDecoder(null, ";").hasMoreTokens()).toBe(false);
    expect(decodeAll("", ";")).toEqual([""]);
  });

  it("strips surrounding single quotes (unquote)", () => {
    expect(decodeAll("'\\lead';x", ";")).toEqual(["\\lead", "x"]);
  });

  it("nextInt / nextDouble / nextBoolean fall back to defaults", () => {
    const dec = new SequenceDecoder("7;;true", ";");
    expect(dec.nextInt(0)).toBe(7);
    expect(dec.nextInt(42)).toBe(42); // blank token
    expect(dec.nextBoolean(false)).toBe(true);
    expect(dec.nextInt(5)).toBe(5); // exhausted
    expect(new SequenceDecoder("1.5", ";").nextDouble(0)).toBe(1.5);
  });

  it("nextStringArray reads a comma-encoded sub-sequence padded to minLength", () => {
    const dec = new SequenceDecoder("a,b\\,c;rest", ";");
    expect(dec.nextStringArray(4)).toEqual(["a", "b,c", "", ""]);
    expect(dec.nextToken()).toBe("rest");
  });

  it("getRemaining returns the still-escaped tail", () => {
    const dec = new SequenceDecoder("head;a\\;b;c", ";");
    dec.nextToken();
    expect(dec.getRemaining()).toBe("a\\;b;c");
  });
});

describe("SequenceEncoder round-trips with the decoder", () => {
  const tricky = [
    "plain",
    "",
    "has;delim",
    "\\leading backslash",
    "'quoted'",
    "'",
    "'leading quote only",
    "multi;de;lims",
  ];

  it.each([";", ",", TYPE_DELIM])("round-trips tricky values over delimiter %j", (delim) => {
    const enc = new SequenceEncoder(delim);
    for (const v of tricky) enc.append(v);
    expect(decodeAll(enc.getValue(), delim)).toEqual(tricky);
  });

  it("quote-wraps exactly the values Java does (leading backslash, or quote at both ends)", () => {
    expect(new SequenceEncoder(";", "\\x").getValue()).toBe("'\\x'");
    expect(new SequenceEncoder(";", "'both'").getValue()).toBe("''both''");
    // A bare leading quote is NOT wrapped (Java's exact condition).
    expect(new SequenceEncoder(";", "'y").getValue()).toBe("'y");
  });

  it("reproduces the Java quirk: a value ending in a bare backslash merges with the next token", () => {
    const enc = new SequenceEncoder(";").append("trailing\\").append("x");
    expect(decodeAll(enc.getValue(), ";")).toEqual(["trailing;x"]);
  });

  it("stringifies numbers and booleans like Java's overloads", () => {
    const enc = new SequenceEncoder(";").append(3).append(true).append(2.5);
    expect(enc.getValue()).toBe("3;true;2.5");
  });
});
