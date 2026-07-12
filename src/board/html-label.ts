/**
 * HTML piece labels rendered as real HTML. Swing renders JLabel text that
 * starts with "<html>" as rich HTML — modules build whole scenario cards and
 * rule aids this way. In the browser we honor that natively: the markup is
 * measured inside a hidden *shadow root* (so its CSS can't restyle the app),
 * serialized to XHTML, and rasterized through an SVG <foreignObject> image,
 * cached per label string.
 *
 * Safety/degradation: <script> elements are stripped and rasterization runs
 * in an <img> context where scripting and network fetches are disabled —
 * remote background images degrade to their fallback colors.
 */

export interface HtmlLabelEntry {
  img: HTMLImageElement;
  width: number;
  height: number;
  ready: boolean;
}

const cache = new Map<string, HtmlLabelEntry | null>();
const MAX_EDGE = 1600;

/**
 * Cached rasterized image for an HTML label, building it on first request.
 * Returns null when rasterization is unavailable/failed (caller falls back
 * to plain text); `onReady` fires once when a pending image finishes.
 */
export function htmlLabelImage(html: string, onReady?: () => void): HtmlLabelEntry | null {
  if (cache.has(html)) return cache.get(html) ?? null;
  if (typeof document === "undefined" || typeof Image === "undefined" || !document.body) {
    return null; // never cache: a DOM may appear later (tests vs app boot)
  }
  const entry: HtmlLabelEntry = { img: new Image(), width: 0, height: 0, ready: false };
  cache.set(html, entry);
  build(html, entry, onReady).catch((err) => {
    console.warn("html label rasterization failed:", err);
    cache.set(html, null); // fall back to text on the next draw
    onReady?.();
  });
  return entry;
}

async function build(html: string, entry: HtmlLabelEntry, onReady?: () => void): Promise<void> {
  const doc = new DOMParser().parseFromString(html, "text/html");
  for (const s of Array.from(doc.querySelectorAll("script"))) s.remove();

  // Remote card assets (CSS backgrounds, <img>): the SVG-image rasterization
  // context can't fetch, so inline them as data: URIs first. Best-effort —
  // hosts without CORS (or http assets on an https deploy) degrade to the
  // card's fallback colors.
  await inlineRemoteRefs(doc);

  // Measure at natural size inside a closed shadow root: the label's own
  // stylesheet applies to it alone, not the surrounding app.
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-10000px;top:0;visibility:hidden;pointer-events:none;";
  const shadow = host.attachShadow({ mode: "closed" });
  const wrap = document.createElement("div");
  wrap.style.cssText = "display:inline-block;background:#ffffff;color:#000000;font:12px sans-serif;";
  for (const styleEl of Array.from(doc.querySelectorAll("style"))) wrap.appendChild(styleEl.cloneNode(true));
  for (const child of Array.from(doc.body?.childNodes ?? [])) wrap.appendChild(child.cloneNode(true));
  shadow.appendChild(wrap);
  document.body.appendChild(host);
  const rect = wrap.getBoundingClientRect();
  const width = Math.min(MAX_EDGE, Math.ceil(rect.width));
  const height = Math.min(MAX_EDGE, Math.ceil(rect.height));
  host.remove();
  if (!width || !height) throw new Error("empty label");

  const xhtml = new XMLSerializer().serializeToString(wrap);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
    `<foreignObject width="100%" height="100%">${xhtml}</foreignObject></svg>`;

  entry.width = width;
  entry.height = height;
  entry.img.onload = () => {
    entry.ready = true;
    onReady?.();
  };
  entry.img.onerror = () => {
    cache.set(html, null); // fall back to text on the next draw
    onReady?.();
  };
  entry.img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}

/**
 * Fetch http(s) refs in <style> url() and <img src> into data: URIs — all in
 * parallel, cached per URL, and capped so a card never waits on a slow or
 * CORS-blocked asset host (cards commonly reference dozens of remote logos).
 */
async function inlineRemoteRefs(doc: Document): Promise<void> {
  const URL_RE = /url\(\s*["']?(https?:[^"')\s]+)["']?\s*\)/gi;
  const styles = Array.from(doc.querySelectorAll("style"));
  const imgs = Array.from(doc.querySelectorAll("img")).filter((i) => /^https?:/i.test(i.getAttribute("src") ?? ""));

  const urls = new Set<string>();
  for (const styleEl of styles) {
    for (const m of (styleEl.textContent ?? "").matchAll(URL_RE)) urls.add(m[1]);
  }
  for (const img of imgs) urls.add(img.getAttribute("src")!);
  if (!urls.size) return;

  const all = Promise.allSettled([...urls].map((u) => fetchAsDataUri(u)));
  await Promise.race([all, new Promise((r) => setTimeout(r, 6000))]);

  for (const styleEl of styles) {
    let css = styleEl.textContent ?? "";
    for (const u of urls) {
      const data = resolvedUri(u);
      if (data) css = css.split(u).join(data);
    }
    styleEl.textContent = css;
  }
  for (const img of imgs) {
    const data = resolvedUri(img.getAttribute("src")!);
    if (data) img.setAttribute("src", data);
  }
}

/** url -> settled data: URI (null = failed/blocked; undefined = pending). */
const uriCache = new Map<string, string | null>();
const uriPending = new Map<string, Promise<string | null>>();

function resolvedUri(url: string): string | null {
  return uriCache.get(url) ?? null;
}

function fetchAsDataUri(url: string): Promise<string | null> {
  if (uriCache.has(url)) return Promise.resolve(uriCache.get(url)!);
  let pending = uriPending.get(url);
  if (!pending) {
    pending = (async () => {
      try {
        // Hard timeout: a hanging host must never hold the card hostage.
        const res = await fetch(url, { mode: "cors", signal: AbortSignal.timeout(4000) });
        if (!res.ok) return null;
        const blob = await res.blob();
        return await new Promise<string | null>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
          reader.onerror = () => resolve(null);
          reader.readAsDataURL(blob);
        });
      } catch {
        return null;
      }
    })().then((result) => {
      uriCache.set(url, result);
      uriPending.delete(url);
      return result;
    });
    uriPending.set(url, pending);
  }
  return pending;
}
