import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { chromium } from "playwright";

let cfg;
try {
  cfg = (await import("./verify.config.local.mjs")).default?.scenario;
} catch {
  cfg = null;
}
if (!cfg) {
  console.log("[scenario] SKIPPED — no scripts/verify.config.local.mjs (see verify.config.example.mjs)");
  process.exit(0);
}
// Text typed into the app by this script (not module content).
const NOTE_LINE_1 = "List A: alpha units";
const NOTE_TEXT = NOTE_LINE_1 + "\n\nList B: beta units";

const ROOT = new URL("../dist/", import.meta.url).pathname;
const OUT = process.env.SHOTS_DIR || new URL("../verify-shots/", import.meta.url).pathname;
await (await import("node:fs/promises")).mkdir(OUT, { recursive: true }).catch(() => {});
const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".vmod": "application/zip",
  ".vmdx": "application/zip",
  ".map": "application/json",
};
const log = (...a) => console.log("[scenario]", ...a);

const server = http.createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (p === "/") p = "/index.html";
    const file = join(ROOT, normalize(p).replace(/^(\.\.[/\\])+/, ""));
    const body = await readFile(file);
    res.writeHead(200, { "content-type": MIME[extname(file)] || "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end("not found");
  }
});
await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(4174, "127.0.0.1", resolve);
});
log("serving dist/ on :4174");

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("pageerror", (e) => console.log("[pageerror]", e.message));
page.on("console", (m) => {
  if (m.type() === "error") console.log("[console.error]", m.text());
});

const R = {};
const URL_APP = "http://127.0.0.1:4174" + cfg.url;

