import { describe, expect, it } from "vitest";
import type { DrawPileDef, MapDef } from "../src/vmod/buildfile";
import { drawFromDeck, instantiateDecks, shuffleDeck } from "../src/model/deck";

function pile(over: Partial<DrawPileDef> = {}): DrawPileDef {
  return {
    name: "Blue Chits",
    mapName: "Side Table",
    x: 80,
    y: 100,
    width: 90,
    height: 90,
    drawFaceUp: false,
    faceDown: "Always",
    shuffle: "Always",
    shuffleCommand: "",
    color: null,
    owningBoard: null,
    slots: [
      { name: "Chit A", def: "+/null/piece;;;a.png;Chit A/null;0;0;1;0", width: 90, height: 90, gpid: "" },
      { name: "Chit B", def: "+/null/piece;;;b.png;Chit B/null;0;0;2;0", width: 90, height: 90, gpid: "" },
      { name: "Chit C", def: "+/null/piece;;;c.png;Chit C/null;0;0;3;0", width: 90, height: 90, gpid: "" },
    ],
    ...over,
  };
}

function mapWith(piles: DrawPileDef[]): MapDef {
  return { name: "Side Table", buttonName: "Side Table", boards: [], drawPiles: piles, layerOrder: [], losScale: 0 };
}

describe("deck instantiation", () => {
  it("creates one live deck per pile with all contents and face-down flag", () => {
    const decks = instantiateDecks(mapWith([pile()]));
    expect(decks).toHaveLength(1);
    expect(decks[0].id).toBe("Side Table:Blue Chits");
    expect(decks[0].remaining).toHaveLength(3);
    expect(decks[0].faceDown).toBe(true);
  });

  it('preserves declared order for shuffle="Never" piles', () => {
    const decks = instantiateDecks(mapWith([pile({ shuffle: "Never", faceDown: "Never" })]));
    expect(decks[0].remaining.map((s) => s.name)).toEqual(["Chit A", "Chit B", "Chit C"]);
    expect(decks[0].faceDown).toBe(false);
  });
});

describe("draw / shuffle", () => {
  it("draws from the top until empty", () => {
    const [deck] = instantiateDecks(mapWith([pile({ shuffle: "Never" })]));
    expect(drawFromDeck(deck)?.name).toBe("Chit A");
    expect(drawFromDeck(deck)?.name).toBe("Chit B");
    expect(deck.remaining).toHaveLength(1);
    expect(drawFromDeck(deck)?.name).toBe("Chit C");
    expect(drawFromDeck(deck)).toBeNull();
  });

  it("shuffle keeps the same contents", () => {
    const [deck] = instantiateDecks(mapWith([pile({ shuffle: "Never" })]));
    shuffleDeck(deck);
    expect(deck.remaining.map((s) => s.name).sort()).toEqual(["Chit A", "Chit B", "Chit C"]);
  });
});
