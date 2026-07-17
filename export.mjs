import puppeteer from 'puppeteer';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.join(__dirname, 'index.html');
const fileUrl = 'file:///' + htmlPath.replace(/\\/g, '/');

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox']
});

const page = await browser.newPage();

// Render at page max-width (860px CSS), 2x scale → 1720px image
const CSS_W = 860;
const SCALE = 2;
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
const jpgPath = path.join(__dirname, 'atssemble-poster.jpg');
await page.screenshot({
  path: jpgPath,
  type: 'jpeg',
  quality: 95,
  fullPage: true
});
console.log('JPG saved:', jpgPath);

// --- PDF export (match the rendered poster size, no reflow) ---
const pdfPath = path.join(__dirname, 'atssemble-poster.pdf');
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
