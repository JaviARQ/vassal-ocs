/**
 * Hex-grid module verifier: board archives, hex snapping/moves/range, custom
 * traits (conceal, trigger-driven marker placement), DR/dr dice, ChartWindow,
 * legacy save import. Module-specific values (preset name, board/hex ids,
 * palette labels, chart tabs) come from verify.config.local.mjs (gitignored;
 * see verify.config.example.mjs) — skips cleanly when absent.
 *
 * Serves dist/ and drives Chromium through:
 *  1. Load the configured preset (module + lazy board manifest).
 *  2. Pick a board → board image + hex grid come from the board archive.
 *  3. Place chit A, snap it to hex A, move it to hex B (hex move report),
 *     flip it (layer + ReportState line), conceal it ("?" overlay).
 *  4. Place chit B in hex C; measure the hex range A→C.
 *  5. Fire the trigger command (TriggerAction → PlaceDM/PlaceMarker spawn) or
 *     fall back to placing a marker from the palette.
 *  6. Roll DR/dr dice into the chatter; open the ChartWindow tabs.
 *  7. Import a legacy-era .vsav fixture.
 *
 * Screenshots + grid-result.json land in verify-shots/.
 */
import http from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { chromium } from "playwright";

let cfg;
try {
  cfg = (await import("./verify.config.local.mjs")).default?.grid;
} catch {
  cfg = null;
}
if (!cfg) {
  console.log("[grid] SKIPPED — no scripts/verify.config.local.mjs (see verify.config.example.mjs)");
  process.exit(0);
}

const ROOT = new URL("../dist/", import.meta.url).pathname;
const OUT = process.env.SHOTS_DIR || new URL("../verify-shots/", import.meta.url).pathname;
await mkdir(OUT, { recursive: true }).catch(() => {});
const MIME = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript",
  ".css": "text/css", ".png": "image/png", ".jpg": "image/jpeg", ".gif": "image/gif",
  ".svg": "image/svg+xml", ".vmod": "application/zip", ".json": "application/json", ".map": "application/json" };
const log = (...a) => console.log("[grid]", ...a);
const failures = [];
const check = (ok, what) => {
  log(ok ? "PASS" : "FAIL", what);
  if (!ok) failures.push(what);
};

const server = http.createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (p === "/") p = "/index.html";
    const file = join(ROOT, normalize(p).replace(/^(\.\.[/\\])+/, ""));
    const body = await readFile(file);
    res.writeHead(200, { "content-type": MIME[extname(file)] || "application/octet-stream" });
    res.end(body);
  } catch { res.writeHead(404); res.end("not found"); }
});
await new Promise((r) => server.listen(4175, r));
log("serving dist/ on :4175");

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("pageerror", (e) => console.log("[pageerror]", e.message));
page.on("console", (m) => { if (m.type() === "error") console.log("[console.error]", m.text()); });

const R = {};
const vb = (expr) => page.evaluate(`window.__vb.${expr}`);
const chatHas = async (re) => {
  const logEntries = await vb("chatLog()");
  return logEntries.some((e) => re.test(e.text));
};
const { hexA, hexB, hexC } = cfg;

