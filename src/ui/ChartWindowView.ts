import type { ChartNodeDef } from "../vmod/toolbar-defs";
import type { ImageSource } from "../board/images";

/**
 * The VASSAL ChartWindow (quick-reference chart windows): Chart widgets
 * are images, organized by nested tab/panel widgets. Tabs render one child at
 * a time (Java TabWidget/BoxWidget/ListWidget all show a single selected
 * child); panels stack their children.
 */
export class ChartWindowView {
  readonly el: HTMLElement;

  constructor(charts: ChartNodeDef[], private readonly images: ImageSource) {
    this.el = document.createElement("div");
    this.el.className = "chart-window";
    for (const node of charts) this.el.appendChild(this.render(node));
  }

  private render(node: ChartNodeDef): HTMLElement {
    switch (node.kind) {
      case "chart": {
        const wrap = document.createElement("div");
        wrap.className = "chart-image";
        const url = this.images.imageUrl(node.fileName);
        if (url) {
          const img = document.createElement("img");
          img.src = url;
          img.alt = node.name;
          wrap.appendChild(img);
        } else {
          wrap.textContent = `${node.name}: image not found (${node.fileName})`;
        }
        return wrap;
      }
      case "panel": {
        const panel = document.createElement("div");
        panel.className = "chart-panel" + (node.vertical ? " vertical" : "");
        for (const child of node.children) panel.appendChild(this.render(child));
        return panel;
      }
      case "tabs":
        return this.renderTabs(node);
    }
  }

  private renderTabs(node: ChartNodeDef): HTMLElement {
    const root = document.createElement("div");
    root.className = "chart-tabs";
    const bar = document.createElement("div");
    bar.className = "side-tabs chart-tab-bar";
    const bodyHost = document.createElement("div");
    bodyHost.className = "chart-tab-body";
    root.append(bar, bodyHost);

    // Children render lazily on first activation; big chart scans stay unloaded
    // until their tab is opened.
    const rendered = new Map<number, HTMLElement>();
    const buttons: HTMLButtonElement[] = [];
    const activate = (i: number): void => {
      buttons.forEach((b, j) => b.classList.toggle("active", j === i));
      let panel = rendered.get(i);
      if (!panel) {
        panel = this.render(node.children[i]);
        rendered.set(i, panel);
      }
      bodyHost.replaceChildren(panel);
    };
    node.children.forEach((child, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = child.name || `Tab ${i + 1}`;
      btn.addEventListener("click", () => activate(i));
      buttons.push(btn);
      bar.appendChild(btn);
    });
    if (node.children.length) activate(0);
    return root;
  }
}