try {
  await page.goto(URL_APP, { waitUntil: "load" });
  await page.waitForSelector(".toolbar", { timeout: 30000 });
  await page.waitForTimeout(2500);
  R.title = await page.title();
  R.board = await page.evaluate(() => {
    const s = document.querySelectorAll(".toolbar select")[1];
    return s ? s.options[s.selectedIndex]?.textContent : null;
  });
  await shot("scenario-01-loaded.png");
  R.diceButtons = await page.evaluate(() => window.__vb.diceButtons());
  R.cardDecks = await page.evaluate(() => window.__vb.cardDecks());
  R.maps = await page.evaluate(() => window.__vb.maps());
  R.extensionBoards = R.maps.find((m) => m.name === cfg.mainMap)?.boards?.filter((b) => cfg.extensionBoardRe.test(b)) ?? [];
  R.predefinedBoards = R.maps.find((m) => m.name === cfg.mainMap)?.boardDetails?.filter((b) => b.tiles > 0) ?? [];
  R.selectSetup = await page.evaluate((name) => window.__vb.selectBoard(name), cfg.selectSetup);
  await page.waitForTimeout(300);
  R.currentBoardInfo = await page.evaluate(() => window.__vb.currentBoardInfo());
  await shot("scenario-01b-predefined-setup.png");

  let labels = await paletteLabels();
  R.slotCount = labels.length;
  R.hasChitA = labels.includes(cfg.chitA);
  R.hasChitB = labels.includes(cfg.chitB);
  R.hasChitBFallback = labels.includes(cfg.chitBFallback);
  R.filter = await testPaletteFilter(cfg.filterQuery);
  log("slots:", R.slotCount, "| chitA:", R.hasChitA, "| chitB:", R.hasChitB, "| chitB fallback:", R.hasChitBFallback);

  const chitA = await placeExact(cfg.chitA);
  must(chitA, "Could not place the exact chit A slot");
  await page.evaluate(() => window.__vb.setSelectedPos(760, 430));
  R.chitA = { slot: chitA, layers: await selectedLayers(), commands: await selectedCommands() };

  const chitB = labels.includes(cfg.chitB) ? await placeExact(cfg.chitB) : await placeExact(cfg.chitBFallback);
  must(chitB, "Could not place chit B or its fallback");
  await page.evaluate(() => window.__vb.setSelectedPos(460, 430));
  R.chitB = { slot: chitB, proxy: chitB === cfg.chitBFallback, layers: await selectedLayers(), commands: await selectedCommands() };

  const terrain = await placeFirst(cfg.terrainCandidates);
  must(terrain, "Could not place a terrain slot");
  await page.evaluate(() => window.__vb.setSelectedPos(610, 430));
  R.terrain = { slot: terrain, selected: await selectedName(), beforeLock: await selectedLocked() };
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].find((b) => b.textContent?.includes("Lock"));
    btn?.click();
  });
  await page.waitForTimeout(150);
  R.terrain.afterLock = await selectedLocked();
  await shot("scenario-02-models-terrain.png");

  R.mapStateBeforeSwitch = {
    map: await page.evaluate(() => window.__vb.currentMap()),
    board: await page.evaluate(() => window.__vb.currentBoard()),
    pieces: await page.evaluate(() => window.__vb.pieces()),
  };
  const sideMaps = R.maps.filter((m) => m.name !== cfg.mainMap).slice(0, 2);
  for (const m of sideMaps) {
    const ok = await page.evaluate((name) => window.__vb.switchMap(name), m.name);
    must(ok, `Could not switch to map ${m.name}`);
    await page.waitForTimeout(150);
  }
  const restored = await page.evaluate((name) => window.__vb.switchMap(name), R.mapStateBeforeSwitch.map);
  must(restored, `Could not switch back to map ${R.mapStateBeforeSwitch.map}`);
  await page.waitForTimeout(250);
  R.mapStateAfterSwitch = {
    map: await page.evaluate(() => window.__vb.currentMap()),
    board: await page.evaluate(() => window.__vb.currentBoard()),
    pieces: await page.evaluate(() => window.__vb.pieces()),
  };
  await shot("scenario-02b-map-state-restored.png");

  R.sidebars = await testSidebarToggles();

  R.pointerDrag = {};
  R.pointerDrag.chitB = await dragPieceByPointer(chitB, 34, -22);
  R.pointerDrag.chitA = await dragPieceByPointer(cfg.chitA, -28, 26);
  const extraChitA = await placeExact(cfg.chitA);
  must(extraChitA, "Could not place a second chit A slot");
  await page.evaluate(() => window.__vb.setSelectedPos(680, 505));
  R.pointerDrag.extraChitA = await dragSelectedByPointer(22, -24);
  const extraChitC = await placeExact(cfg.chitC);
  must(extraChitC, "Could not place the exact chit C slot");
  await page.evaluate(() => window.__vb.setSelectedPos(560, 505));
  R.pointerDrag.extraChitC = await dragSelectedByPointer(-24, -20);
  const pathChit = await placeByPath(cfg.chitByPath.path, cfg.chitByPath.label);
  must(pathChit, "Could not place the group-path chit slot");
  await page.evaluate(() => window.__vb.setSelectedPos(600, 565));
  R.pointerDrag.pathChit = await dragSelectedByPointer(26, -18);
  R.multiSelect = await multiSelectAndDrag([cfg.chitA, cfg.chitC], 18, 16);
  await shot("scenario-02c-pointer-drag.png");

  await page.evaluate(({ b, fb }) => window.__vb.selectPiece(b) || window.__vb.selectPiece(fb), { b: cfg.chitB, fb: cfg.chitBFallback });
  page.once("dialog", (d) => d.accept("P1: custom kit, green 25mm base"));
  await page.evaluate(() => window.__vb.runCommand("Change Label"));
  await page.waitForTimeout(150);
  R.chitB.afterLabelLayers = await selectedLayers();
  await page.evaluate((cmd) => window.__vb.runCommand(cmd), cfg.layerCommand);
  await page.waitForTimeout(150);
  R.chitB.afterLayerCycle = await selectedLayers();
  await shot("scenario-03-label-weapon.png");

  const moves = [
    { name: cfg.chitB, fallback: cfg.chitBFallback, x: 500, y: 430 },
    { name: cfg.chitA, x: 720, y: 430 },
    { name: cfg.chitB, fallback: cfg.chitBFallback, x: 535, y: 410 },
    { name: cfg.chitA, x: 690, y: 450 },
  ];
  for (const m of moves) {
    const ok = await page.evaluate(({ name, fallback, x, y }) => {
      if (window.__vb.setPiecePos(name, x, y)) return true;
      return fallback ? window.__vb.setPiecePos(fallback, x, y) : false;
    }, m);
    must(ok, `Move failed for ${m.name}`);
    await page.waitForTimeout(100);
  }
  R.afterMoves = await page.evaluate(() => window.__vb.pieces());
  await shot("scenario-04-after-rounds.png");

  await page.evaluate(() => window.__vb.setMeasure(535, 410, 690, 450));
  await page.waitForTimeout(200);
  R.measureBlocked = await page.evaluate(() => window.__vb.measureInfo());
  await shot("scenario-05-los-blocked.png");

  const terrainName = R.terrain.selected;
  await page.evaluate((name) => window.__vb.setPiecePos(name, 610, 515), terrainName);
  await page.evaluate(() => window.__vb.setMeasure(535, 410, 690, 450));
  await page.waitForTimeout(200);
  R.measureOpen = await page.evaluate(() => window.__vb.measureInfo());
  await shot("scenario-06-los-open.png");

  await page.evaluate(() => {
    window.__vb.roll("d6");
    window.__vb.roll("2d6");
  });
  await page.waitForTimeout(150);
  R.chatLog = await page.evaluate(() => window.__vb.chatLog());
  await shot("scenario-07-dice-log.png");

  const cardDeck = R.cardDecks.find((d) => cfg.deckRe.test(d.name)) ?? R.cardDecks[0];
  must(cardDeck, "No card deck was parsed from the module/extensions");
  R.drawnCard = await page.evaluate((deckId) => {
    const select = document.querySelector(".card-draw-row select");
    const button = document.querySelector(".card-draw-row button");
    if (!select || !button) return null;
    select.value = deckId;
    button.click();
    return {
      preview: document.querySelector(".card-preview-title")?.textContent ?? null,
      log: window.__vb.chatLog(),
    };
  }, cardDeck.id);
  await page.waitForTimeout(250);
  await shot("scenario-08-card-draw.png");

  R.saveStateDebug = await page.evaluate(() => ({
    preservedCommands: window.__vb.preservedSaveCommands?.().length ?? 0,
    savedNotes: window.__vb.savedNotes?.().length ?? 0,
    board: window.__vb.currentBoard(),
    pieces: window.__vb.pieces().map((p) => ({ name: p.name, x: p.x, y: p.y, moved: p.moved, locked: p.locked })),
  }));
  await shot("scenario-09-save-state.png");

  // ---- Module-defined toolbar (parsed from buildFile) -----------------------
  R.toolbarButtons = await page.evaluate(() => window.__vb.toolbarButtons());
  // Open the dice menu for the screenshot, then switch maps through the
  // map-launch menu with real clicks.
  await page.locator(".module-tb-menu button", { hasText: cfg.diceMenu.text }).first().click();
  await page.waitForTimeout(150);
  // The dropdown must be genuinely visible: not clipped by the toolbar's
  // scroll container (elementFromPoint sees through clipping) and on-screen.
  R.dicePopover = await page.evaluate(() => {
    const el = document.querySelector(".module-tb-popover");
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const probeY = r.top + Math.max(2, r.height - 6);
    const probe = document.elementFromPoint(r.left + r.width / 2, probeY);
    return {
      items: el.querySelectorAll(".module-tb-popover-item").length,
      rect: { x: r.x, y: r.y, w: r.width, h: r.height },
      inViewport: r.top >= 0 && r.left >= 0 && r.bottom <= window.innerHeight && r.right <= window.innerWidth,
      bottomVisible: probe != null && el.contains(probe),
    };
  });
  await shot("scenario-11-module-toolbar.png");
  await page.locator(".module-tb-popover-item", { hasText: cfg.diceMenu.item }).first().click();
  await page.locator(".module-tb-menu button", { hasText: cfg.mapMenu.text }).first().click();
  await page.locator(".module-tb-popover-item", { hasText: cfg.mapMenu.item }).first().click();
  await page.waitForTimeout(200);
  R.menuMapSwitch = await page.evaluate(() => window.__vb.currentMap());
  await page.evaluate((name) => window.__vb.switchMap(name), cfg.mainMap);
  R.menuDiceLogged = await page.evaluate((item) => window.__vb.chatLog().some((e) => new RegExp(item + ":").test(e.text)), cfg.diceMenu.item);

  // ---- Notes window with vsav round-trip --------------------------------------
  await page.locator(".module-tb-btn", { hasText: cfg.notesButton }).first().click();
  await page.waitForTimeout(250);
  await page.fill(".notes-panel:not([hidden]) textarea.notes-text", NOTE_TEXT);
  await page.locator(".notes-tabs button", { hasText: "Private" }).click();
  await page.fill(".notes-panel:not([hidden]) textarea.notes-text", "secret plan: flank left");
  await shot("scenario-12-notes.png");
  await page.locator(".notes-save").click();
  await page.waitForTimeout(150);
  R.notesAfterSave = await page.evaluate(() => window.__vb.notesState());
  R.notesWindowClosedOnSave = await page.evaluate(() => window.__vb.windows().every((w) => w.id !== "notes"));
  R.notesRoundTrip = await page.evaluate(() => {
    const bytes = window.__vb.saveBytes();
    window.__vb.setNote("scenario", "clobbered before reload");
    window.__vb.loadSaveBytes(bytes);
    return window.__vb.notesState();
  });

  // ---- Palette counter preview pane -------------------------------------------
  await applyPaletteSearch(cfg.chitA);
  {
    const idx = await visibleSlotIndex((text) => text === cfg.chitA);
    must(idx, "Preview: chit A slot not found");
    const slots = await page.$$(".palette-slot:not([hidden])");
    await slots[idx.index].scrollIntoViewIfNeeded().catch(() => {});
    await slots[idx.index].click(); // single click = select + preview
  }
  await page.waitForTimeout(400);
  R.preview = await page.evaluate(() => window.__vb.previewInfo());
  R.previewSelectedClass = await page.evaluate(() => document.querySelector(".palette-slot.selected .palette-label")?.textContent ?? null);
  await shot("scenario-14-preview.png");
  // Single click must NOT have placed a piece; Place button does.
  R.previewCounts = { beforePlace: await page.evaluate(() => window.__vb.pieceCount()) };
  await page.locator(".preview-place").click();
  await page.waitForTimeout(250);
  R.previewCounts.afterPlace = await page.evaluate(() => window.__vb.pieceCount());
  // Drag from the preview canvas onto the map canvas.
  const pvBox = await page.locator(".piece-preview-canvas").boundingBox();
  const mapBox = await page.locator(".map-canvas").boundingBox();
  if (pvBox && mapBox) {
    await page.mouse.move(pvBox.x + pvBox.width / 2, pvBox.y + pvBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(mapBox.x + mapBox.width * 0.6, mapBox.y + mapBox.height * 0.4, { steps: 8 });
    await page.mouse.up();
  }
  await page.waitForTimeout(250);
  R.previewCounts.afterDrag = await page.evaluate(() => window.__vb.pieceCount());
  await applyPaletteSearch("");

  // ---- Context menu SubMenu grouping (submenu; trait) -------------------------
  await page.evaluate(({ b, fb }) => window.__vb.selectPiece(b) || window.__vb.selectPiece(fb), { b: cfg.chitB, fb: cfg.chitBFallback });
  const ctxPos = await page.evaluate(() => window.__vb.selectedClientPos());
  await page.mouse.click(ctxPos.x, ctxPos.y, { button: "right" });
  await page.waitForTimeout(250);
  R.contextMenu = await page.evaluate(() => {
    const items = [...document.querySelectorAll('.context-menu[data-depth="0"] .context-item')];
    return {
      top: items.map((e) => e.querySelector("span")?.textContent ?? ""),
      subRows: items.filter((e) => e.classList.contains("has-sub")).map((e) => e.querySelector("span")?.textContent ?? ""),
    };
  });
  await page.locator('.context-menu[data-depth="0"] .context-item.has-sub', { hasText: cfg.submenu.row }).click();
  await page.waitForTimeout(200);
  R.contextSub = await page.evaluate(() => {
    const sub = document.querySelector('.context-menu[data-depth="1"]');
    if (!sub) return null;
    const r = sub.getBoundingClientRect();
    return {
      items: [...sub.querySelectorAll(".context-item > span:first-child")].map((e) => e.textContent ?? ""),
      inViewport: r.top >= 0 && r.left >= 0 && r.bottom <= window.innerHeight && r.right <= window.innerWidth,
    };
  });
  await shot("scenario-18-context-submenu.png");
  R.layersBeforeSub = await page.evaluate(() => window.__vb.selectedLayers());
  await page.locator('.context-menu[data-depth="1"] .context-item', { hasText: cfg.submenu.item }).first().click();
  await page.waitForTimeout(200);
  R.layersAfterSub = await page.evaluate(() => window.__vb.selectedLayers());

  // ---- Turn Counter window ----------------------------------------------------
  await page.locator(".module-tb-btn", { hasText: "Turn Counter" }).first().click();
  await page.waitForTimeout(250);
  await page.locator(".turn-step[title='Next']").click();
  await page.waitForTimeout(150);
  R.turnState = await page.evaluate(() => window.__vb.turnState());
  R.turnReportLogged = await page.evaluate((src) => window.__vb.chatLog().some((e) => new RegExp(src).test(e.text)), cfg.turnReportRe.source);
  await shot("scenario-13-turn.png");
  R.turnAfterRoundTrip = await page.evaluate(() => {
    const bytes = window.__vb.saveBytes();
    window.__vb.turnNext(); // clobber, then restore from the save
    window.__vb.loadSaveBytes(bytes);
    return window.__vb.turnState();
  });
  await page.evaluate(() => window.__vb.closeWindow("turn-tracker"));

  // ---- Overview window (WindowManager float mode) ---------------------------
  R.centerBeforeOverviewDrag = await page.evaluate(() => window.__vb.viewCenter());
  await page.evaluate(() => window.__vb.openWindow("overview"));
  await page.waitForTimeout(300);
  R.windows = await page.evaluate(() => window.__vb.windows());
  R.overview = await page.evaluate(() => window.__vb.overviewInfo());
  await shot("scenario-10-overview.png");

  // Drag on the overview canvas pans the main map.
  const ovBox = await page.locator(".overview-canvas").boundingBox();
  if (ovBox) {
    await page.mouse.move(ovBox.x + ovBox.width * 0.25, ovBox.y + ovBox.height * 0.25);
    await page.mouse.down();
    await page.mouse.move(ovBox.x + ovBox.width * 0.7, ovBox.y + ovBox.height * 0.7, { steps: 5 });
    await page.mouse.up();
  }
  await page.waitForTimeout(200);
  R.centerAfterOverviewDrag = await page.evaluate(() => window.__vb.viewCenter());

  // ---- Sheet mode on a phone-sized viewport ---------------------------------
  await page.setViewportSize({ width: 390, height: 720 });
  await page.waitForTimeout(300);
  R.sheetMode = {
    mode: await page.evaluate(() => window.__vb.wmMode()),
    layerClass: await page.evaluate(() => document.querySelector(".wm-layer")?.className ?? ""),
    windowRect: await page.evaluate(() => {
      const el = document.querySelector(".wm-window.wm-top");
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    }),
  };
  await shot("scenario-15-sheet-mode.png");

  // Side panels become slide-over drawers on phone widths.
  await page.evaluate(() => window.__vb.closeWindow("overview"));
  R.drawers = await page.evaluate(() => ({
    palettePosition: getComputedStyle(document.querySelector(".palette-host")).position,
    chatterPosition: getComputedStyle(document.querySelector(".chatter")).position,
  }));
  await shot("scenario-16-drawers.png");
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.waitForTimeout(300);
  await shot("scenario-17-tablet.png");
  await page.evaluate(() => window.__vb.openWindow("overview"));
  await page.waitForTimeout(200);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(300);
  R.floatRestored = await page.evaluate(() => window.__vb.wmMode());
  await page.evaluate(() => window.__vb.closeWindow("overview"));
  R.windowsAfterClose = await page.evaluate(() => window.__vb.windows());

  assertScenario(R);
} catch (e) {
  console.log("[scenario] ERROR:", e.stack || e.message);
  R.error = e.message;
  process.exitCode = 1;
} finally {
  console.log("RESULT_JSON=" + JSON.stringify(R));
  await browser.close();
  server.close();
}

