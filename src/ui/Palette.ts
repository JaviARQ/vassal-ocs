import type { ImageSource, ImageStore } from "../board/images";
import { renderPieceToCanvas } from "../board/piece-preview";
import type { PieceSlotDef, WidgetNode } from "../vmod/buildfile";
import { buildPiece } from "../vmod/piece-type";

export interface PaletteCallbacks {
  /** Single click/tap: select the slot (drives the preview pane). */
  onSelect: (slot: PieceSlotDef) => void;
  /** Double click/tap: place immediately (the pre-preview muscle memory). */
  onPlace: (slot: PieceSlotDef) => void;
}

/**
 * The PieceWindow palette, rendered as a collapsible tree. Leaf slots show a
 * thumbnail; a single click selects the slot into the preview pane, a double
 * click places it on the current map.
 */
export class Palette {
  readonly el: HTMLElement;
  private thumbnailObserver: IntersectionObserver | null = null;
  private readonly groups: HTMLElement[] = [];
  private selectedEl: HTMLElement | null = null;

  constructor(
    root: WidgetNode | null,
    private readonly archive: ImageSource,
    private readonly cb: PaletteCallbacks,
    /** When provided, blank-base slots get composed-canvas thumbnails. */
    private readonly images?: ImageStore,
  ) {
    this.el = document.createElement("div");
    this.el.className = "palette";
    if (!root) {
      this.el.textContent = "No palette in module.";
      return;
    }
    const search = document.createElement("input");
    search.className = "palette-search";
    search.placeholder = "Filter units…";
    search.addEventListener("input", () => this.applyFilter(search.value.trim().toLowerCase()));
    this.el.appendChild(search);

    const controls = document.createElement("div");
    controls.className = "palette-controls";
    const expand = document.createElement("button");
    expand.type = "button";
    expand.textContent = "Expand All";
    expand.addEventListener("click", () => this.setAllGroups(true));
    const collapse = document.createElement("button");
    collapse.type = "button";
    collapse.textContent = "Collapse All";
    collapse.addEventListener("click", () => this.setAllGroups(false));
    controls.append(expand, collapse);
    this.el.appendChild(controls);

    const tree = document.createElement("div");
    tree.className = "palette-tree";
    this.el.appendChild(tree);
    // The PieceWindow root itself is a container; render its children.
    for (const child of root.children) {
      if (!child.hidden) tree.appendChild(this.renderNode(child, 0, []));
    }
    for (const slot of root.slots) tree.appendChild(this.renderSlot(slot, []));
  }

  private renderNode(node: WidgetNode, depth: number, path: string[]): HTMLElement {
    // Anonymous containers (unnamed top-level TabWidgets) get no
    // header of their own — the Java app renders them as bare tab bars, so a
    // "TabWidget" tree node would be parser noise. Render children in place.
    if (!node.name) {
      const inline = document.createElement("div");
      inline.style.display = "contents";
      for (const child of node.children) {
        if (!child.hidden) inline.appendChild(this.renderNode(child, depth, path));
      }
      for (const slot of node.slots) inline.appendChild(this.renderSlot(slot, path));
      return inline;
    }
    const label = node.name;
    const nextPath = [...path, label];
    const wrap = document.createElement("div");
    wrap.className = "palette-group";
    wrap.dataset.search = nextPath.join(" ").toLowerCase();

    const header = document.createElement("button");
    header.className = "palette-group-header";
    header.style.paddingLeft = 8 + depth * 10 + "px";
    header.textContent = "▸ " + label;
    wrap.appendChild(header);

    const body = document.createElement("div");
    body.className = "palette-group-body";
    body.style.display = "none";
    wrap.appendChild(body);

    for (const child of node.children) {
      if (!child.hidden) body.appendChild(this.renderNode(child, depth + 1, nextPath));
    }
    for (const slot of node.slots) body.appendChild(this.renderSlot(slot, nextPath));

    header.addEventListener("click", () => {
      const open = body.style.display !== "none";
      this.setGroupOpen(wrap, !open);
    });
    this.groups.push(wrap);
    return wrap;
  }

  private renderSlot(slot: PieceSlotDef, path: string[]): HTMLElement {
    const item = document.createElement("button");
    item.className = "palette-slot";
    item.dataset.search = [...path, slot.name || ""].join(" ").toLowerCase();

    const thumb = document.createElement("span");
    thumb.className = "palette-thumb";
    item.appendChild(thumb);

    const label = document.createElement("span");
    label.className = "palette-label";
    label.textContent = slot.name || "(piece)";
    item.appendChild(label);

    item.addEventListener("click", () => {
      this.selectedEl?.classList.remove("selected");
      this.selectedEl = item;
      item.classList.add("selected");
      this.cb.onSelect(slot);
    });
    item.addEventListener("dblclick", () => this.cb.onPlace(slot));
    this.queueThumbnail(item, thumb, slot);
    return item;
  }

