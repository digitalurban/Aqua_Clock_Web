// Screenshot the REAL aquarium page in a real Chromium (WebGL2 via SwiftShader).
// node shoot-aqua.mjs <page.html> <out-name> [query] [waitSeconds] [clickShowTime:0|1] [w] [h]
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import http from 'http';
import fs from 'fs';
import path from 'path';

const [htmlPath, name, query = '', waitS = '20', clickTime = '0', W = '1280', H = '720'] = process.argv.slice(2);
const threeDir = (process.env.THREE_DIR || './node_modules/three/build');
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/') {
    // point the import map at the local three.js — the sandbox cannot reach the CDN
    let html = fs.readFileSync(htmlPath, 'utf8');
    html = html.replace(/"three":\s*"[^"]*"/, '"three": "/three.module.js"');
    res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end(html);
  }
  if (u.pathname === '/three.module.js') { res.writeHead(200, { 'Content-Type': 'text/javascript' }); return fs.createReadStream(path.join(threeDir, 'three.module.js')).pipe(res); }
  res.writeHead(404); res.end();
}).listen(0);
const port = server.address().port;

const browser = await puppeteer.launch({
  executablePath: await chromium.executablePath(), headless: 'shell',
  protocolTimeout: 240000,
  args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'],
});
const page = await browser.newPage();
await page.setViewport({ width: +W, height: +H, deviceScaleFactor: 1 });
const logs = [];
page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) logs.push(m.type() + ': ' + m.text().slice(0, 220)); });
page.on('pageerror', (e) => logs.push('PAGEERROR: ' + String(e).slice(0, 300)));
await page.evaluateOnNewDocument(() => {
  window.__frames = 0;
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => raf((t) => {
    if (window.__paused) return;
    window.__frames++;
    cb(t);
    if (window.__snap) {   // read the canvas in the same task the frame was rendered in
      window.__snapData = document.getElementById('scene').toDataURL('image/png');
      window.__snap = false; window.__paused = true;
    }
  });
});
await page.goto(`http://localhost:${port}/${query}`, { waitUntil: 'load', timeout: 120000 });
if (clickTime === '1') {
  await new Promise((r) => setTimeout(r, 3000));
  await page.click('#showtime').catch(() => {});
}
const t0 = Date.now();
await new Promise((r) => setTimeout(r, +waitS * 1000));
const frames = await page.evaluate(() => window.__frames);
const state = await page.evaluate(() => ({ boot: document.getElementById('boot')?.getAttribute('data-ready'), state: document.getElementById('state')?.textContent }));
console.log(name, '| frames rendered:', frames, 'in', ((Date.now() - t0) / 1000).toFixed(0), 's | boot ready:', state.boot, '| profile:', state.state);
await page.evaluate(() => { window.__snap = true; });
let data = null;
for (let i = 0; i < 12 && !data; i++) {
  await new Promise((r) => setTimeout(r, 3000));
  data = await page.evaluate(() => window.__snapData || null);
}
if (data) {
  fs.writeFileSync(`${name}.png`, Buffer.from(data.split(',')[1], 'base64'));
  console.log('captured via canvas readback');
} else {
  console.log('canvas readback never fired:', JSON.stringify(await page.evaluate(() => ({ frames: window.__frames, paused: window.__paused, snap: window.__snap }))));
  await page.evaluate(() => { window.__paused = true; });
  await new Promise((r) => setTimeout(r, 5000));
  await page.screenshot({ path: `${name}.png` });
  console.log('captured via compositor screenshot');
}
console.log('console problems:', logs.length ? '\n  ' + [...new Set(logs)].slice(0, 8).join('\n  ') : 'none');
await browser.close(); server.close();
