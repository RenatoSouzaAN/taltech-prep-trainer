// v1.3.2: screenshots of the top bar in EN and PT and checks the app name fits without wrapping (1180px and 900px). usage: node tools/name_shots.js [outDir]
const puppeteer = require('puppeteer-core'); const fs = require('fs');
const path = require('path');
const SRC = path.join(__dirname, '..', 'src') + '/', OUT = (process.argv[2] || path.join(__dirname, '..', 'shots')) + '/'; require('fs').mkdirSync(OUT, { recursive: true });
const html = fs.readFileSync(SRC + 'index.html', 'utf8')
  .replace('/*__DATA__*/null', fs.readFileSync(SRC + 'data.json', 'utf8').replace(/<\//g, '<\\/'))
  .replace('/*__VER__*/"dev"', '"1.3.2"');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let store = '', titles = [], errors = [];
(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--font-render-hinting=none'] });
  const p = await b.newPage(); await p.setViewport({ width: 1180, height: 820, deviceScaleFactor: 2 });
  p.on('pageerror', e => errors.push(e.message)); p.on('dialog', d => d.accept());
  for (const [n, f] of Object.entries({ goLoadProgress: () => store, goSaveProgress: s => { store = s; return null; }, goBackupProgress: o => 'x', goCopyText: () => null,
    goDataFolder: () => 'C:\\Users\\user\\AppData\\Roaming\\TreinoTalTech', goOpenDataFolder: () => null,
    goDataInfo: () => ({ folder: 'C:\\Users\\user\\AppData\\Roaming\\TreinoTalTech', file: 'progresso.json', size: Buffer.byteLength(store), modified: new Date().toISOString(), exists: true }),
    goExportBackup: () => '', goImportBackup: () => null, goBackupNamed: () => '', goSetDarkTitle: () => null, goSetTitle: t => { titles.push(t); return null; } })) await p.exposeFunction(n, f);
  await p.setContent(html); await p.waitForFunction('window.__ready === true'); await sleep(200);
  await p.keyboard.press('Escape'); await sleep(150);
  const shot = async (lang, file) => {
    // troca pelo botão real de Configurações (como o usuário faz) e volta para o GRE Vocab
    await p.$eval('#gear', e => e.click()); await sleep(100); await p.$eval(`[data-act=lang][data-v=${lang}]`, e => e.click()); await sleep(400);
    await p.$eval('[data-act=tab][data-v=vocab]', e => e.click()); await sleep(200);
    const header = await p.$('header'); const bb = await header.boundingBox();
    await p.screenshot({ path: OUT + file, clip: { x: 0, y: 0, width: 1180, height: Math.ceil(bb.height) + 140 } });
    for (const w of [1180, 900]) { await p.setViewport({ width: w, height: 820, deviceScaleFactor: 2 }); await sleep(100);
      const r = await p.evaluate(() => { const h = document.querySelector('header'); return { brand: document.querySelector('#brand').textContent, h: h.getBoundingClientRect().height, over: h.scrollWidth > h.clientWidth }; });
      console.log(lang, w, JSON.stringify(r), 'title=' + titles[titles.length - 1]); }
    await p.setViewport({ width: 1180, height: 820, deviceScaleFactor: 2 }); await sleep(100);
  };
  await shot('en', 'v132-name-en.png'); await shot('pt', 'v132-name-pt.png');
  console.log('errors:', errors.length ? errors : 'none'); await b.close();
})();
