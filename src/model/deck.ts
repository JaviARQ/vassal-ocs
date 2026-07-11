/**
 * Live DrawPile ("Deck") state. In the Java engine a DrawPile places a Deck —
 * a stack of pieces at a fixed board position players draw from — when a new
 * game starts (VASSAL/build/module/map/DrawPile.java + counters/Deck.java).
 * Many modules keep their whole counter mix in these piles on side maps, so
 * without them the table looks empty.
 *
 * Simplifications (TODO'd): deck state is not yet written to `.vsav` (a
 * loaded save re-uses the freshly-instantiated piles), and face-down pieces
 * reveal on draw (no Obscurable mask rendering yet).
 */
import type { DrawPileDef, MapDef, PieceSlotDef } from "../vmod/buildfile";
import type { GamePiece } from "./piece";

export interface DeckState {
  /** Stable id: `<mapName>:<pile name>`. */
  id: string;
  def: DrawPileDef;
  /** Remaining contents; index 0 is the top of the pile. */
  remaining: PieceSlotDef[];
  faceDown: boolean;
  /** Cached composed top piece for face-up piles; reset on draw/shuffle. */
  topPiece: GamePiece | null;
}

/** Build the live decks a map's DrawPiles declare (new-game setup). */
export function instantiateDecks(map: MapDef): DeckState[] {
  return map.drawPiles.map((def) => {
    const remaining = [...def.slots];
    // Java DrawPile ALWAYS_SHUFFLE default: shuffle at start unless "Never".
    if (def.shuffle !== "Never") shuffleArray(remaining);
    return {
      id: `${def.mapName}:${def.name}`,
      def,
      remaining,
      faceDown: def.faceDown === "Always",
      topPiece: null,
    };
  });
}

/** Pop the top slot, or null when the pile is empty. */
export function drawFromDeck(deck: DeckState): PieceSlotDef | null {
  const slot = deck.remaining.shift() ?? null;
  deck.topPiece = null;
  return slot;
}

export function shuffleDeck(deck: DeckState): void {
  shuffleArray(deck.remaining);
  deck.topPiece = null;
}

function shuffleArray<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}
