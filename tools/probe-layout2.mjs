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
await page.evaluate(() => {
  const h = window.__habitat, T = window.__THREE; window.__objs = []; 
  h.scene.traverse((o) => {
    if (o.material && o.material.customProgramCacheKey && o.material.customProgramCacheKey() === 'airstone') window.__stone = o;
    if (o.material && o.material.uniforms && o.material.uniforms.uPxScale) o.visible = false;   // bubbles off: probing the stone
    if (o.isMesh || o.isPoints) window.__objs.push(o);
  });
  window.__stoneMat = window.__stone.material;
  window.__magenta = new T.MeshBasicMaterial({ color: 0xff00ff, fog: false });
  window.__stone.material = window.__magenta;
  window.__grab = () => new Promise((res) => { window.__result = null; window.__count = true; const t = setInterval(() => { if (window.__result) { clearInterval(t); res(window.__result); } }, 250); });
});
const sizes = [['16:9 960x540', 960, 540], ['4:3 1024x768', 1024, 768], ['16:10 1280x800', 1280, 800]];
console.log('screen                         stone at (x%, y%)   digits reach (right edge %)   stone clear of digits by');
for (const [name, w, h] of sizes) {
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
  await new Promise((r) => setTimeout(r, 2500));
  const m = await page.evaluate(() => {
    const hb = window.__habitat, T = window.__THREE, cam = hb.camera, cv = document.getElementById('scene');
    hb.showTime(); hb.advance(14);
    let stone = null, shoal = null;
    hb.scene.traverse((o) => { if (o.isMesh && o.geometry.type === 'CylinderGeometry' && o.geometry.parameters.height === 1.1) stone = o; if (o.isInstancedMesh && o.count === 84) shoal = o; });
    const sp = stone.position.clone().project(cam);
    const mat = new T.Matrix4(), v = new T.Vector3(); let right = -1, left = 2, n = 0;
    for (let i = 0; i < shoal.count; i++) { shoal.getMatrixAt(i, mat); v.setFromMatrixPosition(mat); if (Math.abs(v.z - 1.2) > 0.15) continue; n++;   // stationed fish sit on the digit plane
      const q = v.clone().project(cam); right = Math.max(right, q.x * 0.5 + 0.5); left = Math.min(left, q.x * 0.5 + 0.5); }
    return { aspect: cam.aspect, canvas: [cv.width, cv.height], stone: [sp.x * 0.5 + 0.5, 1 - (sp.y * 0.5 + 0.5)], stoneWorldX: stone.position.x, stoneZ: stone.position.z, right, left, n, fov: cam.fov };
  });
  const gap = (m.stone[0] - m.right) * w;
  console.log(`   [aspect ${m.aspect.toFixed(3)}, canvas ${m.canvas.join('x')}, stone z ${m.stoneZ.toFixed(1)}]`);
  console.log(`${name.padEnd(28)}  (${(m.stone[0] * 100).toFixed(0).padStart(3)}%, ${(m.stone[1] * 100).toFixed(0).padStart(3)}%)   x=${m.stoneWorldX.toFixed(1)} world     ${(m.right * 100).toFixed(0).padStart(3)}%  (${m.n} fish on digits)   ${gap >= 0 ? '+' : ''}${gap.toFixed(0)} px`);
}
await browser.close(); server.close();
