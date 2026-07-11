import type { ImageSource } from "../board/images";

/**
 * Toolbar icon resolution. VASSAL modules reference icons that are either
 * module images (plain names, resolvable from the archive) or Java classpath
 * resources like "/images/die.gif" that do NOT exist in the module zip. For
 * the classpath set we ship small inline SVGs (crisp at retina, theme-matching,
 * no LGPL asset copying). Unknown icons fall back to text-only buttons.
 */

function svg(body: string): string {
  return `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

/** Built-in replacements for Java classpath icon paths. */
const BUILTIN: Record<string, string> = {
  "/images/die.gif": svg(
    '<rect x="2" y="2" width="12" height="12" rx="2.5"/><circle cx="5.5" cy="5.5" r="1" fill="currentColor" stroke="none"/><circle cx="10.5" cy="10.5" r="1" fill="currentColor" stroke="none"/><circle cx="8" cy="8" r="1" fill="currentColor" stroke="none"/>',
  ),
  "/images/map.gif": svg(
    '<path d="M2 4.5 6 3l4 1.5L14 3v8.5L10 13l-4-1.5L2 13z"/><path d="M6 3v8.5M10 4.5V13"/>',
  ),
  "/images/overview.gif": svg(
    '<rect x="2" y="3" width="12" height="10" rx="1.5"/><rect x="8" y="6" width="4" height="4" fill="currentColor" stroke="none" opacity="0.8"/>',
  ),
  "/images/zoomIn.gif": svg(
    '<circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5 14 14M5 7h4M7 5v4"/>',
  ),
  "/images/zoomOut.gif": svg(
    '<circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5 14 14M5 7h4"/>',
  ),
  "/images/zoom.png": svg('<circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5 14 14"/>'),
  "/images/camera.gif": svg(
    '<rect x="2" y="5" width="12" height="8" rx="1.5"/><path d="M6 5l1-2h2l1 2"/><circle cx="8" cy="9" r="2.2"/>',
  ),
  "/images/thread.gif": svg('<path d="M3 13 13 3"/><circle cx="3" cy="13" r="1.4" fill="currentColor" stroke="none"/><circle cx="13" cy="3" r="1.4" fill="currentColor" stroke="none"/>'),
  "/images/notes.gif": svg(
    '<rect x="3" y="2" width="10" height="12" rx="1.5"/><path d="M5.5 5.5h5M5.5 8h5M5.5 10.5h3"/>',
  ),
  "/images/turn.gif": svg(
    '<path d="M13 8a5 5 0 1 1-1.8-3.8"/><path d="M13 2v3h-3"/>',
  ),
  "/images/chart.gif": svg(
    '<rect x="2" y="2" width="12" height="12" rx="1.5"/><path d="M2 6h12M6 6v8M2 10h12"/>',
  ),
};

/** Default built-in icon per toolbar item kind, when the module declares none. */
const KIND_DEFAULTS: Record<string, string> = {
  notes: "/images/notes.gif",
  turnTracker: "/images/turn.gif",
  globalMap: "/images/overview.gif",
  dice: "/images/die.gif",
  map: "/images/map.gif",
  chartWindow: "/images/chart.gif",
};

export type ResolvedIcon =
  | { type: "svg"; svg: string }
  | { type: "url"; url: string }
  | { type: "none" };

export function resolveToolbarIcon(icon: string, kind: string, archive: ImageSource): ResolvedIcon {
  const name = icon.trim();
  if (name && !name.startsWith("/")) {
    const url = archive.imageUrl(name);
    if (url) return { type: "url", url };
  }
  const builtin = BUILTIN[name] ?? BUILTIN[KIND_DEFAULTS[kind] ?? ""];
  if (builtin) return { type: "svg", svg: builtin };
  return { type: "none" };
}
