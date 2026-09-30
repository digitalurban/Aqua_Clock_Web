import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import http from 'http'; import fs from 'fs'; import path from 'path';
const htmlPath = process.argv[2], outName = process.argv[3];
const threeDir = (process.env.THREE_DIR || './node_modules/three/build');
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/') {
    let html = fs.readFileSync(htmlPath, 'utf8');
    html = html.replace(/"three":\s*"[^"]*"/, '"three": "/three.module.js"');
    html = html.replace("import * as THREE from 'three';", "import * as THREE from 'three'; window.__THREE = THREE;");
    html = html.replace("document.getElementById('feed').addEventListener", "window.__habitat = habitat; document.getElementById('feed').addEventListener");
    res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end(html);
  }
  if (u.pathname === '/three.module.js') { res.writeHead(200, { 'Content-Type': 'text/javascript' }); return fs.createReadStream(path.join(threeDir, 'three.module.js')).pipe(res); }
  res.writeHead(404); res.end();
}).listen(0);
const browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), headless: 'shell', protocolTimeout: 240000,
  args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const page = await browser.newPage();
const VW = +(process.env.VW || 1280), VH = +(process.env.VH || 720);
await page.setViewport({ width: VW, height: VH, deviceScaleFactor: 1 });
const logs = []; page.on('pageerror', (e) => logs.push(String(e).slice(0, 200)));
await page.evaluateOnNewDocument(() => {
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => raf((t) => {
    cb(t);
    if (window.__snap) { window.__snapData = document.getElementById('scene').toDataURL('image/jpeg', 0.9); window.__snap = false; }
  });
});
await page.goto(`http://localhost:${server.address().port}/?quality=lite`, { waitUntil: 'load', timeout: 120000 });
await new Promise((r) => setTimeout(r, 6000));
await page.click('#showtime');
const clockTime = await page.evaluate(() => new Date().toTimeString().slice(0, 5));
// run the simulation forward 14 s without drawing, then read where the shoal actually is
const fish = await page.evaluate(() => {
  const h = window.__habitat, T = window.__THREE;
  h.advance(14);
  let shoal = null; h.scene.traverse((o) => { if (o.isInstancedMesh && o.count === 84) shoal = o; });
  const m = new T.Matrix4(), v = new T.Vector3(), out = [];
  for (let i = 0; i < shoal.count; i++) { shoal.getMatrixAt(i, m); v.setFromMatrixPosition(m).project(h.camera); out.push([(v.x * 0.5 + 0.5) * window.innerWidth, (1 - (v.y * 0.5 + 0.5)) * window.innerHeight]); }
  return out;
});
console.log('page clock reads', clockTime, '| neons projected:', fish.length);
const xs = fish.map((f) => f[0]), ys = fish.map((f) => f[1]);
const on = fish.filter(([x, y]) => x >= 0 && x <= VW && y >= 0 && y <= VH);
const cx0 = Math.min(...on.map((f) => f[0])), cx1 = Math.max(...on.map((f) => f[0])), cy0 = Math.min(...on.map((f) => f[1])), cy1 = Math.max(...on.map((f) => f[1]));
console.log(`viewport ${VW}x${VH} | fish on screen: ${on.length}/84 | shoal spans x ${cx0.toFixed(0)}..${cx1.toFixed(0)} (${((cx1 - cx0) / VW * 100).toFixed(0)}% of width), y ${cy0.toFixed(0)}..${cy1.toFixed(0)} (${((cy1 - cy0) / VH * 100).toFixed(0)}% of height)`);
// then a real frame, so there is something to look at
await page.evaluate(() => { window.__snap = true; });
let data = null; for (let i = 0; i < 12 && !data; i++) { await new Promise((r) => setTimeout(r, 2500)); data = await page.evaluate(() => window.__snapData || null); }
if (data) { fs.writeFileSync(outName, Buffer.from(data.split(',')[1], 'base64')); console.log('frame saved', outName); }
console.log('page errors:', logs.length ? logs.join(' | ') : 'none');
await browser.close(); server.close();