try {
  await page.goto("http://localhost:4175/", { waitUntil: "load" });

  // 1. Load the preset (large module → allow a generous unzip window).
  await page.click(`button.preset-btn:has-text(${JSON.stringify(cfg.preset)})`);
  await page.waitForSelector(".toolbar", { timeout: 120000 });
  await page.waitForTimeout(1500);
  R.title = await page.title();
  check(cfg.titleRe.test(R.title), `module loaded (title: ${R.title})`);

  const maps = await vb("maps()");
  R.mainMap = maps[0]?.name;
  R.boardCount = maps[0]?.boards.length ?? 0;
  check(R.mainMap === cfg.mainMap, `main map present (${R.mainMap})`);
  check(R.boardCount > cfg.minBoards, `board manifest merged (${R.boardCount} boards)`);
  await page.screenshot({ path: `${OUT}/grid-01-loaded.png` });

  // 2. Select a board (lazy fetch + metadata grid).
  check(await vb(`selectBoard(${JSON.stringify(cfg.board)})`), `selectBoard(${cfg.board}) accepted`);
  await page.waitForFunction(() => window.__vb.gridPresent(), null, { timeout: 30000 });
  const boardInfo = await vb("currentBoardInfo()");
  R.board = boardInfo;
  check(boardInfo?.image === cfg.boardImage, `board image resolved (${boardInfo?.image})`);
  const a = await vb(`hexCenter(${JSON.stringify(hexA)})`);
  R.hexACenter = a;
  check(!!a && Math.abs(a.x - cfg.hexACenter.x) < 2 && Math.abs(a.y - cfg.hexACenter.y) < 2,
    `hex ${hexA} center ≈ (${cfg.hexACenter.x},${cfg.hexACenter.y}): ${JSON.stringify(a)}`);
  await page.waitForTimeout(800); // board image decode
  await page.screenshot({ path: `${OUT}/grid-02-board.png` });

  // 3. Chit A into hex A.
  check(await vb(`previewSlot(${JSON.stringify(cfg.chitA.name)}, ${JSON.stringify(cfg.chitA.path)})`), "chit A slot found");
  check(await vb("placePreviewed()"), "chit A placed");
  await vb(`setSelectedPos(${a.x}, ${a.y})`);
  R.chitALoc = await vb("selectedLocation()");
  check(R.chitALoc === hexA, `chit A snapped into ${hexA} (${R.chitALoc})`);
  R.chitAName = await vb("selectedName()");
  R.chitACommands = await vb("selectedCommands()");
  check(R.chitACommands.includes("Conceal"), `commands include Conceal: ${JSON.stringify(R.chitACommands.slice(0, 12))}`);
  check(R.chitACommands.includes("Show Info") || R.chitACommands.includes("SQ/HS"), "custom-trait commands (Show Info / SQ/HS) present");

  // Move hex A → hex B by dropping on the neighbouring hex center.
  const b = await vb(`hexCenter(${JSON.stringify(hexB)})`);
  await vb(`setSelectedPos(${b.x}, ${b.y})`);
  check((await vb("selectedLocation()")) === hexB, `moved to ${hexB}`);
  check(await chatHas(new RegExp(`moves ${hexA} -> ${hexB}`)), "hex move report in chatter");
  await vb(`setSelectedPos(${a.x}, ${a.y})`); // back home for the story

  // Flip with the module's flip key: emb2 flip + ReportState line.
  const layersBefore = await vb("selectedLayers()");
  await page.keyboard.press(cfg.flipKey);
  await page.waitForTimeout(200);
  const layersAfter = await vb("selectedLayers()");
  R.flipLayers = { before: layersBefore, after: layersAfter };
  check(JSON.stringify(layersBefore) !== JSON.stringify(layersAfter), `${cfg.flipKey} flips a layer (${JSON.stringify(layersAfter)})`);
  check(await chatHas(new RegExp(`${hexA}: `)), "flip ReportState line in chatter");
  await page.screenshot({ path: `${OUT}/grid-03-flipped.png` });

  // Conceal (Concealable trait): "?" overlay appears.
  check(await vb(`runCommand("Conceal")`), "Conceal command ran");
  const concealedLayers = await vb("selectedLayers()");
  R.concealedLayers = concealedLayers;
  check(concealedLayers.some((l) => cfg.concealOverlayRe.test(l)), `concealment ? overlay active (${JSON.stringify(concealedLayers)})`);
  check((await vb("selectedCommands()")).includes("Unconceal"), "command toggled to Unconceal");
  await page.screenshot({ path: `${OUT}/grid-04-concealed.png` });
  await vb(`runCommand("Unconceal")`);

  // SQ/HS-style toggle (emb2 with menu command), when the chit offers one.
  if ((await vb("selectedCommands()")).includes("SQ/HS")) {
    const before = await vb("selectedLayers()");
    await vb(`runCommand("SQ/HS")`);
    R.sqhs = { before, after: await vb("selectedLayers()") };
    check(JSON.stringify(R.sqhs.before) !== JSON.stringify(R.sqhs.after), "SQ/HS toggled the layer");
    await vb(`runCommand("SQ/HS")`);
  }

  // 4. Chit B into hex C + hex range measurement.
  check(await vb(`previewSlot(${JSON.stringify(cfg.chitB.name)}, ${JSON.stringify(cfg.chitB.path)})`), "chit B slot found");
  check(await vb("placePreviewed()"), "chit B placed");
  const c = await vb(`hexCenter(${JSON.stringify(hexC)})`);
  await vb(`setSelectedPos(${c.x}, ${c.y})`);
  check((await vb("selectedLocation()")) === hexC, `chit B in ${hexC}`);
  await vb(`setMeasure(${a.x}, ${a.y}, ${c.x}, ${c.y})`);
  const range = await vb("measureInfo()");
  R.range = range;
  check(range?.distance === cfg.rangeAC && range?.unit === "hexes", `range ${hexA}→${hexC} = ${cfg.rangeAC} hexes (${JSON.stringify(range)})`);
  await page.screenshot({ path: `${OUT}/grid-05-faceoff.png` });
  await vb("toggleMeasure()");

  // 5. Trigger-driven placement (TriggerAction → PlaceDM/PlaceMarker spawn),
  //    with a palette marker as fallback so the step is always exercised.
  check(await vb(`selectPiece(${JSON.stringify(R.chitAName)})`), "reselect chit A");
  const countBefore = await vb("pieceCount()");
  if ((await vb("selectedCommands()")).includes(cfg.triggerCommand)) {
    await vb(`runCommand(${JSON.stringify(cfg.triggerCommand)})`);
    await page.waitForTimeout(200);
  }
  let countAfter = await vb("pieceCount()");
  R.triggerSpawn = { before: countBefore, after: countAfter };
  if (countAfter === countBefore) {
    check(await vb(`previewSlot(${JSON.stringify(cfg.markerSlot.name)}, ${JSON.stringify(cfg.markerSlot.path)})`), "palette marker slot found");
    await vb("placePreviewed()");
    await vb(`setSelectedPos(${a.x}, ${a.y})`);
    countAfter = await vb("pieceCount()");
  }
  check(countAfter > countBefore, `marker placement grew the table (${countBefore} → ${countAfter})`);
  await page.screenshot({ path: `${OUT}/grid-06-marker.png` });

  // 6. DiceBot DR/dr rolls.
  await vb(`rollDR(${JSON.stringify(cfg.drCategory)})`);
  await vb(`rollDr(${JSON.stringify(cfg.drSingleCategory)})`);
  check(await chatHas(cfg.drRe), `${cfg.drCategory} DR in chatter`);
  check(await chatHas(cfg.drSingleRe), `${cfg.drSingleCategory} dr in chatter`);
  await page.screenshot({ path: `${OUT}/grid-07-final.png` });

  // 7. Module toolbar: Notes button and the ChartWindow.
  R.toolbarButtons = await vb("toolbarButtons()");
  check(R.toolbarButtons.some((b) => b.kind === "notes"), "Notes button in module toolbar");
  check(R.toolbarButtons.some((b) => b.kind === "chartWindow"), "ChartWindow button in module toolbar");
  check(!R.toolbarButtons.some((b) => b.kind === "unsupported" && /Chart/.test(b.component ?? "")), "ChartWindow no longer unsupported");

  check(await vb(`openWindow("notes")`), "Notes window opens");
  await vb(`closeWindow("notes")`);

  check(await vb(`openWindow(${JSON.stringify(cfg.chart.id)})`), "chart window opens");
  const tabNames = await page.evaluate(() =>
    [...document.querySelectorAll(".chart-window > .chart-tabs > .chart-tab-bar button")].map((b) => b.textContent));
  R.chartTabs = tabNames;
  check(JSON.stringify(tabNames) === JSON.stringify(cfg.chart.tabs),
    `chart top-level tabs (${JSON.stringify(tabNames)})`);
  await page.waitForFunction(() => {
    const img = document.querySelector(".chart-window .chart-tab-body img");
    return img && img.complete && img.naturalWidth > 0;
  }, null, { timeout: 15000 });
  check(true, "first chart image rendered");
  // Nested tabs.
  await page.click(`.chart-window > .chart-tabs > .chart-tab-bar button:has-text(${JSON.stringify(cfg.chart.nestedTab)})`);
  const nested = await page.evaluate(() =>
    [...document.querySelectorAll(".chart-window .chart-tab-body .chart-tab-bar button")].map((b) => b.textContent));
  R.chartNestedTabs = nested;
  check(JSON.stringify(nested) === JSON.stringify(cfg.chart.nestedTabs), `nested tabs (${JSON.stringify(nested)})`);
  await page.waitForFunction(() => {
    const img = document.querySelector(".chart-window .chart-tab-body img");
    return img && img.complete && img.naturalWidth > 0;
  }, null, { timeout: 15000 });
  await page.screenshot({ path: `${OUT}/grid-08-charts.png` });
  await vb(`closeWindow(${JSON.stringify(cfg.chart.id)})`);

  // 8. Legacy extensionless art: the composed palette preview must have real
  //    pixels, not a blank square.
  check(await vb(`previewSlot(${JSON.stringify(cfg.artProbe.name)}, ${JSON.stringify(cfg.artProbe.path)})`), "art-probe slot found");
  await page.waitForFunction(() => window.__vb.previewInfo().hasPixels, null, { timeout: 15000 });
  R.artPreview = await vb("previewInfo()");
  check(R.artPreview.hasPixels, `art-probe preview has pixels (${JSON.stringify(R.artPreview)})`);
  await page.screenshot({ path: `${OUT}/grid-09-art.png` });

  // 9. Load a legacy-era .vsav (VASSAL 3.2): ASLBoardPicker `bd` board
  //    command, "Map0" map ids, singleton-Stack wrappers.
  const saveB64 = (await readFile(new URL("../" + cfg.legacySave.file, import.meta.url))).toString("base64");
  check(await page.evaluate((b64) => window.__vb.loadSaveBytes(b64), saveB64), "legacy .vsav accepted");
  await page.waitForFunction((img) => window.__vb.currentBoardInfo()?.image === img, cfg.legacySave.boardImage, { timeout: 30000 });
  R.legacySave = { board: await vb("currentBoardInfo()"), pieces: await vb("pieceCount()") };
  check(R.legacySave.board?.image === cfg.legacySave.boardImage, `save selected its board (${JSON.stringify(R.legacySave.board)})`);
  check(R.legacySave.pieces === cfg.legacySave.pieces, `all ${cfg.legacySave.pieces} pieces imported (${R.legacySave.pieces})`);
  await page.waitForTimeout(1200); // board + counter art decode
  await page.screenshot({ path: `${OUT}/grid-10-legacy-save.png` });

  R.pieces = await vb("pieces()");
  R.chatTail = (await vb("chatLog()")).slice(-12).map((e) => e.text);
} catch (err) {
  failures.push(`exception: ${err.message}`);
  console.error(err);
  await page.screenshot({ path: `${OUT}/grid-error.png` }).catch(() => {});
}

R.failures = failures;
await writeFile(join(OUT, "grid-result.json"), JSON.stringify(R, null, 2));
await browser.close();
server.close();

if (failures.length) {
  log(`FAILED — ${failures.length} check(s):`);
  for (const f of failures) log("  ✗", f);
  process.exit(1);
}
log("ALL CHECKS PASSED — screenshots in verify-shots/grid-*.png");