  private queueThumbnail(item: HTMLElement, thumb: HTMLElement, slot: PieceSlotDef): void {
    if ("IntersectionObserver" in window) {
      this.thumbnailObserver ??= new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            const el = entry.target as HTMLElement;
            this.thumbnailObserver?.unobserve(el);
            const target = el.querySelector<HTMLElement>(".palette-thumb");
            const index = Number.parseInt(el.dataset.slotIndex ?? "", 10);
            if (target && Number.isInteger(index)) this.loadThumbnail(target, this.slots[index]);
          }
        },
        { root: null, rootMargin: "240px" },
      );
      item.dataset.slotIndex = String(this.slots.push(slot) - 1);
      this.thumbnailObserver.observe(item);
      return;
    }
    this.loadThumbnail(thumb, slot);
  }

  private readonly slots: PieceSlotDef[] = [];

  private loadThumbnail(thumb: HTMLElement, slot: PieceSlotDef): void {
    if (thumb.dataset.loaded === "1") return;
    thumb.dataset.loaded = "1";
    try {
      const piece = buildPiece(slot.def);
      const url = this.archive.imageUrl(piece.baseImageName());
      if (url) {
        const img = document.createElement("img");
        img.src = url;
        img.loading = "lazy";
        thumb.appendChild(img);
        return;
      }
      // Blank BasicPiece image but visible Embellishment layers: compose a
      // small canvas so layer-only models aren't invisible in the palette.
      if (this.images && piece.activeLayers().length) {
        const canvas = document.createElement("canvas");
        renderPieceToCanvas(canvas, piece, this.images, { size: 34, maxScale: 1 });
        this.watchThumbnail(canvas, piece);
        thumb.appendChild(canvas);
      }
    } catch {
      /* ignore malformed slot */
    }
  }

  /** Composed thumbnails waiting on image loads (one shared listener). */
  private pendingThumbs: Array<{ canvas: HTMLCanvasElement; piece: ReturnType<typeof buildPiece> }> = [];
  private thumbListenerInstalled = false;

  private watchThumbnail(canvas: HTMLCanvasElement, piece: ReturnType<typeof buildPiece>): void {
    const images = this.images;
    if (!images) return;
    this.pendingThumbs.push({ canvas, piece });
    if (this.thumbListenerInstalled) return;
    this.thumbListenerInstalled = true;
    images.addListener(() => {
      this.pendingThumbs = this.pendingThumbs.filter(({ canvas, piece }) => {
        renderPieceToCanvas(canvas, piece, images, { size: 34, maxScale: 1 });
        // Keep while any of the piece's images is still loading.
        const names = [piece.baseImageName(), ...piece.activeLayers().map((l) => l.name)];
        return names.some((n) => {
          const li = images.get(n);
          return li != null && !li.loaded;
        });
      });
    });
  }

  private applyFilter(q: string): void {
    const slots = Array.from(this.el.querySelectorAll<HTMLElement>(".palette-slot"));
    for (const s of slots) {
      const match = !q || (s.dataset.search ?? "").includes(q);
      s.hidden = !match;
      if (match && q) {
        let parent = s.parentElement;
        while (parent && parent !== this.el) {
          if (parent.classList.contains("palette-group")) this.setGroupOpen(parent, true);
          parent = parent.parentElement;
        }
      }
    }
    for (const group of [...this.groups].reverse()) {
      const ownMatch = !q || (group.dataset.search ?? "").includes(q);
      const childMatch = group.querySelector<HTMLElement>(".palette-slot:not([hidden]), .palette-group:not([hidden])") != null;
      group.hidden = !(ownMatch || childMatch);
      if (q && (ownMatch || childMatch)) this.setGroupOpen(group, true);
    }
  }

  private setAllGroups(open: boolean): void {
    for (const group of this.groups) this.setGroupOpen(group, open);
  }

  private setGroupOpen(group: HTMLElement, open: boolean): void {
    const header = group.querySelector<HTMLElement>(":scope > .palette-group-header");
    const body = group.querySelector<HTMLElement>(":scope > .palette-group-body");
    if (!header || !body) return;
    body.style.display = open ? "block" : "none";
    const text = header.textContent?.replace(/^[▸▾]\s*/, "") ?? "";
    header.textContent = (open ? "▾ " : "▸ ") + text;
  }
}