async function shot(name) {
  await page.screenshot({ path: `${OUT}/${name}` });
}

async function paletteLabels() {
  return page.$$eval(".palette-slot .palette-label", (els) => els.map((e) => e.textContent || ""));
}

async function testPaletteFilter(query) {
  return page.evaluate((q) => {
    const collapse = [...document.querySelectorAll(".palette-controls button")].find((b) => b.textContent?.includes("Collapse"));
    collapse?.click();
    const input = document.querySelector(".palette-search");
    input.value = q;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    const visible = [...document.querySelectorAll(".palette-slot:not([hidden]) .palette-label")].map((e) => e.textContent || "");
    const openHeaders = [...document.querySelectorAll(".palette-group-header")]
      .filter((h) => h.textContent?.startsWith("▾"))
      .map((h) => h.textContent?.replace(/^[▸▾]\s*/, "") || "");
    input.value = "";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    return { query: q, visible, openHeaders };
  }, query);
}

async function testSidebarToggles() {
  return page.evaluate(() => {
    const before = { board: window.__vb.currentBoard(), pieces: window.__vb.pieceCount() };
    const palette = [...document.querySelectorAll(".toolbar-btn")].find((b) => b.textContent?.includes("Palette"));
    const log = [...document.querySelectorAll(".toolbar-btn")].find((b) => b.textContent?.includes("Log"));
    palette?.click();
    log?.click();
    const hidden = {
      left: getComputedStyle(document.querySelector(".palette-host")).display === "none",
      right: getComputedStyle(document.querySelector(".chatter")).display === "none",
      board: window.__vb.currentBoard(),
      pieces: window.__vb.pieceCount(),
    };
    palette?.click();
    log?.click();
    const restored = {
      left: getComputedStyle(document.querySelector(".palette-host")).display !== "none",
      right: getComputedStyle(document.querySelector(".chatter")).display !== "none",
      board: window.__vb.currentBoard(),
      pieces: window.__vb.pieceCount(),
    };
    return { before, hidden, restored };
  });
}

