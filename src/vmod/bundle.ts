/**
 * Bundle-zip support for the loader: instead of multi-selecting a module plus
 * its loose extension files, a player can hand over ONE plain zip containing
 * them all. Expected layout (all names free-form):
 *
 *   my-bundle.zip
 *   ├─ SomeGame.vmod      ← exactly one module archive (classified by its
 *   │                        buildFile root, not by filename)
 *   ├─ ExtensionA         ← any number of extension archives (.vmdx or none)
 *   └─ boards/            ← optional: separate board archives, loaded lazily
 *      ├─ bd01                (BoardMetadata.xml modern / `data` legacy)
 *      └─ bd02
 *
 * Anything that isn't a nested ZIP (readme, screenshots) is ignored.
 */
import { ModuleArchive } from "./zip";
import { parseBoardArchive } from "./board-archive";

export type ArchiveKind = "module" | "extension" | "unknown";

export function buildFileEntry(a: ModuleArchive): string {
  return a.hasEntry("buildFile.xml") ? "buildFile.xml" : "buildFile";
}

/** Classify an opened archive by its buildFile root element. */
export function archiveKind(a: ModuleArchive): ArchiveKind {
  if (!a.hasEntry("buildFile.xml") && !a.hasEntry("buildFile")) return "unknown";
  const head = a.text(buildFileEntry(a)).slice(0, 600);
  if (head.includes("ModuleExtension")) return "extension";
  // BasicModule is the legacy (VASSAL 3.1-era) root tag for GameModule.
  if (head.includes("GameModule") || head.includes("BasicModule")) return "module";
  return "unknown";
}

export function isZipBytes(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

export interface BundleArchive {
  name: string;
  arc: ModuleArchive;
  kind: Exclude<ArchiveKind, "unknown">;
}

export interface BundleBoard {
  /** Archive file name, the key the lazy board loader resolves. */
  file: string;
  /** Display name from the board's metadata. */
  name: string;
  bytes: Uint8Array;
}

export interface ExpandedBundle {
  archives: BundleArchive[];
  boards: BundleBoard[];
}

/**
 * Expand one plain-zip bundle: every nested ZIP entry is opened and
 * classified — modules/extensions load as if picked individually; entries
 * under `boards/` (or any archive with board metadata) become lazily-loaded
 * board archives. One level deep only; non-ZIP entries are skipped.
 */
export async function expandBundle(bundle: ModuleArchive): Promise<ExpandedBundle> {
  const archives: BundleArchive[] = [];
  const boards: BundleBoard[] = [];
  for (const entry of bundle.entryNames()) {
    if (entry.endsWith("/") || /(^|\/)manifest\.json$/i.test(entry)) continue;
    const bytes = bundle.bytes(entry);
    if (!bytes || !isZipBytes(bytes)) continue;
    const base = entry.split("/").pop()!;
    try {
      const arc = await ModuleArchive.open(bytes);
      const kind = archiveKind(arc);
      if (kind !== "unknown") {
        archives.push({ name: base, arc, kind });
        continue;
      }
      if (/(^|\/)boards\//i.test(entry) || arc.hasEntry("BoardMetadata.xml") || arc.hasEntry("data")) {
        boards.push({ file: base, name: parseBoardArchive(arc, base).name, bytes });
      }
    } catch {
      // Not a loadable nested archive — skip it like any stray file.
    }
  }
  boards.sort((a, b) => a.name.localeCompare(b.name, "en", { numeric: true }));
  return { archives, boards };
}
