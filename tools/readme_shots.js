// README screenshots and hero window captures for the current version, in English and Portuguese.
// usage: node tools/readme_shots.js [outDir]   (writes outDir/en/*.png, outDir/pt/*.png and outDir/hero-*.png)
const puppeteer = require('puppeteer-core'); const fs = require('fs'); const path = require('path');
const SRC = path.join(__dirname, '..', 'src') + '/';
const OUT = process.argv[2] || path.join(__dirname, '..', 'shots', 'readme');
const VER = (fs.readFileSync(SRC + 'main.go', 'utf8').match(/appVersion\s*=\s*"([^"]+)"/) || [])[1] || 'dev';
const html = fs.readFileSync(SRC + 'index.html', 'utf8')
  .replace('/*__DATA__*/null', fs.readFileSync(SRC + 'data.json', 'utf8').replace(/<\//g, '<\\/'))
  .replace('/*__VER__*/"dev"', JSON.stringify(VER));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const FOLDER = 'C:\\Users\\user\\AppData\\Roaming\\TreinoTalTech';
const VOICES = [{ name: 'Microsoft Zira - English (United States)', lang: 'en-US', localService: true }];
const ESSAY = 'Scientific research should prioritize practical applications that directly benefit society. When governments and institutions fund research, they have a responsibility to ensure that the outcomes can improve people\'s lives in tangible ways.\n\nFirst, practical research leads to immediate improvements in quality of life. Medical research that develops new treatments, agricultural studies that increase food production, and engineering projects that create sustainable infrastructure all have clear, measurable benefits. These outcomes justify the investment of public resources.\n\nMoreover, purely theoretical research, while valuable, can often be pursued through private funding or academic institutions without requiring taxpayer support. The limited public funds available for research should be directed toward projects with clear societal benefits.';
let store = '', errors = [];
(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--font-render-hinting=none'] });
  async function open(w, h, dpr, scheme, seed) {
    const p = await b.newPage(); await p.setViewport({ width: w, height: h, deviceScaleFactor: dpr });
    p.on('pageerror', e => errors.push(e.message)); p.on('dialog', d => d.accept());
    for (const [n, f] of Object.entries({ goLoadProgress: () => store, goSaveProgress: s => { store = s; return null; }, goBackupProgress: o => 'progresso-v' + o + '.bak', goCopyText: () => null,
      goDataFolder: () => FOLDER, goOpenDataFolder: () => null,
      goDataInfo: () => ({ folder: FOLDER, file: 'progresso.json', size: Buffer.byteLength(store), modified: new Date().toISOString(), exists: true }),
      goExportBackup: (c, n) => 'C:\\Users\\user\\Documents\\' + n, goImportBackup: () => null, goBackupNamed: t => 'progresso-' + t + '.bak', goSetDarkTitle: () => null, goSetTitle: () => null })) await p.exposeFunction(n, f);
    await p.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: scheme }]);
    // deterministic shuffles (seeded Math.random) and a stub English voice
    const stub = `<script>(function(vs,s){Math.random=function(){s|=0;s=s+0x6D2B79F5|0;var t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};window.SpeechSynthesisUtterance=function(t){this.text=t;};var ss={speaking:false,getVoices:function(){return vs.slice();},speak:function(){},cancel:function(){},addEventListener:function(){},removeEventListener:function(){}};Object.defineProperty(window,'speechSynthesis',{value:ss,configurable:true});})(${JSON.stringify(VOICES)},${seed});</` + `script>`;
    await p.setContent(html.replace('<head>', '<head>' + stub)); await p.waitForFunction('window.__ready === true'); await sleep(150);
    p.c = async sel => { await p.$eval(sel, e => e.click()); await sleep(60); };
    p.has = async sel => !!(await p.$(sel));
    p.pick = async ok => { const i = await p.evaluate(ok => { const c = R.cur; const k = c.options.findIndex(o => c.answers.includes(o)); return ok ? k : (k + 1) % c.options.length; }, ok); await p.c(`[data-act=vpick][data-v="${i}"]`); };
    return p;
  }
  // 1) seed a realistic progress file: 15/21 definitions, 3/5 TC/SE sentences
  let p = await open(1100, 900, 1, 'light', 7);
  if (await p.has('#modal') && await p.$eval('#modal', e => e.style.display === 'flex')) await p.c('[data-act=newsok]');
  await p.c('[data-act=tab][data-v=vocab]'); await p.c('[data-act=vmode][data-v=def]');
  for (let i = 0; i < 21; i++) { await p.pick(![2, 6, 9, 13, 16, 19].includes(i)); await p.c('[data-act=vconfirm]'); await p.c('[data-act=next]'); }
  await p.c('[data-act=vmode][data-v=frase]');
  for (let i = 0; i < 5; i++) { const ok = i !== 1 && i !== 3; const c = await p.evaluate(() => ({ o: R.cur.options, a: R.cur.answers }));
    const idx = ok ? c.a.map(x => c.o.indexOf(x)) : c.o.map((x, k) => k).filter(k => !c.a.includes(c.o[k])).slice(0, c.a.length);
    for (const k of idx) await p.c(`[data-act=vpick][data-v="${k}"]`); await p.c('[data-act=vconfirm]'); await p.c('[data-act=next]'); }
  await p.evaluate(() => { for (const k of Object.keys(SESS)) delete SESS[k]; persist(true); }); await sleep(300); await p.close();
  const SEED = store;
  // wait until the top bar shows "saved hh:mm:ss" instead of the transient "saving..."
  const settle = async p => { await sleep(150); await p.evaluate(() => flushSave()); await p.waitForFunction(() => !/salvando|saving/.test(document.querySelector('#savest').textContent), { timeout: 5000 }).catch(() => errors.push('still saving')); await sleep(150); };
  const fresh = (lang, theme) => { const s = JSON.parse(SEED); s.settings.theme = theme; s.settings.language = lang; s.ultimaVersaoVista = VER; delete s.sessoes; store = JSON.stringify(s); };
  const vocabTop = async p => { await p.c('[data-act=tab][data-v=vocab]'); await p.c('[data-act=vmode][data-v=def]'); await p.c('[data-act=vset][data-v=all]').catch(() => {}); await p.evaluate(() => window.scrollTo(0, 0)); };
  for (const lang of ['en', 'pt']) {
    const dir = path.join(OUT, lang); fs.mkdirSync(dir, { recursive: true });
    const shot = async (p, name) => { await settle(p); await p.screenshot({ path: path.join(dir, name) }); };
    fresh(lang, 'light'); p = await open(1100, 900, 1, 'light', 42);
    await vocabTop(p); await shot(p, '01-vocab-question.png');
    await p.pick(false); await p.c('[data-act=vconfirm]'); await shot(p, '02-vocab-feedback.png');
    await p.c('[data-act=next]'); await p.c('[data-act=next]').catch(() => {}); await shot(p, '03-vocab-sets.png');
    await p.c('[data-act=tab][data-v=quant]'); await p.c('[data-act=qtype][data-v=QC]'); await shot(p, '04-gre-quant.png');
    await p.c('[data-act=tab][data-v=writing]'); await p.c('[data-act=wtask][data-v=issue]'); await p.c('[data-act=wstart]');
    await p.evaluate(t => { const ta = document.querySelector('#essay'); ta.value = t; ta.dispatchEvent(new Event('input')); ta.focus(); ta.setSelectionRange(t.length, t.length); }, ESSAY);
    await sleep(1100); await shot(p, '05-writing-timer.png'); await p.evaluate('T.stop()');
    await p.c('[data-act=tab][data-v=speaking]'); await p.c('[data-act=stask][data-v=repeat]'); await shot(p, '06-speaking.png');
    await p.c('[data-act=tab][data-v=prog]'); await shot(p, '07-progress.png');
    await p.close();
    fresh(lang, 'dark'); p = await open(1100, 900, 1, 'dark', 42); await p.c('#gear'); await sleep(250); await shot(p, '08-settings-dark.png'); await p.close();
    // hero window captures at 2x: light front window (question card) and dark back window
    for (const theme of ['light', 'dark']) { fresh(lang, theme); p = await open(860, 640, 2, theme, 42); await vocabTop(p); await settle(p);
      await p.screenshot({ path: path.join(OUT, `hero-${lang}-${theme}.png`) }); await p.close(); }
  }
  await b.close();
  console.log('version', VER, '| errors:', errors.length ? errors : 'none');
})().catch(e => { console.error('FAILED', e); process.exit(1); });
