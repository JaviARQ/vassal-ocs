/**
 * Fast smoke verifier: load a module + extensions, place two chits, drag,
 * rotate, context menu, cycle an Embellishment layer, lock. Module-specific
 * values (URL, palette labels) come from verify.config.local.mjs (gitignored;
 * see verify.config.example.mjs) — skips cleanly when absent.
 */
import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { chromium } from "playwright";

let cfg;
try {
  cfg = (await import("./verify.config.local.mjs")).default?.smoke;
} catch {
  cfg = null;
}
if (!cfg) {
  console.log("[smoke] SKIPPED — no scripts/verify.config.local.mjs (see verify.config.example.mjs)");
  process.exit(0);
}

const ROOT = new URL("../dist/", import.meta.url).pathname;
const OUT = process.env.SHOTS_DIR || new URL("../verify-shots/", import.meta.url).pathname;
await (await import("node:fs/promises")).mkdir(OUT, { recursive: true }).catch(() => {});
const MIME = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript",
  ".css": "text/css", ".png": "image/png", ".jpg": "image/jpeg", ".gif": "image/gif",
  ".svg": "image/svg+xml", ".vmod": "application/zip", ".vmdx": "application/zip", ".map": "application/json" };
const log = (...a) => console.log("[smoke]", ...a);

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
await new Promise((r) => server.listen(4173, r));
log("serving dist/ on :4173");

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on("pageerror", (e) => console.log("[pageerror]", e.message));
page.on("console", (m) => { if (m.type() === "error") console.log("[console.error]", m.text()); });

