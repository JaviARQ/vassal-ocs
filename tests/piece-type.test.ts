import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { SequenceDecoder, SequenceEncoder } from "../src/vmod/sequence";
import {
  decodeAddPiece,
  splitChain,
  typeId,
  buildPiece,
  buildPieceFromTypeState,
  encodeStateChain,
} from "../src/vmod/piece-type";
import { GamePiece } from "../src/model/piece";
import { MovementMarkable } from "../src/model/traits/MovementMarkable";

const fixture = readFileSync(
  fileURLToPath(new URL("./fixtures/terrain-tile.piece", import.meta.url)),
  "utf8",
).replace(/\n$/, "");

describe("SequenceDecoder", () => {
  it("splits simple tokens", () => {
    const d = new SequenceDecoder("a;b;c", ";");
    expect([d.nextToken(), d.nextToken(), d.nextToken()]).toEqual(["a", "b", "c"]);
    expect(d.hasMoreTokens()).toBe(false);
  });

  it("treats \\-escaped delimiters as literal", () => {
    const d = new SequenceDecoder("a\\;b;c", ";");
    expect(d.nextToken()).toBe("a;b");
    expect(d.nextToken()).toBe("c");
  });

  it("round-trips through the encoder", () => {
    const raw = ["ArrowLeft", "a;b", "c\\d", "'quoted'"];
    const enc = new SequenceEncoder(";");
    for (const s of raw) enc.append(s);
    const dec = new SequenceDecoder(enc.getValue(), ";");
    const out = raw.map(() => dec.nextToken());
    expect(out).toEqual(raw);
  });
});

describe("real terrain-tile piece chain", () => {
  const { id, type, state } = decodeAddPiece(fixture);

  it("decodes the AddPiece envelope", () => {
    expect(id).toBe("null");
    expect(type.startsWith("mark;Layer")).toBe(true);
    expect(type.includes("piece;;;terrain_tile.png;Terrain Tile")).toBe(true);
  });

  it("splits the type chain outer->inner", () => {
    const segs = splitChain(type).map(typeId);
    expect(segs).toEqual(["mark;", "immob;", "delete;", "clone;", "rotate;", "piece;"]);
  });

  it("splits the state chain (parallel to type)", () => {
    expect(splitChain(state).length).toBe(6);
  });

  const piece = buildPiece(fixture);

  it("exposes the base image and Layer property", () => {
    expect(piece.baseImageName()).toBe("terrain_tile.png");
    expect(piece.getProperty("Layer")).toBe("Terrain");
  });

  it("has rotate + delete + clone key commands", () => {
    const names = piece.keyCommands().map((k) => k.name);
    expect(names).toContain("Rotate CW");
    expect(names).toContain("Rotate CCW");
    expect(names).toContain("Delete");
    expect(names).toContain("Clone");
  });

  it("rotates in 16 steps of 22.5 degrees", () => {
    expect(piece.rotationDegrees()).toBeCloseTo(0);
    const cw = piece.keyCommands().find((k) => k.name === "Rotate CW")!;
    expect(cw.perform()).toBe(true);
    expect(piece.rotationDegrees()).toBeCloseTo(-22.5);
  });

  it("state chain round-trips (encode -> split)", () => {
    const encoded = encodeStateChain(buildPieceFromTypeState(type, state));
    const back = splitChain(encoded);
    expect(back.length).toBe(6);
    expect(back[0]).toBe("Terrain");
  });
});

describe("movement marker commands", () => {
  it("does not expose duplicate Mark Moved menu entries", () => {
    const piece = new GamePiece([
      new MovementMarkable("markmoved;moved.gif;0;0;Mark Moved;77,0;;false;Mark Moved;;Clear Moved;;"),
    ]);

    const names = piece.keyCommands().map((c) => c.name);

    expect(names.filter((name) => name === "Mark Moved")).toHaveLength(1);
    expect(names).toContain("Clear Moved");
  });
});
