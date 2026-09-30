// Normal view with the clock formed, then Full screen: audit every visible piece of text and screenshot each state.
import chromium from '@sparticuz/chromium'; import puppeteer from 'puppeteer-core';
import http from 'http'; import fs from 'fs'; import path from 'path';
const htmlPath = process.argv[2];
const threeDir = (process.env.THREE_DIR || './node_modules/three/build');
const server = http.createServer((req, res) => { const u = new URL(req.url, 'http://x');
  if (u.pathname === '/') { let html = fs.readFileSync(htmlPath, 'utf8').replace(/"three":\s*"[^"]*"/, '"three": "/three.module.js"').replace("document.getElementById('feed').addEventListener", "window.__habitat = habitat; document.getElementById('feed').addEventListener");
    res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end(html); }
  if (u.pathname === '/three.module.js') { res.writeHead(200, { 'Content-Type': 'text/javascript' }); return fs.createReadStream(path.join(threeDir, 'three.module.js')).pipe(res); }
  res.writeHead(404); res.end(); }).listen(0);
const browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), headless: 'shell', protocolTimeout: 240000,
  args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const open = async (url) => {
  const page = await browser.newPage(); const VW = +(process.env.VW || 960), VH = +(process.env.VH || 540), DPR = +(process.env.DPR || 1), MOB = process.env.MOBILE === '1';
  await page.setViewport({ width: VW, height: VH, deviceScaleFactor: DPR, isMobile: MOB, hasTouch: MOB });
  await page.evaluateOnNewDocument(() => { const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) => raf((t) => { if (window.__paused) { window.requestAnimationFrame(cb); return; } cb(t); }); });   // paused = keep the chain alive, skip the work
  await page.goto(url, { waitUntil: 'load', timeout: 120000 }); return page; };
const audit = (page) => page.evaluate(() => {
  const out = []; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n;
  while ((n = w.nextNode())) { const t = n.nodeValue.trim(); const el = n.parentElement; if (!t || !el || ['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(el.tagName)) continue;
    if (el.checkVisibility && !el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue; out.push(t.slice(0, 32)); }
  const vis = [...document.querySelectorAll('.fullui button')].filter((b) => b.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })).length;
  return { text: out, iconButtonsVisible: vis, bodyClass: document.body.className, fullscreenApi: !!(document.fullscreenElement || document.webkitFullscreenElement) };
});
const shot = async (page, name) => { await page.evaluate(() => { window.__paused = true; }); await new Promise((r) => setTimeout(r, 3500)); await page.screenshot({ path: name }); await page.evaluate(() => { window.__paused = false; }); };
const base = `http://localhost:${server.address().port}/`;
const page = await open(base + '#full');            // straight into the view, without the Fullscreen API
await new Promise((r) => setTimeout(r, 6000));
await page.evaluate(() => { document.getElementById('showtime').click(); window.__habitat.advance(14); });
await new Promise((r) => setTimeout(r, 3500));
await page.evaluate(() => { window.dispatchEvent(new Event('pointermove')); }); await new Promise((r) => setTimeout(r, 600));
console.log('#full, awake', JSON.stringify(await audit(page)));
await new Promise((r) => setTimeout(r, 3700));
console.log('#full, idle ', JSON.stringify(await audit(page)));
await shot(page, (process.env.OUT || 'full-clean2.png'));
const where = await page.evaluate(() => { const hb = window.__habitat, T = window.__THREE; let st = null; hb.scene.traverse((o) => { if (o.isMesh && o.geometry.type === 'CylinderGeometry' && o.geometry.parameters.height === 1.1) st = o; });
  return st ? { x: +st.position.x.toFixed(2), z: +st.position.z.toFixed(2) } : null; });
console.log('stone placed at', JSON.stringify(where));
await browser.close(); server.close();
