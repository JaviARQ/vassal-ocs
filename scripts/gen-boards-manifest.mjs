#!/usr/bin/env node
/**
 * Generate `boards/manifest.json` for every module preset directory under
 * public/modules/ that keeps its boards as separate archives (a static site
 * can't list a directory). Re-run after adding/removing board files:
 *
 *   node scripts/gen-boards-manifest.mjs
 *
 * Each entry: { file, name } where `name` comes from the archive's
 * BoardMetadata.xml (modern board archives) or the file name minus its "bd"
 * prefix. Non-ZIP files (legacy leftovers, directories) are skipped with a
 * warning.
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { unzipSync } from "fflate";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const modulesDir = join(root, "public/modules");

let found = 0;
for (const dir of existsSync(modulesDir) ? readdirSync(modulesDir).sort() : []) {
  const boardsDir = join(modulesDir, dir, "boards");
  if (!existsSync(boardsDir) || !statSync(boardsDir).isDirectory()) continue;
  found++;

  const entries = [];
  for (const file of readdirSync(boardsDir).sort()) {
    if (file === "manifest.json") continue;
    const path = join(boardsDir, file);
    if (!statSync(path).isFile()) continue;
    const bytes = readFileSync(path);
    let name = file.replace(/^bd/, "");
    try {
      // Only need BoardMetadata.xml; filter keeps huge images compressed/untouched.
      const zip = unzipSync(new Uint8Array(bytes), {
        filter: (f) => f.name === "BoardMetadata.xml",
      });
      const meta = zip["BoardMetadata.xml"];
      if (meta) {
        const m = /<boardMetadata[^>]*\bname="([^"]*)"/.exec(new TextDecoder().decode(meta));
        if (m && m[1]) name = m[1];
      }
    } catch (err) {
      console.warn(`skipping ${dir}/boards/${file}: not a readable ZIP (${err.message})`);
      continue;
    }
    entries.push({ file, name });
  }

  entries.sort((a, b) => a.name.localeCompare(b.name, "en", { numeric: true }));
  writeFileSync(join(boardsDir, "manifest.json"), JSON.stringify(entries, null, 1) + "\n");
  console.log(`wrote ${dir}/boards/manifest.json with ${entries.length} boards`);
}
if (!found) console.log("no public/modules/*/boards directories found");
