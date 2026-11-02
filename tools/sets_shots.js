// Auditoria visual: abre o index.html headless (como os testes) e fotografa todas as telas/estados
// em claro+escuro, pt+en, 1000px e 800px.  uso: node audit_shots.js <pastaSaida> [srcDir] [filtro]
const puppeteer = require('puppeteer-core'); const fs = require('fs'); const path = require('path');
const OUT = process.argv[2] || '/workspace/treino-app/shots';
const SRC = (process.argv[3] || '/workspace/treino-app/src') + '/';
const ONLY = process.argv[4] || '';
const html = fs.readFileSync(SRC + 'index.html', 'utf8')
  .replace('/*__DATA__*/null', fs.readFileSync(SRC + 'data.json', 'utf8').replace(/<\//g, '<\\/'))
  .replace('/*__VER__*/"dev"', '"audit"');
fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let store = '', errors = [];
const VOICES = [{ name: 'Microsoft Zira - English (United States)', lang: 'en-US', localService: true }];
(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--font-render-hinting=none'] });
  async function open(width, scheme) {
    const p = await b.newPage(); await p.setViewport({ width, height: 860 });
    p.on('pageerror', e => errors.push(e.message)); p.on('dialog', d => d.accept());
    await p.exposeFunction('goLoadProgress', () => store);
    await p.exposeFunction('goSaveProgress', s => { store = s; return null; });
    await p.exposeFunction('goBackupProgress', o => 'progresso-v' + o + '.bak');
    await p.exposeFunction('goCopyText', () => null);
    await p.exposeFunction('goDataFolder', () => 'C:\\Users\\user\\AppData\\Roaming\\TreinoTalTech');
    await p.exposeFunction('goOpenDataFolder', () => null);
    await p.exposeFunction('goDataInfo', () => ({ folder: 'C:\\Users\\user\\AppData\\Roaming\\TreinoTalTech', file: 'progresso.json', size: Buffer.byteLength(store), modified: new Date().toISOString(), exists: true }));
    await p.exposeFunction('goExportBackup', (c, n) => 'C:\\Users\\user\\Documents\\' + n);
    await p.exposeFunction('goImportBackup', () => ({ name: 'backup-treino.json', content: store }));
    await p.exposeFunction('goBackupNamed', t => 'progresso-' + t + '.bak');
    await p.exposeFunction('goSetDarkTitle', () => null);
    await p.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: scheme || 'light' }]);
    const stub = `<script>(function(vs){window.SpeechSynthesisUtterance=function(t){this.text=t;};var ss={speaking:false,getVoices:function(){return vs.slice();},speak:function(){},cancel:function(){},addEventListener:function(){},removeEventListener:function(){}};Object.defineProperty(window,'speechSynthesis',{value:ss,configurable:true});})(${JSON.stringify(VOICES)});</` + `script>`;
    await p.setContent(html.replace('<head>', '<head>' + stub)); await p.waitForFunction('window.__ready === true'); await sleep(120);
    p.c = async sel => { await p.$eval(sel, e => e.click()); await sleep(50); };
    p.has = async sel => !!(await p.$(sel));
    return p;
  }

  const MEASURE = `(() => {
    const lines = el => { const r = document.createRange(); r.selectNodeContents(el); const tops = new Set([...r.getClientRects()].filter(q => q.width > 0.5).map(q => Math.round(q.top))); return tops.size; };
    const sel = '#settable .snm, #settable .srng, #settable .sseen, #settable .slbl, #settable .sval, #settable .sact .btn';
    const bad = [...document.querySelectorAll(sel)].filter(e => e.offsetParent && lines(e) > 1).map(e => e.className + ':' + e.innerText.slice(0, 30));
    [...document.querySelectorAll('#settable .pend:not(.open)')].forEach(e => { const t = [...e.children].filter(c => c.offsetParent).map(c => c.getBoundingClientRect().top); if (t.length && Math.max(...t) - Math.min(...t) > 3) bad.push('pend:' + e.innerText); });
    const cut = [...document.querySelectorAll('#settable .snm, #settable .srng, #settable .sseen, #settable .slbl, #settable .sval')].filter(e => e.scrollWidth > e.clientWidth + 1).map(e => e.className + ':' + e.innerText);
    const hs = [...document.querySelectorAll('#settable .srow')].map(e => Math.round(e.getBoundingClientRect().height));
    const over = [...document.querySelectorAll('#settable .srow')].filter(r => r.scrollWidth > r.clientWidth + 1).length;
    const chips = [...document.querySelectorAll('#settable .srow')].map(r => [...r.querySelectorAll('.chip')].filter(c => c.offsetParent).length + '/' + r.querySelectorAll('.chip').length + (r.querySelector('.more:not([hidden])') ? '(' + r.querySelector('.more').textContent + ')' : ''));
    return { bad, cut, hs, over, chips };
  })()`;
  let report = [];
  for (const theme of ['light', 'dark']) for (const lang of ['pt', 'en']) for (const w of [1000, 800]) {
    const s = { schemaVersion: 4, appVersion: '1.3.1', ultimaVersaoVista: '9.9', criado: '2026-10-20T12:00:00.000Z', settings: { theme, language: lang },
      historico: [], rodadas: [], redacoes: [], falas: [], rascunhos: {}, erros: {}, marcos: {}, sessoes: {} };
    store = JSON.stringify(s);
    const p = await open(w, theme);
    if (await p.$eval('#modal', e => e.style.display === 'flex')) await p.c('[data-act=newsok]');
    await p.evaluate(() => {
      const by = n => DATA.vocab.filter(v => v.set === n).map(v => v.word);
      const add = (mod, set, ok, palavra) => P.historico.push({ t: now(), mod, id: 'x', set, ok, palavra });
      by(1).slice(0, 3).forEach((w, i) => add('vocab', 1, i === 0, w)); add('vocab', 1, false, by(1)[0]);
      by(2).slice(0, 4).forEach((w, i) => add('vocab', 2, i % 2 === 0, w)); add('frases', 2, false); add('frases', 2, true); add('frases', 2, false);
      by(3).slice(0, 2).forEach((w, i) => add('vocab', 3, true, w)); add('frases', 3, false); add('frases', 3, false);
      add('vocab', 4, true, by(4)[0]); add('frases', 4, true);
      [by(1)[0], by(1)[1], by(1)[4], by(2)[1], by(2)[3], by(2)[6], by(2)[8], by(3)[5]].forEach(w => P.erros[w] = { n: 1, pendente: true });
      TAB = 'vocab'; render();
    });
    await sleep(150);
    const m = await p.evaluate(MEASURE);
    report.push(`${theme}-${lang}-${w}: wraps=${JSON.stringify(m.bad)} cut=${JSON.stringify(m.cut)} heights=${m.hs} overflowRows=${m.over} chips=${m.chips.join(' ')}`);
    const clip = await p.$eval('#settable', e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y + window.scrollY, width: r.width, height: r.height }; });
    await p.screenshot({ path: path.join(OUT, `v131-sets-${theme}-${lang}-${w}.png`), clip, captureBeyondViewport: true });
    if (theme === 'light' && w === 1000) { await p.c('[data-act=pmore][data-v="2"]'); await sleep(100);
      const clip2 = await p.$eval('#settable', e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y + window.scrollY, width: r.width, height: r.height }; });
      await p.screenshot({ path: path.join(OUT, `v131-sets-expanded-${lang}.png`), clip: clip2, captureBeyondViewport: true }); }
    await p.close();
  }
  console.log(report.join('\n')); console.log('erros JS:', errors.length ? errors.join(' | ') : 'nenhum');
  await b.close();
})().catch(e => { console.error('FALHA', e); process.exit(1); });
