#!/usr/bin/env node
// Renders the animated scenes with Playwright.
//   node render.js stills            -> out/stills/<scene>-<n>.png (approval frames)
//   node render.js frames [from to]  -> out/frames/f%05d.jpg for global seconds [from, to)
//   node render.js overlay from to   -> out/overlay/f%05d.png (transparent captions/labels)
//   node render.js srt               -> out/fiskalbridge.srt
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");
const { TIMELINE, resolve } = require("./timeline.js");

const R = resolve(TIMELINE);
const OUT = path.join(__dirname, "out");
const url = "file://" + path.join(__dirname, "index.html");

// Stills: nominal-independent fractions of each scene.
const STILLS = {
  title: [0.95],
  rule: [0.3, 0.45, 0.97],
  normal: [0.3, 0.52, 0.72, 0.95],
  gap: [0.3, 0.72, 0.95],
  solution: [0.42, 0.72, 0.97],
  outro: [0.5, 0.95],
};

async function newPage(browser, transparent) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => console.error("PAGE ERROR", e.message));
  await page.goto(url);
  await page.evaluate(() => window.ready);
  if (!transparent) await page.addStyleTag({ content: "body{background:#ecfdf5}" });
  return page;
}

function srtTime(s) {
  const ms = Math.round(s * 1000);
  const p = (n, l = 2) => String(n).padStart(l, "0");
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
}

(async () => {
  const [mode, a, b] = process.argv.slice(2);
  fs.mkdirSync(OUT, { recursive: true });
  if (mode === "srt") {
    const srt = R.captions.map((c, i) => `${i + 1}\n${srtTime(c.start)} --> ${srtTime(c.end)}\n${c.text}\n`).join("\n");
    fs.writeFileSync(path.join(OUT, "fiskalbridge.srt"), srt);
    console.log(`srt: ${R.captions.length} captions, total ${R.total}s`);
    return;
  }
  const browser = await chromium.launch();
  if (mode === "stills") {
    const dir = path.join(OUT, "stills");
    fs.mkdirSync(dir, { recursive: true });
    const page = await newPage(browser, false);
    for (const s of R.scenes) {
      const fr = STILLS[s.id] || [];
      for (let i = 0; i < fr.length; i++) {
        await page.evaluate((T) => window.renderAt(T), s.start + s.dur * fr[i]);
        await page.screenshot({ path: path.join(dir, `${s.id}-${i + 1}.png`) });
      }
    }
  } else if (mode === "frames" || mode === "overlay") {
    const overlay = mode === "overlay";
    const from = a ? parseFloat(a) : 0, to = b ? parseFloat(b) : R.total;
    const dir = path.join(OUT, overlay ? "overlay" : "frames");
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    const fps = TIMELINE.fps;
    const n = Math.round((to - from) * fps);
    const workers = 4;
    let next = 0;
    await Promise.all(
      Array.from({ length: workers }, async () => {
        const page = await newPage(browser, overlay);
        for (;;) {
          const i = next++;
          if (i >= n) break;
          await page.evaluate(([T, o]) => window.renderAt(T, o), [from + (i + 0.5) / fps, { overlay }]);
          const file = path.join(dir, `f${String(i).padStart(5, "0")}.${overlay ? "png" : "jpg"}`);
          await page.screenshot(overlay ? { path: file, omitBackground: true } : { path: file, type: "jpeg", quality: 96 });
          if (i % 300 === 0) console.log(`${mode} ${i}/${n}`);
        }
      })
    );
  } else {
    console.error("usage: node render.js stills|frames|overlay|srt");
    process.exitCode = 1;
  }
  await browser.close();
})();
