// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { zipSync, strToU8 } from "fflate";
import { ModuleArchive } from "../src/vmod/zip";
import { archiveKind, expandBundle, isZipBytes } from "../src/vmod/bundle";

const MODULE_XML = `<?xml version="1.0"?>
<VASSAL.build.GameModule name="Sample Game" version="1.0">
  <VASSAL.build.module.Map mapName="Main Map"/>
</VASSAL.build.GameModule>`;

const EXTENSION_XML = `<?xml version="1.0"?>
<VASSAL.build.module.ModuleExtension version="1.0" module="Sample Game"/>`;

const BOARD_METADATA = `<?xml version="1.0"?>
<boardMetadata name="07" version="1.0" boardImageFileName="bd07.gif" width="33" height="10"/>`;

function zipOf(entries: Record<string, Uint8Array>): Uint8Array {
  return zipSync(entries);
}

const moduleZip = () => zipOf({ "buildFile.xml": strToU8(MODULE_XML) });
const extensionZip = () => zipOf({ buildFile: strToU8(EXTENSION_XML) });
const boardZip = () => zipOf({ "BoardMetadata.xml": strToU8(BOARD_METADATA), "bd07.gif": new Uint8Array([1]) });

describe("archiveKind", () => {
  it("classifies by buildFile root, not filename", async () => {
    expect(archiveKind(await ModuleArchive.open(moduleZip()))).toBe("module");
    expect(archiveKind(await ModuleArchive.open(extensionZip()))).toBe("extension");
    expect(archiveKind(await ModuleArchive.open(boardZip()))).toBe("unknown");
  });
});

describe("expandBundle", () => {
  it("finds the module, extensions, and boards/ archives inside one zip", async () => {
    const bundle = zipOf({
      "readme.txt": strToU8("not a zip"),
      "SampleGame.vmod": moduleZip(),
      "Extension A": extensionZip(),
      "boards/bd07": boardZip(),
      "boards/manifest.json": strToU8("[]"),
    });
    const out = await expandBundle(await ModuleArchive.open(bundle));

    expect(out.archives.map((a) => `${a.kind}:${a.name}`).sort()).toEqual([
      "extension:Extension A",
      "module:SampleGame.vmod",
    ]);
    expect(out.boards).toHaveLength(1);
    expect(out.boards[0]).toMatchObject({ file: "bd07", name: "07" });
    expect(isZipBytes(out.boards[0].bytes)).toBe(true);
  });

  it("classifies board archives outside boards/ by their metadata entry", async () => {
    const bundle = zipOf({ bd07: boardZip() });
    const out = await expandBundle(await ModuleArchive.open(bundle));
    expect(out.archives).toHaveLength(0);
    expect(out.boards.map((b) => b.file)).toEqual(["bd07"]);
  });

  it("returns nothing for a zip with no nested archives", async () => {
    const bundle = zipOf({ "notes.txt": strToU8("hello") });
    const out = await expandBundle(await ModuleArchive.open(bundle));
    expect(out.archives).toHaveLength(0);
    expect(out.boards).toHaveLength(0);
  });
});
