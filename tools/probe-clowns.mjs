// Sample the two clownfish every 1/30 s for 3 simulated minutes and report how they behave.
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import http from 'http'; import fs from 'fs'; import path from 'path';
const htmlPath = process.argv[2];
const feedTest = process.argv[3] === 'feed';
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
await page.setViewport({ width: 640, height: 360, deviceScaleFactor: 1 });
const logs = []; page.on('pageerror', (e) => logs.push(String(e).slice(0, 200)));
await page.goto(`http://localhost:${server.address().port}/?quality=lite`, { waitUntil: 'load', timeout: 120000 });
await new Promise((r) => setTimeout(r, 5000));
const rec = await page.evaluate((feedTest) => {
  const h = window.__habitat, T = window.__THREE;
  let cm = null; h.scene.traverse((o) => { if (o.isInstancedMesh && o.count === 2) cm = o; });
  const m = new T.Matrix4(), p = new T.Vector3(), q = new T.Quaternion(), s = new T.Vector3(), d = new T.Vector3();
  const rec = [[], []], events = [];
  for (let step = 0; step < 30 * 180; step++) {
    if (feedTest && (step === 30 * 20 || step === 30 * 60 || step === 30 * 100)) { h.feed(); events.push(step); }
    h.advance(1 / 30);
    for (let i = 0; i < 2; i++) { cm.getMatrixAt(i, m); m.decompose(p, q, s); d.set(1, 0, 0).applyQuaternion(q); rec[i].push([p.x, p.y, p.z, Math.atan2(-d.z, d.x), d.y]); }
  }
  return { rec, events };
}, feedTest);
const HOST = [-5.1, 1.6];
const wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
for (const [i, name] of [[0, 'female'], [1, 'male']]) {
  const r = rec.rec[i]; const dt = 1 / 30;
  let snaps = 0, tele = 0, maxYawRate = 0, near = 0, sp = [];
  let xmin = 1e9, xmax = -1e9, ymin = 1e9, ymax = -1e9, zmin = 1e9, zmax = -1e9, flips = 0;
  for (let k = 1; k < r.length; k++) {
    const dx = r[k][0] - r[k - 1][0], dy = r[k][1] - r[k - 1][1], dz = r[k][2] - r[k - 1][2];
    const step = Math.hypot(dx, dy, dz); sp.push(step / dt);
    if (step > 0.35) tele++;
    const dyaw = Math.abs(wrap(r[k][3] - r[k - 1][3])); if (dyaw / dt > maxYawRate) maxYawRate = dyaw / dt;
    if (dyaw > 0.6) snaps++;
    if (Math.cos(r[k][3]) * Math.cos(r[k - 1][3]) < 0 && dyaw > 1.2) flips++;
    if (Math.hypot(r[k][0] - HOST[0], r[k][2] - HOST[1]) < 4.4) near++;
    xmin = Math.min(xmin, r[k][0]); xmax = Math.max(xmax, r[k][0]); ymin = Math.min(ymin, r[k][1]); ymax = Math.max(ymax, r[k][1]); zmin = Math.min(zmin, r[k][2]); zmax = Math.max(zmax, r[k][2]);
  }
  sp.sort((a, b) => a - b); const pc = (q) => sp[Math.floor(q * (sp.length - 1))];
  const idle = sp.filter((v) => v < 0.15).length / sp.length;
  console.log(`${name.padEnd(6)} | teleports (>0.35 u in one step): ${String(tele).padStart(2)} | instant turns (>0.6 rad in one step): ${String(snaps).padStart(3)} | 180-degree snaps: ${String(flips).padStart(3)} | peak turn rate ${maxYawRate.toFixed(1)} rad/s`);
  console.log(`       speed u/s  median ${pc(0.5).toFixed(2)}  p90 ${pc(0.9).toFixed(2)}  max ${pc(1).toFixed(2)} | still <0.15 u/s: ${(idle * 100).toFixed(0)}% of the time | within 4.4 of the anemone: ${(near / r.length * 100).toFixed(0)}%`);
  console.log(`       range  x ${xmin.toFixed(1)}..${xmax.toFixed(1)}   y ${ymin.toFixed(1)}..${ymax.toFixed(1)}   z ${zmin.toFixed(1)}..${zmax.toFixed(1)}`);
}
if (feedTest) {
  // did they go for the food? distance to the pellet drop zone (x 0, y 8.9) in the 6 s after feeding
  for (const [i, name] of [[0, 'female'], [1, 'male']]) {
    const seg = rec.rec[i].slice(30 * 20, 30 * 27); const top = Math.max(...seg.map((v) => v[1]));
    console.log(`${name.padEnd(6)} highest point in the 7 s after feeding: y ${top.toFixed(1)}  (pellets drop from y ~9, surface 10)`);
  }
}
const ate = await page.evaluate(() => window.__habitat.debug.clowns.map((c) => c.ate));
if (feedTest) console.log('pellets eaten: female', ate[0], '| male', ate[1], '(over three feedings of 14, shared with 84 neons)');
console.log('page errors:', logs.length ? logs.join(' | ') : 'none');
await browser.close(); server.close();
