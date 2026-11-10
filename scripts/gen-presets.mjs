/**
 * Generate/refresh public/modules/presets.json from what's on disk.
 *
 * Each directory under public/modules/ becomes one preset: the first `*.vmod`
 * is the base module, every other regular file is loaded as an extension, and
 * a `boards/` subdirectory with a manifest.json becomes the lazy board
 * directory. Preset name/detail come from the module's moduledata.
 *
 * Existing presets.json entries are preserved (they may be hand-curated —
 * names, defaultBoards, pieceScale); only directories not yet covered are
 * appended. Delete an entry (or the file) to have it regenerated.
 */
import { readdirSync, readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { unzipSync } from "fflate";

const MODULES = fileURLToPath(new URL("../public/modules/", import.meta.url));
const OUT = join(MODULES, "presets.json");

let presets = [];
if (existsSync(OUT)) {
  try { presets = JSON.parse(readFileSync(OUT, "utf8")); } catch { presets = []; }
}
const covered = new Set(presets.flatMap((p) => p.files.map((f) => f.split("/")[0])));

for (const dir of readdirSync(MODULES).sort()) {
  const dirPath = join(MODULES, dir);
  if (!statSync(dirPath).isDirectory() || covered.has(dir)) continue;

  const entries = readdirSync(dirPath).sort();
  const vmods = entries.filter((f) => f.toLowerCase().endsWith(".vmod"));
  if (!vmods.length) {
    console.log(`skip ${dir}: no .vmod`);
    continue;
  }
  const base = vmods[0];
  const extensions = entries.filter((f) => {
    if (f === base || f.startsWith(".")) return false;
    return statSync(join(dirPath, f)).isFile();
  });
  const hasBoards = existsSync(join(dirPath, "boards", "manifest.json"));

  let name = dir;
  try {
    const zip = unzipSync(new Uint8Array(readFileSync(join(dirPath, base))), {
      filter: (f) => f.name === "moduledata" || f.name === "buildFile" || f.name === "buildFile.xml",
    });
    const dec = new TextDecoder();
    let modName;
    let version;
    if (zip["moduledata"]) {
      const xml = dec.decode(zip["moduledata"]);
      modName = /<name>([^<]*)<\/name>/.exec(xml)?.[1]?.trim();
      version = /<version>([^<]*)<\/version>/.exec(xml)?.[1]?.trim();
    }
    if (!modName) {
      // Old modules (pre-moduledata): root GameModule/BasicModule attributes
      // (not the <?xml?> declaration, which also has a version=).
      const head = dec.decode((zip["buildFile.xml"] ?? zip["buildFile"] ?? new Uint8Array()).slice(0, 2000));
      const root = /<VASSAL[\w.]*(?:GameModule|BasicModule)\b[^>]*/.exec(head)?.[0] ?? "";
      modName = /\sname="([^"]*)"/.exec(root)?.[1]?.trim();
      version ??= /\sversion="([^"]*)"/.exec(root)?.[1]?.trim();
    }
    if (modName) name = version ? `${modName} ${version}` : modName;
  } catch {
    /* keep the directory name */
  }

  const preset = {
    name,
    detail: `${base}${extensions.length ? ` plus ${extensions.length} bundled extension(s)` : ""}${hasBoards ? ", boards loaded on demand" : ""}`,
    files: [base, ...extensions].map((f) => `${dir}/${f}`),
    ...(hasBoards ? { boards: `${dir}/boards` } : {}),
  };
  presets.push(preset);
  console.log(`added ${dir}: "${name}" (${extensions.length} extensions${hasBoards ? ", boards" : ""})`);
}

writeFileSync(OUT, JSON.stringify(presets, null, 2) + "\n");
console.log(`wrote ${OUT} (${presets.length} presets)`);
