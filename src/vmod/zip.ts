import { unzip, type Unzipped } from "fflate";

/**
 * A loaded VASSAL module (`.vmod` is just a ZIP). Entries are decompressed
 * lazily-ish: bytes are held in memory; image blob URLs are created on demand
 * and cached. Image names in buildFile.xml may differ in case from the entry,
 * and may live at the archive root or under `images/`, so lookup is tolerant.
 */
export class ModuleArchive {
  private readonly entries: Unzipped;
  /** lowercased-basename -> real entry key, for tolerant image lookup. */
  private readonly imageIndex = new Map<string, string>();
  private readonly urlCache = new Map<string, string>();

  private constructor(entries: Unzipped) {
    this.entries = entries;
    for (const key of Object.keys(entries)) {
      const base = key.substring(key.lastIndexOf("/") + 1).toLowerCase();
      if (!this.imageIndex.has(base)) this.imageIndex.set(base, key);
      // also index the full path lowercased
      this.imageIndex.set(key.toLowerCase(), key);
    }
  }

  static async open(data: Uint8Array): Promise<ModuleArchive> {
    const entries = await new Promise<Unzipped>((resolve, reject) => {
      unzip(data, (err, out) => (err ? reject(err) : resolve(out)));
    });
    return new ModuleArchive(entries);
  }

  hasEntry(name: string): boolean {
    return this.resolveKey(name) != null;
  }

  /** All entry names in the archive (board-archive image discovery). */
  entryNames(): string[] {
    return Object.keys(this.entries);
  }

  text(name: string): string {
    const key = this.resolveKey(name);
    if (key == null) throw new Error(`Module entry not found: ${name}`);
    return new TextDecoder("utf-8").decode(this.entries[key]);
  }

  bytes(name: string): Uint8Array | null {
    const key = this.resolveKey(name);
    return key == null ? null : this.entries[key];
  }

  /** A blob: URL for an image entry, cached. Returns null if not present. */
  imageUrl(name: string | null | undefined): string | null {
    if (!name) return null;
    const key = this.resolveKey(name);
    if (key == null) return null;
    const cached = this.urlCache.get(key);
    if (cached) return cached;
    const mime = mimeFor(key);
    const payload: BlobPart = mime === "image/svg+xml"
      ? this.inlineSvgRefs(key)
      : (this.entries[key] as BlobPart);
    const blob = new Blob([payload], { type: mime });
    const url = URL.createObjectURL(blob);
    this.urlCache.set(key, url);
    return url;
  }

  /**
   * Make an SVG self-contained by inlining archive-relative references as
   * data: URIs. Module counter SVGs pull their raster depictions via
   * `xlink:href="svg/ge468S.png"` and fonts via `url("../fonts/x.ttf")` —
   * relative refs can't resolve from a blob: URL, and canvas rasterization
   * requires self-contained SVGs, so without this the art renders blank.
   */
  private inlineSvgRefs(key: string): string {
    const dir = key.substring(0, key.lastIndexOf("/") + 1);
    const toDataUri = (ref: string): string | null => {
      if (!ref || ref.startsWith("data:") || ref.startsWith("#") || /^[a-z]+:/i.test(ref)) return null;
      const resolved = resolveRelative(dir, ref);
      const bytes = this.bytes(resolved) ?? this.bytes(ref);
      if (!bytes) return null;
      return `data:${mimeFor(resolved)};base64,${bytesToBase64(bytes)}`;
    };
    let text = new TextDecoder("utf-8").decode(this.entries[key]);
    text = text.replace(/(xlink:href|href)="([^"#][^"]*)"/g, (m, attr: string, ref: string) => {
      const uri = toDataUri(ref);
      return uri ? `${attr}="${uri}"` : m;
    });
    text = text.replace(/url\(["']?([^"')]+)["']?\)/g, (m, ref: string) => {
      const uri = toDataUri(ref);
      return uri ? `url("${uri}")` : m;
    });
    return text;
  }

  private resolveKey(name: string): string | null {
    // Full-path candidates first (name as given, then under images/) so
    // directory-qualified refs like `MS/CtrlRuss` never mis-resolve through a
    // duplicate basename in another directory (large modules have thousands of those).
    // Java DataArchive also retries with ".gif" appended — legacy modules
    // reference images extensionless ("Maybe it's an extensionless GIF?").
    for (const candidate of [name, name + ".gif"]) {
      if (candidate in this.entries) return candidate;
      const lower = candidate.toLowerCase();
      const hit = this.imageIndex.get(lower) ?? this.imageIndex.get("images/" + lower);
      if (hit != null) return hit;
    }
    const base = name.toLowerCase().substring(name.lastIndexOf("/") + 1);
    return this.imageIndex.get(base) ?? this.imageIndex.get(base + ".gif") ?? null;
  }
}

function mimeFor(key: string): string {
  const ext = key.substring(key.lastIndexOf(".") + 1).toLowerCase();
  switch (ext) {
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "gif":
      return "image/gif";
    case "bmp":
      return "image/bmp";
    case "svg":
      return "image/svg+xml";
    case "ttf":
      return "font/ttf";
    case "otf":
      return "font/otf";
    case "woff":
      return "font/woff";
    case "woff2":
      return "font/woff2";
    default:
      return "application/octet-stream";
  }
}

/** Resolve `../x` / `svg/x.png` against the directory of the referencing file. */
function resolveRelative(dir: string, ref: string): string {
  const parts = (dir + ref).split("/");
  const out: string[] = [];
  for (const p of parts) {
    if (p === "" || p === ".") continue;
    if (p === "..") out.pop();
    else out.push(p);
  }
  return out.join("/");
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}
