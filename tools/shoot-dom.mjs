// Screenshot the page INCLUDING its overlay text, with the clock formed. node shoot-dom.mjs <html> <out.png> <W> <H> <DPR> [mobile]
import chromium from '@sparticuz/chromium'; import puppeteer from 'puppeteer-core';
import http from 'http'; import fs from 'fs'; import path from 'path';
const [htmlPath, outName, W, H, DPR, mobile] = process.argv.slice(2);
const threeDir = (process.env.THREE_DIR || './node_modules/three/build');
const server = http.createServer((req, res) => { const u = new URL(req.url, 'http://x');
  if (u.pathname === '/') { let html = fs.readFileSync(htmlPath, 'utf8').replace(/"three":\s*"[^"]*"/, '"three": "/three.module.js"').replace("document.getElementById('feed').addEventListener", "window.__habitat = habitat; document.getElementById('feed').addEventListener");
    res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end(html); }
  if (u.pathname === '/three.module.js') { res.writeHead(200, { 'Content-Type': 'text/javascript' }); return fs.createReadStream(path.join(threeDir, 'three.module.js')).pipe(res); }
  res.writeHead(404); res.end(); }).listen(0);
const browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), headless: 'shell', protocolTimeout: 240000,
  args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: +W, height: +H, deviceScaleFactor: +DPR, isMobile: mobile === 'mobile', hasTouch: mobile === 'mobile' });
const logs = []; page.on('pageerror', (e) => logs.push(String(e).slice(0, 200)));
await page.evaluateOnNewDocument(() => { const raf = window.requestAnimationFrame.bind(window); window.requestAnimationFrame = (cb) => raf((t) => { if (window.__paused) return; cb(t); }); });
await page.goto(`http://localhost:${server.address().port}/`, { waitUntil: 'load', timeout: 120000 });
await new Promise((r) => setTimeout(r, 6000));
await page.click('#showtime'); await page.evaluate(() => window.__habitat.advance(14));
await new Promise((r) => setTimeout(r, 4000));
await page.evaluate(() => { window.__paused = true; }); await new Promise((r) => setTimeout(r, 4000));
await page.screenshot({ path: outName });
const info = await page.evaluate(() => ({ buttons: [...document.querySelectorAll('button, a')].map((e) => e.textContent.trim()).filter(Boolean), brandImg: !!document.querySelector('.brand img') }));
console.log(outName, '| controls on the page:', JSON.stringify(info.buttons), '| icon image present:', info.brandImg, '| errors:', logs.length ? logs.join(' | ') : 'none');
await browser.close(); server.close();