async function placeExact(label) {
  await applyPaletteSearch(label);
  const result = await visibleSlotIndex((text) => text === label);
  if (!result) return null;
  const slots = await page.$$(".palette-slot:not([hidden])");
  await slots[result.index].scrollIntoViewIfNeeded().catch(() => {});
  await slots[result.index].dblclick();
  await page.waitForTimeout(350);
  return result.label;
}

async function placeFirst(candidates) {
  for (const wanted of candidates) {
    await applyPaletteSearch(wanted);
    const result = await visibleSlotIndex((text) => text.toLowerCase() === wanted.toLowerCase());
    if (result) {
      const slots = await page.$$(".palette-slot:not([hidden])");
      await slots[result.index].scrollIntoViewIfNeeded().catch(() => {});
      await slots[result.index].dblclick();
      await page.waitForTimeout(350);
      return result.label;
    }
  }
  return null;
}

async function placeByPath(pathParts, label) {
  await applyPaletteSearch(label);
  const result = await page.$$eval(".palette-slot:not([hidden])", (slots, args) => {
    const wantedPath = args.pathParts.map((p) => p.toLowerCase());
    const wantedLabel = args.label.toLowerCase();
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      const text = slot.querySelector(".palette-label")?.textContent?.trim().toLowerCase() ?? "";
      if (text !== wantedLabel) continue;
      const path = [];
      let node = slot.parentElement;
      while (node) {
        const prev = node.previousElementSibling;
        if (prev?.classList.contains("palette-group-header")) path.push(prev.textContent?.replace(/^[▸▾]\s*/, "").trim().toLowerCase() ?? "");
        node = node.parentElement?.closest(".palette-group-body") ?? null;
      }
      if (wantedPath.every((part) => path.some((entry) => entry.includes(part)))) return { index: i, label: slot.querySelector(".palette-label")?.textContent ?? "" };
    }
    return null;
  }, { pathParts, label });
  if (!result) return null;
  const slots = await page.$$(".palette-slot:not([hidden])");
  await slots[result.index].scrollIntoViewIfNeeded().catch(() => {});
  await slots[result.index].dblclick();
  await page.waitForTimeout(350);
  return result.label;
}

