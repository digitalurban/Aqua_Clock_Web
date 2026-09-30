import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import http from 'http'; import fs from 'fs'; import path from 'path';
const htmlPath = process.argv[2];
const threeDir = (process.env.THREE_DIR || './node_modules/three/build');
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/') {
    let html = fs.readFileSync(htmlPath, 'utf8');
    html = html.replace(/"three":\s*"[^"]*"/, '"three": "/three.module.js"');
    html = html.replace("import * as THREE from 'three';", "import * as THREE from 'three'; window.__THREE = THREE;");
    html = html.replace("async function createRiverscape(", "window.__ground = groundHeight; async function createRiverscape(");
    html = html.replace("document.getElementById('feed').addEventListener", "window.__habitat = habitat; document.getElementById('feed').addEventListener");
    res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end(html);
  }
  if (u.pathname === '/three.module.js') { res.writeHead(200, { 'Content-Type': 'text/javascript' }); return fs.createReadStream(path.join(threeDir, 'three.module.js')).pipe(res); }
  res.writeHead(404); res.end();
}).listen(0);
const browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), headless: 'shell', protocolTimeout: 240000,
  args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 960, height: 540, deviceScaleFactor: 1 });
const logs = []; page.on('pageerror', (e) => logs.push(String(e).slice(0, 200)));
await page.evaluateOnNewDocument(() => {
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => raf((t) => {
    cb(t);
    if (window.__count) {      // count matching pixels in the same task the frame rendered in
      const cv = document.getElementById('scene'); const c2 = document.createElement('canvas'); c2.width = cv.width; c2.height = cv.height;
      const x = c2.getContext('2d'); x.drawImage(cv, 0, 0); const d = x.getImageData(0, 0, cv.width, cv.height).data;
      let n = 0, sx = 0, sy = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 200 && d[i + 1] < 70 && d[i + 2] > 200) { n++; const p = i / 4; sx += p % cv.width; sy += Math.floor(p / cv.width); }
      window.__result = { n, cx: n ? sx / n : 0, cy: n ? sy / n : 0 }; window.__count = false;
    }
  });
});
await page.goto(`http://localhost:${server.address().port}/?quality=lite`, { waitUntil: 'load', timeout: 120000 });
await new Promise((r) => setTimeout(r, 7000));
const res = await page.evaluate(async () => {
  const h = window.__habitat, T = window.__THREE, cv = document.getElementById('scene');
  let pm = null; h.scene.traverse((o) => { if (o.isInstancedMesh && o.geometry.parameters && o.geometry.parameters.radius === 0.05) pm = o; });
  if (!pm) return { error: 'no pellet mesh found' };
  const grab = () => new Promise((res) => { window.__result = null; window.__count = true; const t = setInterval(() => { if (window.__result) { clearInterval(t); res(window.__result); } }, 250); });
  pm.material = new T.MeshBasicMaterial({ color: 0xff00ff, fog: false });   // unmistakable
  h.feed(); h.advance(1.2);                                                    // food dropped, then a moment for it to sink into view
  const m = new T.Matrix4(), p = new T.Vector3(), pos = [];
  for (let i = 0; i < pm.count; i++) { pm.getMatrixAt(i, m); p.setFromMatrixPosition(m); const q = p.clone().project(h.camera); pos.push([+p.y.toFixed(1), +q.x.toFixed(2), +q.y.toFixed(2)]); }
  await new Promise((r) => setTimeout(r, 1500));
  const shot = await grab();
  const bs = pm.boundingSphere;
  const onScreen = pos.filter(([, x, y]) => Math.abs(x) < 1 && Math.abs(y) < 1).length;
  return { instances: pm.count, frustumCulled: pm.frustumCulled, boundingSphereRadius: bs ? +bs.radius.toFixed(2) : null, pelletsInFrustum: onScreen, magentaPixelsDrawn: shot.n, sampleY: pos.slice(0, 4) };
});
console.log(JSON.stringify(res, null, 1));
console.log('page errors:', logs.length ? logs.join(' | ') : 'none');
await browser.close(); server.close();