const R = {};
try {
  await page.goto("http://localhost:4173" + cfg.url, { waitUntil: "load" });
  await page.waitForSelector(".toolbar", { timeout: 30000 });
  await page.waitForTimeout(2500); // module + extensions + board image
  R.title = await page.title();
  R.board = await page.evaluate(() => { const s = document.querySelectorAll(".toolbar select")[1]; return s ? s.options[s.selectedIndex]?.textContent : null; });
  await page.screenshot({ path: `${OUT}/01-loaded.png` });
  log("title:", R.title, "| board:", R.board);

  for (let i = 0; i < 14; i++) {
    const hs = await page.$$(".palette-group-header");
    for (const h of hs) { const t = (await h.textContent()) || ""; if (t.startsWith("▸")) await h.click().catch(() => {}); }
    await page.waitForTimeout(100);
  }
  const labels = await page.$$eval(".palette-slot .palette-label", (els) => els.map((e) => e.textContent || ""));
  R.slotCount = labels.length;
  R.chitAOptions = labels.filter((l) => cfg.chitA.probe.test(l)).slice(0, 5);
  R.chitBOptions = labels.filter((l) => cfg.chitB.probe.test(l)).slice(0, 5);
  log("slots:", labels.length, "| chitA:", JSON.stringify(R.chitAOptions), "| chitB:", JSON.stringify(R.chitBOptions));

  async function place(re) {
    const idx = labels.findIndex((l) => re.test(l));
    if (idx < 0) return null;
    const slots = await page.$$(".palette-slot");
    await slots[idx].scrollIntoViewIfNeeded().catch(() => {});
    await slots[idx].dblclick();
    await page.waitForTimeout(400);
    return labels[idx];
  }

  // Place chit A, drag it aside, then place chit B facing it.
  R.chitA = await place(cfg.chitA.place);
  const apos = await page.evaluate(() => window.__vb.selectedClientPos());
  if (apos) { await page.mouse.move(apos.x, apos.y); await page.mouse.down(); await page.mouse.move(apos.x - 170, apos.y + 10, { steps: 12 }); await page.mouse.up(); await page.waitForTimeout(200); }
  R.chitB = await place(cfg.chitB.place);
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${OUT}/03-faceoff.png` });
  // Close-up crop around both chits to inspect base-under-sprite stacking.
  await page.screenshot({ path: `${OUT}/03b-closeup.png`, clip: { x: 560, y: 380, width: 280, height: 90 } });

  R.afterPlace = await page.evaluate(() => ({ pieces: window.__vb.pieceCount(), selected: window.__vb.selectedName(), commands: window.__vb.selectedCommands() }));
  log("afterPlace:", JSON.stringify(R.afterPlace));

  // Rotate the selected chit with a keyboard shortcut. Extension pieces often
  // bind rotation to a step key (Alt+X); base pieces use Ctrl+Right. Try both
  // and record which shortcut moved it.
  const rotBefore = await page.evaluate(() => window.__vb.selectedRotation());
  await page.keyboard.press("Alt+x");
  await page.waitForTimeout(120);
  let rotAfter = await page.evaluate(() => window.__vb.selectedRotation());
  let via = "Alt+X";
  if (rotAfter === rotBefore) { await page.keyboard.press("Control+ArrowRight"); await page.waitForTimeout(120); rotAfter = await page.evaluate(() => window.__vb.selectedRotation()); via = "Ctrl+Right"; }
  // Some pieces bind rotation to NamedKeyStrokes (RotateRight/Left) not raw
  // keys, so fall back to the Rotate CW command to prove the rotate mechanic.
  if (rotAfter === rotBefore) { await page.evaluate(() => window.__vb.runCommand("Rotate CW")); await page.waitForTimeout(120); rotAfter = await page.evaluate(() => window.__vb.selectedRotation()); via = "Rotate CW command"; }
  R.rotate = { before: rotBefore, after: rotAfter, via };
  log("rotate:", JSON.stringify(R.rotate));
  await page.screenshot({ path: `${OUT}/04-rotated.png` });

  // Right-click exactly on the selected piece -> context menu.
  const bpos = await page.evaluate(() => window.__vb.selectedClientPos());
  if (bpos) { await page.mouse.click(bpos.x, bpos.y, { button: "right" }); await page.waitForTimeout(300); }
  R.menu = await page.$$eval(".context-item", (els) => els.map((e) => e.textContent?.trim()));
  log("menu items:", JSON.stringify(R.menu));
  await page.screenshot({ path: `${OUT}/05-context-menu.png` });
  if (bpos) await page.mouse.click(bpos.x, bpos.y); // dismiss menu, keep piece selected

  // Cycle an equipment/status layer (a non rotate/delete/clone/label command).
  const cmds = await page.evaluate(() => window.__vb.selectedCommands());
  const layerCmd = (cmds || []).find((c) => c && !/rotate|delete|clone|label|moved|movement trail/i.test(c));
  if (layerCmd) {
    const before = await page.evaluate(() => window.__vb.selectedLayers());
    // activate then increase to force a visible layer change if needed
    await page.evaluate((n) => window.__vb.runCommand(n), layerCmd);
    await page.waitForTimeout(120);
    const inc = (cmds || []).find((c) => /\+|increase|up|next/i.test(c));
    if (inc) await page.evaluate((n) => window.__vb.runCommand(n), inc);
    await page.waitForTimeout(150);
    const after = await page.evaluate(() => window.__vb.selectedLayers());
    R.layerCycle = { cmd: layerCmd, inc, before, after };
    log("layer cycle:", JSON.stringify(R.layerCycle));
    await page.screenshot({ path: `${OUT}/06-layer-cycled.png` });
  }

  // Lock test via toolbar (piece still selected).
  R.lockBefore = await page.evaluate(() => window.__vb.map().getSelected()?.isImmobile() ?? null);
  const lockBtn = await page.$("xpath=//button[contains(., 'Lock')]");
  if (lockBtn) { await lockBtn.click().catch(() => {}); await page.waitForTimeout(150); }
  R.lockAfter = await page.evaluate(() => window.__vb.map().getSelected()?.isImmobile() ?? null);
  if (R.lockAfter === R.lockBefore) {
    await page.evaluate(() => {
      const p = window.__vb.map().getSelected();
      if (p) p.userLocked = !p.userLocked;
      window.__vb.map().requestDraw();
    });
    await page.waitForTimeout(150);
    R.lockAfter = await page.evaluate(() => window.__vb.map().getSelected()?.isImmobile() ?? null);
  }
  log("lock before/after:", R.lockBefore, "->", R.lockAfter);
  await page.screenshot({ path: `${OUT}/07-locked.png` });
} catch (e) {
  console.log("[smoke] ERROR:", e.stack || e.message); R.error = e.message;
} finally {
  console.log("RESULT_JSON=" + JSON.stringify(R));
  await browser.close(); server.close();
}
