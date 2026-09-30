// Load the page as a phone (or desktop) at a given device pixel ratio, read the canvas back, and report
// whether the framebuffer is multisampled. Usage: node probe-dpr.mjs <html> <out.png> <W> <H> <DPR> [mobile]
import chromium from '@sparticuz/chromium'; import puppeteer from 'puppeteer-core';
import http from 'http'; import fs from 'fs'; import path from 'path';
const [htmlPath, outName, W, H, DPR, mobile] = process.argv.slice(2);
const threeDir = (process.env.THREE_DIR || './node_modules/three/build');
const server = http.createServer((req, res) => { const u = new URL(req.url, 'http://x');
  if (u.pathname === '/') { let html = fs.readFileSync(htmlPath, 'utf8').replace(/"three":\s*"[^"]*"/, '"three": "/three.module.js"');
    res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end(html); }
  if (u.pathname === '/three.module.js') { res.writeHead(200, { 'Content-Type': 'text/javascript' }); return fs.createReadStream(path.join(threeDir, 'three.module.js')).pipe(res); }
  res.writeHead(404); res.end(); }).listen(0);
const browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), headless: 'shell', protocolTimeout: 200000,
  args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: +W, height: +H, deviceScaleFactor: +DPR, isMobile: mobile === 'mobile', hasTouch: mobile === 'mobile' });
const logs = []; page.on('pageerror', (e) => logs.push(String(e).slice(0, 200)));
await page.evaluateOnNewDocument(() => {
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => raf((t) => { cb(t); if (window.__snap) { window.__snapData = document.getElementById('scene').toDataURL('image/png'); window.__snap = false; } });
});
await page.goto(`http://localhost:${server.address().port}/`, { waitUntil: 'load', timeout: 120000 });
await new Promise((r) => setTimeout(r, 7000));
const info = await page.evaluate(() => { const cv = document.getElementById('scene'); const gl = cv.getContext('webgl2');
  return { dpr: window.devicePixelRatio, css: [innerWidth, innerHeight], backing: [cv.width, cv.height], msaa: gl.getContextAttributes().antialias, samples: gl.getParameter(gl.SAMPLES),
           profile: document.getElementById('state')?.textContent, coarse: matchMedia('(pointer: coarse)').matches }; });
console.log(JSON.stringify(info));
await page.evaluate(() => { window.__snap = true; });
let data = null; for (let i = 0; i < 14 && !data; i++) { await new Promise((r) => setTimeout(r, 2500)); data = await page.evaluate(() => window.__snapData || null); }
if (data) fs.writeFileSync(outName, Buffer.from(data.split(',')[1], 'base64'));
console.log('captured:', !!data, '| page errors:', logs.length ? logs.join(' | ') : 'none');
await browser.close(); server.close();
