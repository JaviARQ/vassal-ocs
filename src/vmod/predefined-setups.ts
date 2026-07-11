import { unzipSync } from "fflate";
import { boardKey, type BoardDef, type MapDef, type PredefinedSetupDef } from "./buildfile";
import type { ModuleArchive } from "./zip";
import { decodeVassalSavedGame, parseBoardPickerCommand } from "./vsav";

export interface ParsedBoardPickerSetup {
  mapName: string;
  tiles: Array<{ boardName: string; x: number; y: number }>;
}

/**
 * VASSAL predefined setups are saved games. For board-only setups, the relevant
 * command is a BoardPicker command inside the obfuscated `savedGame` stream.
 */
export function applyPredefinedSetupBoards(maps: MapDef[], setups: PredefinedSetupDef[], archive: ModuleArchive): void {
  const insertAtByMap = new Map<string, number>();
  for (const setup of setups) {
    if (!setup.file || setup.isMenu || !setup.useFile) continue;
    const bytes = archive.bytes(setup.file);
    if (!bytes) continue;

    for (const parsed of parseSavedGameBoardPickers(bytes)) {
      const map = maps.find((m) => m.name === parsed.mapName || m.buttonName === parsed.mapName);
      if (!map || parsed.tiles.length === 0) continue;

      const resolved = parsed.tiles
        .map((tile) => {
          const board = map.boards.find((b) => b.name === tile.boardName);
          if (!board?.image) return null;
          return { ...tile, image: board.image };
        })
        .filter((tile): tile is { boardName: string; image: string; x: number; y: number } => tile != null);
      if (resolved.length !== parsed.tiles.length || resolved.length === 0) continue;

      const board: BoardDef = {
        id: `setup:${setup.file}`,
        name: setup.name || setup.file,
        image: "",
        reversible: false,
        tiles: resolved,
      };
      const key = boardKey(board);
      const duplicate = map.boards.some((b) => boardKey(b) === key || (b.name === board.name && b.tiles));
      if (!duplicate) {
        const insertAt = insertAtByMap.get(map.name) ?? 0;
        map.boards.splice(insertAt, 0, board);
        insertAtByMap.set(map.name, insertAt + 1);
      }
    }
  }
}

export function parseSavedGameBoardPickers(vsavBytes: Uint8Array): ParsedBoardPickerSetup[] {
  const zip = unzipSync(vsavBytes);
  const saved = zip.savedGame ?? zip["savedGame"];
  if (!saved) return [];
  return parseBoardPickerCommands(decodeVassalSavedGame(saved));
}

export function parseBoardPickerCommands(text: string): ParsedBoardPickerSetup[] {
  const out: ParsedBoardPickerSetup[] = [];
  for (const command of text.split("\x1b")) {
    const parsed = parseBoardPickerCommand(command);
    if (parsed) out.push({ mapName: parsed.mapName, tiles: parsed.tiles.map(({ boardName, x, y }) => ({ boardName, x, y })) });
  }
  return out;
}
