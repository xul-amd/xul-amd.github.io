import puppeteer from 'puppeteer';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// export.mjs [source.html] [cssWidth] [scale] [outName]  — defaults render the poster
const [src = 'index.html', width = 860, scale = 2, out = 'atssemble-poster'] = process.argv.slice(2);

const htmlPath = path.join(__dirname, src);
const fileUrl = 'file:///' + htmlPath.replace(/\\/g, '/');

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox']
});

const page = await browser.newPage();

// Render at the page's CSS width and scale it up (poster: 860x2 → 1720px wide;
// slide: 1280x1.5 → 1920x1080). Body height drives the capture height.
const CSS_W = Number(width);
const SCALE = Number(scale);
await page.setViewport({ width: CSS_W, height: 1200, deviceScaleFactor: SCALE });
await page.goto(fileUrl, { waitUntil: 'networkidle0', timeout: 15000 });

// Wait for Google Fonts to load (or timeout gracefully)
await new Promise(r => setTimeout(r, 2000));

// Get full page height and re-set viewport to capture everything
const bodyHeight = await page.evaluate(() => document.body.scrollHeight);
await page.setViewport({ width: CSS_W, height: bodyHeight, deviceScaleFactor: SCALE });
await page.goto(fileUrl, { waitUntil: 'networkidle0', timeout: 15000 });
await new Promise(r => setTimeout(r, 2000));

// --- JPG export ---
const jpgPath = path.join(__dirname, `${out}.jpg`);
await page.screenshot({
  path: jpgPath,
  type: 'jpeg',
  quality: 95,
  fullPage: true
});
console.log('JPG saved:', jpgPath);

// --- PDF export (match the rendered poster size, no reflow) ---
const pdfPath = path.join(__dirname, `${out}.pdf`);
const pdfHeight = await page.evaluate(() => document.body.scrollHeight);
await page.pdf({
  path: pdfPath,
  width: `${CSS_W}px`,
  height: `${pdfHeight}px`,
  printBackground: true,
  margin: { top: '0', right: '0', bottom: '0', left: '0' }
});
console.log('PDF saved:', pdfPath);

await browser.close();
console.log('Done.');