async function applyPaletteSearch(query) {
  await page.evaluate((q) => {
    const input = document.querySelector(".palette-search");
    input.value = q;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }, query);
  await page.waitForTimeout(80);
}

async function visibleSlotIndex(predicate) {
  const labels = await page.$$eval(".palette-slot:not([hidden]) .palette-label", (els) => els.map((e) => e.textContent || ""));
  const index = labels.findIndex(predicate);
  return index >= 0 ? { index, label: labels[index] } : null;
}

async function selectedName() {
  return page.evaluate(() => window.__vb.selectedName());
}

async function selectedLayers() {
  return page.evaluate(() => window.__vb.selectedLayers());
}

async function selectedCommands() {
  return page.evaluate(() => window.__vb.selectedCommands());
}

async function selectedLocked() {
  return page.evaluate(() => window.__vb.map().getSelected()?.isImmobile() ?? null);
}

async function dragPieceByPointer(name, dx, dy) {
  const before = await page.evaluate((pieceName) => {
    if (!window.__vb.selectPiece(pieceName)) return null;
    const pos = window.__vb.selectedClientPos();
    const piece = window.__vb.pieces().find((p) => p.name === pieceName);
    return pos && piece ? { client: pos, piece } : null;
  }, name);
  if (!before) return { moved: false, reason: "not-found" };
  await page.mouse.move(before.client.x, before.client.y);
  await page.mouse.down();
  await page.mouse.move(before.client.x + dx, before.client.y + dy, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(200);
  const after = await page.evaluate((pieceName) => window.__vb.pieces().find((p) => p.name === pieceName) ?? null, name);
  if (!after) return { moved: false, before: before.piece, after: null };
  const dist = Math.hypot(after.x - before.piece.x, after.y - before.piece.y);
  return { moved: dist > 8, before: before.piece, after, dist };
}

async function dragSelectedByPointer(dx, dy) {
  const before = await page.evaluate(() => {
    const selected = window.__vb.map().getSelected();
    const pos = window.__vb.selectedClientPos();
    const piece = selected ? window.__vb.pieces().find((p) => p.id === selected.instanceId) : null;
    return pos && piece ? { client: pos, piece } : null;
  });
  if (!before) return { moved: false, reason: "no-selection" };
  await page.mouse.move(before.client.x, before.client.y);
  await page.mouse.down();
  await page.mouse.move(before.client.x + dx, before.client.y + dy, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(200);
  const after = await page.evaluate((id) => window.__vb.pieces().find((p) => p.id === id) ?? null, before.piece.id);
  if (!after) return { moved: false, before: before.piece, after: null };
  const dist = Math.hypot(after.x - before.piece.x, after.y - before.piece.y);
  return { moved: dist > 8, before: before.piece, after, dist };
}

async function multiSelectAndDrag(names, dx, dy) {
  const setup = await page.evaluate((pieceNames) => {
    const out = [];
    for (const name of pieceNames) {
      if (!window.__vb.selectPiece(name)) return null;
      const pos = window.__vb.selectedClientPos();
      const piece = window.__vb.pieces().find((p) => p.name === name);
      if (!pos || !piece) return null;
      out.push({ name, pos, before: piece });
    }
    return out;
  }, names);
  if (!setup || setup.length < 2) return { moved: false, reason: "setup-failed", setup };
  await page.mouse.click(setup[0].pos.x, setup[0].pos.y);
  await page.keyboard.down("Shift");
  await page.mouse.click(setup[1].pos.x, setup[1].pos.y);
  await page.keyboard.up("Shift");
  const count = await page.evaluate(() => window.__vb.selectedCount());
  await page.mouse.move(setup[0].pos.x, setup[0].pos.y);
  await page.mouse.down();
  await page.mouse.move(setup[0].pos.x + dx, setup[0].pos.y + dy, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(200);
  const after = await page.evaluate((ids) => window.__vb.pieces().filter((p) => ids.includes(p.id)), setup.map((s) => s.before.id));
  const moved = setup.every((s) => {
    const a = after.find((p) => p.id === s.before.id);
    return a && Math.hypot(a.x - s.before.x, a.y - s.before.y) > 6;
  });
  return { moved, count, before: setup.map((s) => s.before), after };
}

function must(value, message) {
  if (!value) throw new Error(message);
}

function assertScenario(r) {
  must(r.title?.includes(cfg.titleIncludes), "Module did not load");
  must(r.board?.includes(cfg.boardIncludes), "Expected board was not selected");
  must(r.extensionBoards?.length > 0, "Board extension boards were not merged into the main map");
  for (const setup of cfg.composedSetups) {
    must(r.predefinedBoards?.some((b) => b.name === setup.name && b.tiles >= setup.minTiles), `Setup ${setup.name} was not exposed as a composed board`);
  }
  must(r.selectSetup && r.currentBoardInfo?.name === cfg.selectSetup, "Could not select the predefined composed setup");
  must(r.filter?.visible?.some((l) => l.toLowerCase().includes(cfg.filterQuery.toLowerCase())), "Palette filter did not reveal a buried result");
  must(r.filter?.openHeaders?.length > 0, "Palette filter did not expand ancestor groups");
  must(r.hasChitA, "Chit A slot was not found");
  must(r.hasChitB || r.hasChitBFallback, "Chit B / fallback slot was not found");
  must(r.chitA?.layers?.some((l) => cfg.chitALayerRe.test(l)), "Chit A layers did not render");
  must(r.chitB?.layers?.some((l) => cfg.chitBLayerRe.test(l)), "Chit B layers did not render");
  must(r.chitB?.afterLayerCycle?.join("|") !== r.chitB?.layers?.join("|"), "Layer command did not change the layers");
  must(r.terrain?.afterLock === true, "Terrain did not lock");
  must(r.mapStateAfterSwitch?.map === r.mapStateBeforeSwitch?.map, "Map did not switch back to the original table");
  must(r.mapStateAfterSwitch?.board === r.mapStateBeforeSwitch?.board, "Board image was not preserved across map switches");
  must(r.mapStateAfterSwitch?.pieces?.length === r.mapStateBeforeSwitch?.pieces?.length, "Pieces were not preserved across map switches");
  must(r.pointerDrag?.chitB?.moved, "Chit B could not be moved with pointer drag after other tokens were placed");
  must(r.pointerDrag?.chitA?.moved, "Chit A could not be moved with pointer drag after other tokens were placed");
  must(r.pointerDrag?.extraChitA?.moved, "Second chit A could not be moved with pointer drag");
  must(r.pointerDrag?.extraChitC?.moved, "Chit C could not be moved with pointer drag");
  must(r.pointerDrag?.pathChit?.moved, "Group-path chit could not be moved with pointer drag");
  must(r.multiSelect?.count >= 2 && r.multiSelect?.moved, "Multi-selected pieces did not move as a group");
  must(r.sidebars?.hidden?.left && r.sidebars?.hidden?.right, "Sidebars did not collapse");
  must(r.sidebars?.restored?.left && r.sidebars?.restored?.right, "Sidebars did not restore");
  must(r.sidebars?.hidden?.board === r.sidebars?.before?.board && r.sidebars?.restored?.pieces === r.sidebars?.before?.pieces, "Sidebar toggles changed map state");
  must(Array.isArray(r.afterMoves) && r.afterMoves.length >= 3, "Moved pieces were not recorded");
  must(r.measureBlocked?.blocked === true, "Blocked LOS was not detected");
  must(r.measureOpen?.blocked === false, "Open LOS was not detected");
  must(r.diceButtons?.some((b) => b.name === "D6" && b.nSides === 6), "VASSAL DiceButton definitions were not exposed");
  must(r.chatLog?.some((e) => /d6:/.test(e.text)), "d6 roll was not logged");
  must(r.chatLog?.some((e) => /2d6:/.test(e.text)), "2d6 roll was not logged");
  must(r.cardDecks?.some((d) => cfg.deckRe.test(d.name)), "Card decks were not exposed");
  must(r.drawnCard?.preview, "Card draw did not render a preview");
  must(r.drawnCard?.log?.some((e) => /Drew .* from/.test(e.text)), "Card draw was not logged");
  must(r.saveStateDebug?.board, "Save-state debug did not expose the active board");
  must(r.saveStateDebug?.pieces?.length >= 3, "Save-state debug did not expose the active pieces");
  const tb = r.toolbarButtons ?? [];
  const menuOf = (text) => tb.find((t) => t.kind === "menu" && t.text === text);
  must(menuOf(cfg.diceMenu.text)?.items?.length === cfg.diceMenu.count && menuOf(cfg.diceMenu.text).items.every((i) => i.kind === "dice"), "Dice menu did not capture its DiceButtons");
  must(menuOf(cfg.mapMenu.text)?.items?.length === cfg.mapMenu.count && menuOf(cfg.mapMenu.text).items.every((i) => i.kind === "map"), "Map menu did not capture its map buttons");
  must(menuOf("Overview")?.items?.some((i) => i.kind === "globalMap"), "Overview menu did not capture the main map's GlobalMap button");
  must(tb.some((t) => t.kind === "notes" && t.text === cfg.notesButton), "NotesWindow button was not parsed");
  must(tb.some((t) => t.kind === "turnTracker"), "TurnTracker button was not parsed");
  must(tb.some((t) => t.kind === "unsupported" && t.component === cfg.unsupported), "Unsupported components were not surfaced in debug");
  must(r.menuMapSwitch === cfg.mapMenu.item, "Clicking a map menu item did not switch maps");
  must(r.menuDiceLogged === true, "Module toolbar dice item did not log a roll");
  must(r.dicePopover?.items === cfg.diceMenu.count, "Dice dropdown did not show all its entries");
  must(r.dicePopover?.inViewport === true, "Dice dropdown was not fully on-screen");
  must(r.dicePopover?.bottomVisible === true, "Dice dropdown is clipped (bottom of popover not hit-testable)");
  must(r.notesAfterSave?.scenario?.includes(NOTE_LINE_1), "Scenario note was not saved from the Notes window");
  must(r.notesAfterSave?.scenario?.includes("\n\n"), "Scenario note lost its blank line");
  must(Object.values(r.notesAfterSave?.private ?? {}).some((t) => t.includes("flank left")), "Private note was not saved");
  must(r.notesWindowClosedOnSave === true, "Notes window did not close on Save");
  must(r.notesRoundTrip?.scenario === r.notesAfterSave?.scenario, "Scenario note did not survive the .vsav round-trip");
  must(
    JSON.stringify(r.notesRoundTrip?.private) === JSON.stringify(r.notesAfterSave?.private),
    "Private notes did not survive the .vsav round-trip",
  );
  must(r.preview?.slotName === cfg.chitA && r.preview?.hasPixels === true, "Preview pane did not render the composed chit A");
  must(r.previewSelectedClass === cfg.chitA, "Palette slot did not highlight as selected");
  must(r.previewCounts?.afterPlace === r.previewCounts?.beforePlace + 1, "Preview Place button did not place exactly one piece");
  must(r.previewCounts?.afterDrag === r.previewCounts?.afterPlace + 1, "Dragging from the preview did not place a piece");
  must(r.contextMenu?.subRows?.includes(cfg.submenu.row), "Context menu did not show the submenu row");
  must(!r.contextMenu?.top?.includes(cfg.submenu.notTop), "Submenu commands were not folded out of the top-level context menu");
  must(cfg.submenu.mustHave.every((i) => r.contextSub?.items?.includes(i)), "Submenu flyout is missing its commands");
  must(r.contextSub?.inViewport === true, "Submenu flyout was not fully on-screen");
  must(JSON.stringify(r.layersAfterSub) !== JSON.stringify(r.layersBeforeSub), "Clicking a command in the flyout did not toggle its layer");
  must(r.turnState?.formatted === cfg.turnAfterNext, "Turn Counter next did not advance as expected");
  must(r.turnReportLogged === true, "Turn advance was not reported to the chat log");
  must(r.turnAfterRoundTrip?.formatted === r.turnState?.formatted, "Turn state did not survive the .vsav round-trip");
  must(r.windows?.length === 1 && r.windows[0].id === "overview", "Overview window did not open");
  must(r.overview?.open && r.overview?.scale > 0, "Overview did not render a scaled board");
  must(r.overview?.boardSize?.width > 0, "Overview did not expose the board size");
  must(
    Math.hypot(
      (r.centerAfterOverviewDrag?.x ?? 0) - (r.centerBeforeOverviewDrag?.x ?? 0),
      (r.centerAfterOverviewDrag?.y ?? 0) - (r.centerBeforeOverviewDrag?.y ?? 0),
    ) > 20,
    "Dragging the overview did not pan the main map",
  );
  must(r.sheetMode?.mode === "sheet" && /wm-mode-sheet/.test(r.sheetMode?.layerClass ?? ""), "Narrow viewport did not switch windows to sheet mode");
  must(r.drawers?.palettePosition === "absolute" && r.drawers?.chatterPosition === "absolute", "Side panels did not become slide-over drawers at phone width");
  must(r.sheetMode?.windowRect && r.sheetMode.windowRect.w >= 388 && r.sheetMode.windowRect.x <= 1, "Sheet-mode window did not fill the screen");
  must(r.floatRestored === "float", "Windows did not return to float mode on a wide viewport");
  must(r.windowsAfterClose?.length === 0, "Overview window did not close");
}
