// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { unzipSync } from "fflate";
import { parseBuildFile, type WidgetNode } from "../src/vmod/buildfile";
import { ModuleArchive } from "../src/vmod/zip";
import { buildPiece, setPrototypes } from "../src/vmod/piece-type";
import { Embellishment } from "../src/model/traits/Embellishment";
import { localExpectations, repoPath } from "./helpers/local";

// Sweeps every image referenced by every palette slot of the complex
// reference module (base images plus every Embellishment level) and checks it
// resolves in the module archive. This is what catches "counters render as
// blank squares" regressions like extensionless legacy refs
// (`dir/name` -> images/dir/name.gif).
const EXP = localExpectations().complex;
const HAVE = EXP != null && existsSync(repoPath(join(EXP.dir, EXP.archive)));

function collectSlots(node: WidgetNode, out: string[]): void {
  for (const s of node.slots) out.push(s.def);
  for (const c of node.children) collectSlots(c, out);
}

describe.skipIf(!HAVE)("counter image resolution", () => {
  it("every palette-referenced image resolves in the archive", async () => {
    const bytes = new Uint8Array(readFileSync(repoPath(join(EXP!.dir, EXP!.archive))));
    const arc = await ModuleArchive.open(bytes);
    const xml = new TextDecoder().decode(
      unzipSync(bytes, { filter: (f) => f.name === "buildFile" })["buildFile"],
    );
    const model = parseBuildFile(xml);
    setPrototypes(model.prototypes);

    const defs: string[] = [];
    collectSlots(model.palette!, defs);
    expect(defs.length).toBeGreaterThan(EXP!.minSlots);

    const names = new Set<string>();
    for (const def of defs) {
      let piece;
      try {
        piece = buildPiece(def);
      } catch {
        continue; // malformed slot: not this test's concern
      }
      const base = piece.baseImageName();
      if (base) names.add(base);
      for (const t of piece.traits) {
        if (t instanceof Embellishment) for (const n of t.allImages()) names.add(n);
      }
    }
    expect(names.size).toBeGreaterThan(3000);

    const unresolved: string[] = [];
    for (const name of names) {
      // Leading "/" = Java classpath resource (built-in icon), not module art.
      if (name.startsWith("/") || !name.trim()) continue;
      if (!arc.hasEntry(name)) unresolved.push(name);
    }
    unresolved.sort();
    // Everything the jar can resolve, we must resolve. The pinned entries are
    // data bugs in the module itself — files genuinely absent from the
    // archive, broken in the jar too.
    expect(unresolved).toEqual(EXP!.knownMissingImages);
  }, 120000);

  it("resolves legacy extensionless and directory-qualified refs", async () => {
    const bytes = new Uint8Array(readFileSync(repoPath(join(EXP!.dir, EXP!.archive))));
    const arc = await ModuleArchive.open(bytes);
    // Java DataArchive appends ".gif" for extensionless names; directory-
    // qualified names must resolve to their own directory even when another
    // directory holds a file with the same basename.
    for (const ref of EXP!.extensionlessRefs) {
      expect(arc.hasEntry(ref), ref).toBe(true);
    }
  });
});
