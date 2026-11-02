// Auditoria visual: abre o index.html headless (como os testes) e fotografa todas as telas/estados
// em claro+escuro, pt+en, 1000px e 800px.  uso: node audit_shots.js <pastaSaida> [srcDir] [filtro]
const puppeteer = require('puppeteer-core'); const fs = require('fs'); const path = require('path');
const OUT = process.argv[2] || '/workspace/treino-app/shots/v13-audit';
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
  let p = await open(1000);
  if (await p.$eval('#modal', e => e.style.display === 'flex')) await p.c('[data-act=newsok]');
  for (let i = 0; i < 6; i++) { await p.c(`[data-act=vpick][data-v="${i % 4}"]`); await p.c('[data-act=vconfirm]'); await p.c('[data-act=next]'); }
  await p.c('[data-act=vmode][data-v=frase]');
  for (let i = 0; i < 3; i++) { const need = await p.evaluate('R.cur.need'); for (let k = 0; k < need; k++) await p.c(`[data-act=vpick][data-v="${k}"]`); await p.c('[data-act=vconfirm]'); await p.c('[data-act=next]'); }
  await p.c('[data-act=tab][data-v=quant]');
  for (let i = 0; i < 4; i++) { if (await p.has('#neans')) { await p.type('#neans', '3'); await p.c('[data-act=qne]'); } else { await p.c('[data-act=qpick][data-v="0"]'); await p.c('[data-act=qconfirm]'); } await p.c('[data-act=next]'); }
  await p.c('[data-act=tab][data-v=writing]');
  await p.evaluate(() => { const ta = document.querySelector('#essay'); ta.value = 'Some people believe that governments should fund the arts. In my view, public funding of the arts is justified because it preserves culture and gives access to people who could not otherwise afford it.\n\nFirst, ...'; ta.dispatchEvent(new Event('input')); });
  await p.$eval('#wscore', e => { e.value = '4'; }); await p.c('[data-act=wsave]');
  await p.c('[data-act=tab][data-v=speaking]'); if (await p.has('[data-act=slog]')) await p.c('[data-act=slog]');
  await p.c('[data-act=tab][data-v=prog]'); await p.evaluate(() => { const c = document.querySelector('[data-ms="0"]'); if (c) c.click(); }); await sleep(200);
  await p.evaluate('persist(true)'); await sleep(300); await p.close();
  const SEED = store;
  const shot = async (p, name, cfg, full = true) => { await sleep(120); await p.screenshot({ path: path.join(OUT, `${name}__${cfg}.png`), fullPage: full }); };
  const configs = [];
  for (const theme of ['light', 'dark']) for (const lang of ['pt', 'en']) for (const w of [1000, 800]) configs.push({ theme, lang, w });
  for (const c of configs) {
    const cfg = `${c.theme}-${c.lang}-${c.w}`; if (ONLY && !cfg.includes(ONLY)) continue;
    const s = JSON.parse(SEED); s.settings.theme = c.theme; s.settings.language = c.lang; s.ultimaVersaoVista = 'audit';
    store = JSON.stringify(s); p = await open(c.w, c.theme);
    const step = async (name, fn, full) => { try { await fn(); await shot(p, name, cfg, full); } catch (e) { errors.push(cfg + ' ' + name + ': ' + e.message); } };
    await step('01-vocab-def-pergunta', async () => { await p.c('[data-act=tab][data-v=vocab]'); await p.c('[data-act=vmode][data-v=def]'); if (await p.has('[data-act=next]')) await p.c('[data-act=next]'); await p.c('[data-act=vpick][data-v="1"]'); }, false);
    await step('02-vocab-def-feedback', async () => { await p.c('[data-act=vconfirm]'); }, false);
    await step('03-vocab-tcse-pergunta', async () => { await p.c('[data-act=vmode][data-v=frase]'); if (await p.has('[data-act=next]')) await p.c('[data-act=next]'); await p.c('[data-act=vpick][data-v="0"]'); }, false);
    await step('04-vocab-tcse-feedback', async () => { const need = await p.evaluate('R.cur.need'); for (let k = 1; k < need; k++) await p.c(`[data-act=vpick][data-v="${k}"]`); await p.c('[data-act=vconfirm]'); }, false);
    await step('05-vocab-revisar', async () => { await p.c('[data-act=vmode][data-v=revisao]'); }, false);
    await step('06-vocab-tabela-conjuntos', async () => { await p.c('[data-act=vmode][data-v=def]'); await p.$eval('#settable', e => e.scrollIntoView()); }, false);
    await step('07-vocab-pagina-inteira', async () => { await p.evaluate(() => window.scrollTo(0, 0)); }, true);
    await step('08-vocab-fim-rodada', async () => { await p.c('[data-act=vset][data-v="1"]'); await p.evaluate(() => { R.i = R.queue.length - 1; R.cur = R.makeQ(R.queue[R.i]); R.done = false; R.picked = []; render(); }); await p.c('[data-act=vpick][data-v="0"]'); await p.c('[data-act=vconfirm]'); await p.c('[data-act=next]'); }, false);
    await step('09-vocab-revisar-vazio', async () => { await p.evaluate(() => { Object.values(P.erros).forEach(e => e.pendente = false); delete SESS.revisao; }); await p.c('[data-act=vmode][data-v=revisao]'); }, false);
    for (const [t, n] of [['QC', '10'], ['MC', '11'], ['NE', '12']]) await step(`${n}-quant-${t}-pergunta`, async () => { await p.c('[data-act=tab][data-v=quant]'); await p.c(`[data-act=qtype][data-v=${t}]`); if (await p.has('[data-act=next]')) await p.c('[data-act=next]'); if (t !== 'NE') await p.c('[data-act=qpick][data-v="0"]'); else await p.type('#neans', '12'); }, false);
    await step('13-quant-feedback', async () => { await p.c('[data-act=qne]'); }, false);
    await step('14-quant-pagina-inteira', async () => { await p.c('[data-act=qtype][data-v=MC]'); }, true);
    await step('15-writing-issue', async () => { await p.c('[data-act=tab][data-v=writing]'); await p.c('[data-act=wtask][data-v=issue]'); }, true);
    await step('16-writing-email-timer', async () => { await p.c('[data-act=wtask][data-v=email]'); await p.c('[data-act=wstart]'); await p.type('#essay', 'Dear Ms. Lee,\n\nI am writing to'); }, false);
    await step('17-writing-discussao', async () => { await p.evaluate('T.stop()'); await p.c('[data-act=wtask][data-v=disc]'); }, false);
    await step('18-build-pergunta', async () => { await p.c('[data-act=wtask][data-v=build]'); await p.c('[data-act=bchip][data-v="0"]'); await p.c('[data-act=bchip][data-v="2"]'); }, false);
    await step('19-build-feedback', async () => { await p.c('[data-act=bcheck]'); }, false);
    await step('20-speaking-repeat', async () => { await p.c('[data-act=tab][data-v=speaking]'); await p.c('[data-act=stask][data-v=repeat]'); }, true);
    await step('21-speaking-interview', async () => { await p.c('[data-act=stask][data-v=interview]'); }, false);
    await step('22-progresso', async () => { await p.c('[data-act=tab][data-v=prog]'); }, true);
    await step('23-configuracoes', async () => { await p.c('#gear'); await sleep(200); }, true);
    await step('24-modal-novidades', async () => { await p.c('[data-act=novidades]'); }, false);
    await step('25-modal-importar', async () => { await p.c('[data-act=newsok]'); await p.c('[data-act=bimport]'); await sleep(200); }, false);
    await step('26-modal-zerar', async () => { await p.c('[data-act=mclose]'); await p.c('[data-act=breset]'); }, false);
    await step('27-modal-redacao', async () => { await p.c('[data-act=mclose]'); await p.c('[data-act=tab][data-v=writing]'); await p.c('[data-act=wtask][data-v=issue]'); await p.c('[data-act=eview]'); }, false);
    await p.close();
    const s2 = JSON.parse(SEED); s2.settings.theme = c.theme; s2.settings.language = c.lang; s2.ultimaVersaoVista = 'audit'; store = JSON.stringify(s2);
    p = await open(c.w, c.theme);
    await step('28-banner-continuar-sessao', async () => { await p.c('[data-act=tab][data-v=vocab]'); await p.c('[data-act=vmode][data-v=def]'); }, false);
    await p.close();
  }
  await b.close();
  console.log('shots:', fs.readdirSync(OUT).length, '| erros:', errors.length ? '\n' + errors.join('\n') : 'nenhum');
})().catch(e => { console.error('FALHA', e); process.exit(1); });
