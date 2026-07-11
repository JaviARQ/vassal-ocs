import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Content expectations for the local (uncommitted) reference fixtures:
 * `tests/fixtures/expectations.local.json` describes what the gitignored
 * module assets and `.vsav` fixtures contain, so the committed suites stay
 * module-agnostic. See `tests/fixtures/expectations.example.json` for the
 * shape. Suites that depend on it skip when the file (or the assets) are
 * absent.
 */
export interface LocalExpectations {
  /** The stock-format `.vsav` fixture (tests/fixtures/example.vsav). */
  example?: {
    moduleName: string;
    version: string;
    tableName: string;
    /** [name, image] per board on the main map, in buildFile order. */
    tableBoards: Array<[string, string]>;
    sideMaps: string[];
    sideMapBoard: [string, string];
    pieceCount: number;
    pieceName: string;
    notesContain: string;
    preservedPrefix: string;
    boardCommand: string;
  };
  /** The complex reference module (custom classes + board archives). */
  complex?: {
    dir: string;
    archive: string;
    name: string;
    version: string;
    mainMap: string;
    minPrototypes: number;
    minSlots: number;
    chart: { name: string; tabs: string[]; chartCount: number };
    pieceWindowTooltips: string[];
    knownMissingImages: string[];
    extensionlessRefs: string[];
    boards: Array<{
      file: string;
      name: string;
      image: string;
      widthHexes?: number;
      heightHexes?: number;
      originX?: number;
      locations?: Array<[number, number, string]>;
    }>;
  };
  /** The legacy-format `.vsav` fixture (tests/fixtures/legacy-save.vsav). */
  legacySave?: {
    boardImage: string;
    pieces: number;
    scenarioContains: string;
  };
}

const FILE = join(__dirname, "../fixtures/expectations.local.json");

export function localExpectations(): LocalExpectations {
  if (!existsSync(FILE)) return {};
  return JSON.parse(readFileSync(FILE, "utf8")) as LocalExpectations;
}

export function fixturePath(name: string): string {
  return join(__dirname, "../fixtures", name);
}

export function repoPath(rel: string): string {
  return join(__dirname, "../..", rel);
}
