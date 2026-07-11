export interface ImageSource {
  imageUrl(name: string | null | undefined): string | null;
}

export interface LoadedImage {
  img: HTMLImageElement;
  loaded: boolean;
  width: number;
  height: number;
  /** Lazily-computed pixel data for tight bounds + alpha hit testing. */
  mask?: ImageMask | null;
}

/** Opaque-pixel info for one image (computed once, on first use). */
export interface ImageMask {
  /** Tight bounds around non-transparent pixels, in image pixel coords. */
  trim: { x: number; y: number; w: number; h: number };
  /** Alpha channel, row-major width×height. */
  alpha: Uint8ClampedArray;
  width: number;
  height: number;
}

/**
 * Loads and caches images out of the module archive as HTMLImageElements.
 * Loading is async; callers pass an onLoad callback to trigger a redraw when a
 * previously-missing image becomes available.
 */
export class ImageStore {
  private cache = new Map<string, LoadedImage>();
  private missing = new Set<string>();
  private listeners: Array<() => void> = [];

  constructor(private readonly sources: ImageSource[], onLoad: () => void) {
    this.listeners.push(onLoad);
  }

  /** Register an extra callback fired whenever any image finishes loading. */
  addListener(fn: () => void): void {
    this.listeners.push(fn);
  }

  /** Re-check names that previously failed (a new archive was added). */
  clearMissing(): void {
    this.missing.clear();
  }

  /**
   * Opaque-pixel mask for an image (trim bounds + alpha), computed once on
   * first request. Sprites ship on much larger transparent canvases; the mask
   * lets hit tests and selection outlines follow the actual art. Returns null
   * until the image is loaded or when pixel data is unavailable.
   */
  mask(name: string | null | undefined): ImageMask | null {
    const entry = this.get(name);
    if (!entry || !entry.loaded) return null;
    if (entry.mask !== undefined) return entry.mask;
    entry.mask = computeMask(entry);
    return entry.mask;
  }

  private resolveUrl(name: string): string | null {
    for (const s of this.sources) {
      const url = s.imageUrl(name);
      if (url) return url;
    }
    return null;
  }

  /** Returns the (possibly still-loading) image for a name, or null if absent. */
  get(name: string | null | undefined): LoadedImage | null {
    if (!name) return null;
    const cached = this.cache.get(name);
    if (cached) return cached;
    if (this.missing.has(name)) return null;

    const url = this.resolveUrl(name);
    if (!url) {
      this.missing.add(name);
      return null;
    }

    const img = new Image();
    const entry: LoadedImage = { img, loaded: false, width: 0, height: 0 };
    img.onload = () => {
      entry.loaded = true;
      entry.width = img.naturalWidth;
      entry.height = img.naturalHeight;
      for (const fn of this.listeners) fn();
    };
    img.src = url;
    this.cache.set(name, entry);
    return entry;
  }
}

function computeMask(entry: LoadedImage): ImageMask | null {
  try {
    const w = entry.width;
    const h = entry.height;
    if (w <= 0 || h <= 0 || w * h > 4_000_000) return null;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(entry.img, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h).data;
    const alpha = new Uint8ClampedArray(w * h);
    let minX = w;
    let minY = h;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const a = data[(y * w + x) * 4 + 3];
        alpha[y * w + x] = a;
        if (a > 16) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    const trim = maxX < 0
      ? { x: 0, y: 0, w, h } // fully transparent: keep full canvas
      : { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
    return { trim, alpha, width: w, height: h };
  } catch {
    return null; // tainted canvas or other pixel-access failure
  }
}
