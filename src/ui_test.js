// Teste headless v1.3.1: lista de conjuntos redesenhada (sem quebras, +N); v1.3: cabeçalho novo das questões; v1.2.1: sessões por modo (trocar de aba não zera), retomar após reabrir, filtros, migração schema 3→4; confirmação, migração (v1.0 e v1.1), tema, idioma, exportar/importar, zerar
const puppeteer = require('puppeteer-core'); const fs = require('fs');
const path = require('path');
const SRC = path.join(__dirname);
const html = fs.readFileSync(path.join(SRC, 'index.html'), 'utf8')
  .replace('/*__DATA__*/null', fs.readFileSync(path.join(SRC, 'data.json'), 'utf8').replace(/<\//g, '<\\/'))
  .replace('/*__VER__*/"dev"', '"1.3.1"');
const D = JSON.parse(fs.readFileSync(path.join(SRC, 'data.json')));
let store = '', backups = [], named = [], exported = null, importFile = null, darkTitle = [], savedAt = null, errors = [], pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) pass++; else { fail++; console.log('  FALHOU:', msg); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
  const VOICES_DEF = [{ name: 'Microsoft George - English (United Kingdom)', lang: 'en-GB', localService: true }, { name: 'Microsoft Zira - English (United States)', lang: 'en-US', localService: true }, { name: 'Microsoft Maria - Portuguese (Brazil)', lang: 'pt-BR', localService: true }];
  async function open(scheme, voices) {
    const p = await b.newPage(); p.__scheme = scheme || 'light'; await p.setViewport({ width: 1180, height: 820 });
    p.on('pageerror', e => errors.push('pageerror: ' + e.message));
    p.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
    p.on('dialog', d => d.accept());
    await p.exposeFunction('goLoadProgress', () => store);
    await p.exposeFunction('goSaveProgress', s => { JSON.parse(s); store = s; savedAt = new Date().toISOString(); return null; });
    await p.exposeFunction('goBackupProgress', old => { backups.push({ old, content: store }); return 'progresso-v' + old + '.bak'; });
    await p.exposeFunction('goCopyText', () => null);
    await p.exposeFunction('goDataFolder', () => 'C:\\Users\\user\\AppData\\Roaming\\TreinoTalTech');
    await p.exposeFunction('goOpenDataFolder', () => null);
    await p.exposeFunction('goDataInfo', () => ({ folder: 'C:\\Users\\user\\AppData\\Roaming\\TreinoTalTech', file: 'progresso.json', size: Buffer.byteLength(store), modified: savedAt || '', exists: !!store }));
    await p.exposeFunction('goExportBackup', (content, name) => { exported = { content, name }; return 'C:\\Users\\user\\Documents\\' + name; });
    await p.exposeFunction('goImportBackup', () => importFile);
    await p.exposeFunction('goBackupNamed', tag => { if (!store) return ''; const n = 'progresso-' + tag + '-20261102-1200.bak'; named.push({ tag, name: n, content: store }); return n; });
    await p.exposeFunction('goSetDarkTitle', d => { darkTitle.push(d); return null; });
    if (p.__scheme) await p.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: p.__scheme }]);
    const stub = `<script>(function(vs){window.__spoken=[];window.SpeechSynthesisUtterance=function(t){this.text=t;this.rate=1;this.lang='';this.voice=null;};
      var ss={speaking:false,getVoices:function(){return vs.slice();},speak:function(u){window.__spoken.push({text:u.text,rate:u.rate,voice:u.voice&&u.voice.name,lang:u.lang});},cancel:function(){},addEventListener:function(){},removeEventListener:function(){}};
      Object.defineProperty(window,'speechSynthesis',{value:ss,configurable:true});})(${JSON.stringify(voices || VOICES_DEF)});<\/script>`;
    await p.setContent(html.replace('<head>', '<head>' + stub.replace('<\\/script>', '</' + 'script>'))); await p.waitForFunction('window.__ready === true'); await sleep(150);
    p.click_ = async sel => { await p.$eval(sel, e => e.click()); await sleep(40); };
    p.has = async sel => !!(await p.$(sel));
    p.enter = async () => { await p.keyboard.press('Enter'); await sleep(60); };
    p.hist = () => p.evaluate('P.historico.length');
    p.confirmDisabled = () => p.$eval('[data-confirm]', e => e.disabled);
    p.modal = () => p.$eval('#modal', e => e.style.display === 'flex');
    return p;
  }

  console.log('1) Instalação nova');
  let p = await open();
  ok(await p.$eval('#ver', e => e.textContent.includes('1.3.1')), 'versão v1.3.1 no cabeçalho');
  ok(!(await p.modal()), 'sem painel de novidades em instalação nova');
  ok(backups.length === 0, 'sem backup em instalação nova');

  console.log('2) Vocab definição: selecionar → trocar → confirmar');
  let h0 = await p.hist();
  ok(await p.confirmDisabled(), 'Confirmar desabilitado antes de escolher');
  await p.click_('[data-act=vpick][data-v="0"]');
  ok(await p.hist() === h0 && !(await p.has('.fb')), 'clicar numa opção não computa');
  ok(!(await p.confirmDisabled()), 'Confirmar habilita após escolher');
  await p.click_('[data-act=vpick][data-v="2"]');
  ok(await p.$$eval('.opt.sel', a => a.length === 1 && a[0].dataset.v === '2'), 'troca de seleção (só a nova fica marcada)');
  await p.click_('[data-act=vpick][data-v="2"]');
  ok(await p.confirmDisabled(), 'clicar de novo desmarca e desabilita');
  await p.keyboard.press('2'); await sleep(60);
  ok(await p.$$eval('.opt.sel', a => a.length === 1 && a[0].dataset.v === '1'), 'tecla 2 seleciona a opção 2');
    await p.enter();
  ok(await p.hist() === h0 + 1 && await p.has('.fb'), 'Enter confirma e registra 1 resposta');
  await p.enter();
  ok(!(await p.has('.fb')) && await p.confirmDisabled(), 'Enter de novo vai para a próxima');
  for (let i = 0; i < 3; i++) { await p.click_('[data-act=vpick][data-v="0"]'); await p.click_('[data-act=vconfirm]'); await p.click_('[data-act=next]'); }
  ok(await p.hist() === h0 + 4, 'fluxo por clique: escolher + Confirmar (4 respostas)');

  console.log('3) Frases: TC e SE (exatamente 2)');
  await p.click_('[data-act=vmode][data-v=frase]'); await p.click_('[data-act=vset][data-v="0"]');
  let seen = { TC: 0, SE: 0 };
  ok(await p.$eval('.card .q', e => !!e.querySelector('.qkind') && !e.querySelector('.pill') && !!e.querySelector('.qtext')) && await p.$eval('.qmeta', e => /Questão 1 de 16/.test(e.innerText) && /conj\. \d/.test(e.innerText)), 'v1.3: TC/SE — tipo acima da frase, conjunto e "Questão 1 de 16" na linha de meta');
  for (let i = 0; i < 16; i++) {
    const isSE = await p.$eval('.q', e => /escolha 2/.test(e.innerText));
    const h = await p.hist();
    if (isSE) {
      await p.click_('[data-act=vpick][data-v="0"]');
      const lbl = await p.$eval('[data-confirm]', e => e.textContent);
      ok(await p.confirmDisabled() && lbl.includes('1/2'), 'SE: 1 escolhida → desabilitado (1/2)');
      await p.click_('[data-act=vpick][data-v="1"]');
      ok(!(await p.confirmDisabled()), 'SE: 2 escolhidas → habilitado');
      await p.click_('[data-act=vpick][data-v="2"]');
      ok(await p.$$eval('.opt.sel', a => a.length) === 2, 'SE: não deixa marcar 3');
      seen.SE++;
    } else { await p.click_('[data-act=vpick][data-v="0"]'); seen.TC++; }
    ok(await p.hist() === h, 'frase: escolher não computa');
    await p.enter(); ok(await p.hist() === h + 1, 'frase: Enter confirma');
    await p.enter();
  }
  ok(seen.TC > 0 && seen.SE > 0, 'testou TC e SE');
  ok(await p.has('[data-act=again]'), 'fim da rodada de frases');

  console.log('4) Quant MC/QC e Numeric Entry');
  await p.click_('[data-act=tab][data-v=quant]'); await p.click_('[data-act=qtype][data-v=MC]');
  h0 = await p.hist();
  ok(await p.confirmDisabled(), 'Quant: Confirmar desabilitado');
  ok(await p.$eval('.qmeta .pill', e => e.innerText === 'Múltipla escolha') && await p.$eval('.card .q', e => !e.querySelector('.pill') && !!e.querySelector('.qtext')), 'v1.3: Quant — tipo na linha de meta, enunciado limpo');
  await p.click_('[data-act=qpick][data-v="0"]'); await p.click_('[data-act=qpick][data-v="1"]');
  ok(await p.hist() === h0 && await p.$$eval('.opt.sel', a => a.length === 1 && a[0].dataset.v === '1'), 'Quant: seleção trocável, não computa');
  await p.enter(); ok(await p.hist() === h0 + 1 && await p.has('.fb'), 'Quant: Enter confirma');
  await p.click_('[data-act=qtype][data-v=QC]'); await p.keyboard.press('3'); await sleep(50);
  await p.click_('[data-act=qconfirm]'); ok(await p.hist() === h0 + 2, 'QC: tecla 3 + Confirmar');
  await p.click_('[data-act=qtype][data-v=NE]');
  for (let i = 0; i < 4; i++) {
    const t = await p.$eval('.q', e => e.innerText);
    const ans = /coins/.test(t) ? '0,25' : /fifth/.test(t) ? '12' : /Pipe/.test(t) ? '2.0' : '60';
    const h = await p.hist();
    ok(await p.confirmDisabled(), 'NE: desabilitado com campo vazio');
    await p.type('#neans', '9'); ok(!(await p.confirmDisabled()), 'NE: habilita ao digitar');
    await p.keyboard.press('Backspace'); await sleep(30); ok(await p.confirmDisabled(), 'NE: desabilita ao apagar');
    await p.type('#neans', ans); ok(await p.hist() === h, 'NE: digitar não computa');
    await p.keyboard.press('Enter'); await sleep(60);
    ok(await p.hist() === h + 1 && await p.has('.fb.ok'), 'NE: Enter confirma, resposta ' + ans + ' correta');
    await p.enter();
    ok(await p.has('[data-act=again]') || await p.$eval('#neans', e => e.value) === '', 'NE: próxima começa vazia');
  }

  console.log('5) Build a Sentence');
  await p.click_('[data-act=tab][data-v=writing]'); await p.click_('[data-act=wtask][data-v=build]');
  for (const [k, it] of D.toeflWriting.buildSentence.practice.entries()) {
    ok(await p.confirmDisabled(), 'Build: Confirmar desabilitado vazio');
    let rest = it.answer.toLowerCase().replace(/[.?!]$/, ''); const order = [];
    while (rest.length) { const idx = it.chunks.findIndex((c, i) => !order.includes(i) && c !== it.extra && rest.startsWith(c.toLowerCase())); if (idx < 0) { errors.push('build ' + k); break; } order.push(idx); rest = rest.slice(it.chunks[idx].length).trim(); }
    const wrong = it.chunks.findIndex((_, i) => i !== order[0]);
    await p.click_(`[data-act=bchip][data-v="${wrong}"]`);
    ok(!(await p.has('.fb')) && !(await p.confirmDisabled()), 'Build: montar não computa; habilita');
    await p.click_('[data-act=bremove][data-v="0"]');
    ok(await p.confirmDisabled() && await p.$eval(`[data-act=bchip][data-v="${wrong}"]`, e => !e.disabled), 'Build: clicar no bloco montado o remove');
    for (const i of order) await p.click_(`[data-act=bchip][data-v="${i}"]`);
    await p.enter(); ok(await p.has('.fb.ok'), 'Build: Enter confirma, item ' + k + ' correto');
    await p.enter();
  }
  await sleep(900);
  const fresh = JSON.parse(store);
  ok(fresh.schemaVersion === 4 && fresh.appVersion === '1.3.1' && fresh.ultimaVersaoVista === '1.3.1' && fresh.settings.theme === 'system' && fresh.settings.language === 'pt', 'instalação nova salva schemaVersion 4 / appVersion 1.3.1 / settings padrão');
  console.log('   respostas registradas:', fresh.historico.length);
  await p.close();

  console.log('6) Atualização: progresso.json real da v1.0');
  const v10 = JSON.parse(fs.readFileSync('/tmp/progresso-v1.0.json', 'utf8'));
  ok(v10.schemaVersion === undefined, 'arquivo v1.0 não tem schemaVersion');
  v10.campoFuturo = { nota: 'campo desconhecido', lista: [1, 2] }; v10.historico[0].extraX = 42;
  store = JSON.stringify(v10); const original = store; backups = [];
  p = await open();
  ok(backups.length === 1 && backups[0].old === 1 && backups[0].content === original, 'backup chamado (v1) com o arquivo original, antes de salvar');
  await sleep(300);
  let s = JSON.parse(store);
  ok(s.schemaVersion === 4 && s.appVersion === '1.3.1' && s.settings && s.settings.theme === 'system' && s.settings.language === 'pt', 'v1.0 migrado direto para schemaVersion 4 com settings');
  ok(JSON.stringify(s.campoFuturo) === JSON.stringify(v10.campoFuturo) && s.historico[0].extraX === 42, 'campos desconhecidos preservados');
  ok(['historico', 'rodadas', 'redacoes', 'falas', 'rascunhos', 'erros', 'marcos', 'criado'].every(k => JSON.stringify(s[k]) === JSON.stringify(v10[k])), 'todo o progresso v1.0 intacto (histórico, rodadas, redações, falas, rascunhos, erros, marcos)');
  ok(await p.modal() && await p.$eval('#modalc', e => /O que há de novo/.test(e.innerText) && /v1\.2/.test(e.innerText) && /v1\.1/.test(e.innerText) && /progresso-v1\.bak/.test(e.innerText)), 'painel "O que há de novo" aparece, cita o backup');
    await p.enter(); await sleep(300);
  ok(!(await p.modal()) && JSON.parse(store).ultimaVersaoVista === '1.3.1', 'Enter fecha o painel e grava ultimaVersaoVista=1.3.1');
  await p.close();
  backups = []; p = await open();
  ok(!(await p.modal()) && backups.length === 0, 'reabrindo: painel não reaparece, sem novo backup');
  await p.click_('#ver'); ok(await p.modal(), 'clicar em "v1.2" reabre as novidades');
  await p.keyboard.press('Escape'); await sleep(50); ok(!(await p.modal()), 'Esc fecha');
  await p.click_('[data-act=tab][data-v=prog]'); await sleep(100);
  ok(await p.$$eval('[data-ms]:checked', a => a.length) === Object.values(v10.marcos).filter(m => m.feito).length, 'marcos da v1.0 continuam marcados na tela');
  await p.close();

  console.log('7) Arquivo de versão mais nova (schemaVersion 5) não é rebaixado');
  store = JSON.stringify({ ...v10, schemaVersion: 5, appVersion: '1.5', ultimaVersaoVista: '1.5', novoDaV15: true }); backups = [];
  p = await open();
  await p.click_('[data-act=vpick][data-v="0"]'); await p.enter(); await sleep(900);
  s = JSON.parse(store);
  ok(backups.length === 0 && s.schemaVersion === 5 && s.appVersion === '1.5' && s.novoDaV15 === true && !(await p.modal()), 'schema 5 mantido, campos novos preservados, sem painel');
  await p.close();

  console.log('8) Migração de dados da v1.1 (schema 2)');
  const v11 = JSON.parse(JSON.stringify(fresh));
  v11.schemaVersion = 2; v11.appVersion = '1.1'; v11.ultimaVersaoVista = '1.1'; delete v11.settings; v11.campoDaV11 = { x: 1 };
  store = JSON.stringify(v11); const orig11 = store; backups = [];
  p = await open();
  await sleep(300); s = JSON.parse(store);
  ok(backups.length === 1 && backups[0].old === 2 && backups[0].content === orig11, 'v1.1: backup (progresso-v2.bak) do arquivo original antes de converter');
  ok(s.schemaVersion === 4 && s.settings.theme === 'system' && s.settings.language === 'pt', 'v1.1 → schema 4 com settings padrão');
  ok(s.campoDaV11.x === 1 && ['historico','rodadas','redacoes','falas','erros','marcos'].every(k => JSON.stringify(s[k]) === JSON.stringify(v11[k])), 'v1.1: progresso e campos desconhecidos intactos');
  ok(await p.modal() && await p.$eval('#modalc', e => /v1\.3\.1\n/.test(e.innerText) && /v1\.3\n/.test(e.innerText) && /v1\.2\.1/.test(e.innerText) && /v1\.2\n/.test(e.innerText) && !/v1\.1\n/.test(e.innerText) && /progresso-v2\.bak/.test(e.innerText)), 'v1.1: novidades da v1.3, v1.2.1 e v1.2 (sem v1.1), cita progresso-v2.bak');
  await p.enter(); await sleep(200); await p.close();
  backups = []; p = await open(); ok(!(await p.modal()) && backups.length === 0, 'v1.1: reabrindo sem painel e sem novo backup'); await p.close();

  console.log('9) Tema: Claro / Escuro / Sistema');
  store = JSON.stringify(v10); p = await open('light'); await p.keyboard.press('Escape'); await sleep(200); darkTitle = [];
  const theme = () => p.evaluate('document.documentElement.dataset.theme');
  const bg = () => p.evaluate('getComputedStyle(document.body).backgroundColor');
  ok(await theme() === 'light', 'Sistema (Windows claro) → tema claro');
  await p.click_('#gear'); ok(await p.has('#s-theme') && await p.$eval('#gear', e => e.classList.contains('on')), 'engrenagem abre Configurações (e fica destacada)');
  const bgLight = await bg();
  await p.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]); await sleep(150);
  ok(await theme() === 'dark' && (await bg()) !== bgLight, 'Sistema acompanha o Windows ao vivo (claro → escuro)');
  ok(darkTitle.includes(true), 'barra de título escura pedida ao Go (goSetDarkTitle)');
  await p.click_('[data-act=theme][data-v=light]'); await sleep(300);
  ok(await theme() === 'light' && JSON.parse(store).settings.theme === 'light', 'Claro: aplica na hora mesmo com Windows escuro, e salva');
  await p.click_('[data-act=theme][data-v=dark]'); await sleep(300);
  ok(await theme() === 'dark' && JSON.parse(store).settings.theme === 'dark', 'Escuro: aplica na hora e salva');
  await p.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]); await sleep(150);
  ok(await theme() === 'dark', 'Escuro fixo ignora mudança do Windows');
  ok(await p.$eval('[data-act=theme][data-v=dark]', e => e.classList.contains('on') && e.getAttribute('aria-checked') === 'true'), 'botão do tema atual marcado');
  await p.close(); p = await open('light'); ok(await theme() === 'dark', 'tema Escuro persiste ao reabrir');
  await p.click_('#gear'); await p.click_('[data-act=theme][data-v=system]'); await sleep(300);
  ok(await theme() === 'light' && JSON.parse(store).settings.theme === 'system', 'volta para Sistema');
  // contraste mínimo de textos principais nos 2 temas
  for (const t of ['light', 'dark']) {
    await p.evaluate(t => { P.settings.theme = t; applyTheme(); }, t);
    const cr = await p.evaluate(() => { const rgb = c => c.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number); const lum = c => { const [r, g, b] = rgb(c).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }); return .2126 * r + .7152 * g + .0722 * b; };
      const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); }; const cs = s => getComputedStyle(document.querySelector(s));
      return [ratio(cs('.card').color, cs('.card').backgroundColor), ratio(cs('.mut').color, cs('.card').backgroundColor), ratio(cs('.btn.pri').color, cs('.btn.pri').backgroundColor), ratio(cs('header').color, cs('header').backgroundColor)]; });
    ok(cr[0] >= 7 && cr[1] >= 4.5 && cr[2] >= 4.5 && cr[3] >= 7, `contraste legível no tema ${t} (${cr.map(x => x.toFixed(1)).join(' / ')})`);
  }
  await p.evaluate(() => { P.settings.theme = 'system'; applyTheme(); });
  await p.close();

  console.log('10) Idioma da interface');
  p = await open('light'); await p.click_('#gear');
  await p.click_('[data-act=lang][data-v=en]'); await sleep(300);
  ok(JSON.parse(store).settings.language === 'en' && await p.evaluate('document.documentElement.lang') === 'en', 'English salvo; <html lang=en>');
  ok(await p.$eval('#nav', e => /Progress\b/.test(e.innerText) && !/Progresso/.test(e.innerText)) && await p.$eval('#gear', e => e.title === 'Settings'), 'menu e engrenagem em inglês');
  ok(await p.$eval('#app', e => /Saved data/.test(e.innerText) && /Interface language/.test(e.innerText) && !/Dados salvos/.test(e.innerText)), 'tela de configurações em inglês');
  await p.click_('[data-act=tab][data-v=vocab]'); await p.click_('[data-act=vmode][data-v=def]'); await p.click_('[data-act=vset][data-v="1"]');
  ok(await p.$eval('.q', e => /What is the definition of/.test(e.innerText)) && await p.$eval('[data-confirm]', e => e.textContent === 'Confirm'), 'quiz em inglês (rótulos)');
  ok(await p.$eval('.qdef .qtext', e => /^What is the definition of [a-z]+\?$/.test(e.innerText.trim())) && await p.$eval('.qmeta', e => /Question \d+ of \d+/.test(e.innerText) && /set \d/.test(e.innerText)), 'v1.3: cabeçalho em inglês ("…definition of word?", "Question X of N")');
  const word = await p.evaluate('R.cur.item.word'); const def = await p.evaluate('R.cur.item.definition'); const ptTr = await p.evaluate('R.cur.item.pt');
  ok(await p.$$eval('.opt', (a, d) => a.some(x => x.innerText.includes(d)), def), 'conteúdo do teste continua igual (definições em inglês)');
  await p.click_('[data-act=vpick][data-v="0"]'); await p.enter();
  ok(await p.$eval('.fb', (e, t) => /Correct!|Wrong\./.test(e.innerText) && !e.innerText.includes('(' + t + ')'), ptTr), 'feedback em inglês, sem a tradução PT');
  await p.click_('[data-act=vmode][data-v=frase]'); await p.click_('[data-act=vpick][data-v="0"]');
  const it = await p.evaluate('R.cur.item'); if (it.type === 'SE') await p.click_('[data-act=vpick][data-v="1"]');
  await p.enter();
  ok(await p.$eval('.fb', (e, x) => e.innerText.includes(x.explanationEn) && !e.innerText.includes(x.explanation), it), 'explicação TC/SE em inglês');
  await p.click_('[data-act=tab][data-v=quant]'); await p.click_('[data-act=qtype][data-v=MC]'); await p.click_('[data-act=qpick][data-v="0"]'); await p.enter();
  const qi = await p.evaluate('R.cur.item'); ok(await p.$eval('.fb', (e, x) => e.innerText.includes(x.solutionEn), qi), 'solução Quant em inglês');
  await p.click_('[data-act=tab][data-v=prog]'); ok(await p.$eval('#app', e => /Plan milestones/.test(e.innerText) && /W1 · Nov 2–8/.test(e.innerText)), 'marcos em inglês');
  await p.close(); p = await open('light');
  ok(await p.$eval('#nav', e => /Progress\b/.test(e.innerText)), 'idioma persiste ao reabrir');
  await p.click_('#gear'); await p.click_('[data-act=lang][data-v=pt]'); await sleep(300);
  ok(await p.$eval('#nav', e => /Progresso/.test(e.innerText)) && JSON.parse(store).settings.language === 'pt', 'volta para Português');
  await p.click_('[data-act=tab][data-v=vocab]'); await p.click_('[data-act=vmode][data-v=def]');
  if (await p.has('[data-act=next]')) await p.click_('[data-act=next]'); // v1.2.1: a sessão foi retomada na questão já respondida
  await p.click_('[data-act=vpick][data-v="0"]'); await p.enter();
  const pt2 = await p.evaluate('R.cur.item.pt'); ok(await p.$eval('.fb', (e, t) => e.innerText.includes('(' + t + ')'), pt2), 'em PT a tradução da palavra aparece');
  await p.close();

  console.log('11) Tabela "desempenho por conjunto"');
  store = JSON.stringify(v11); p = await open('light'); await p.keyboard.press('Escape'); await sleep(100);
  await p.evaluate(() => { P.historico = P.historico.filter(h => !(h.mod === 'vocab' && h.set === 4) && !(h.mod === 'frases' && h.set === 4)); P.historico = P.historico.filter(h => !(h.set === 1 && (h.mod === 'vocab' || h.mod === 'revisao'))); [['abate',true],['abate',false],['cogent',false],['banal',true]].forEach(([w,o]) => P.historico.push({ t: now(), mod: 'vocab', id: 'x', set: 1, ok: o, palavra: w })); P.erros = { abate: { n: 2, pendente: true }, cogent: { n: 1, pendente: true }, zealous: { n: 1, pendente: false } }; render(); });
  ok(await p.$eval('#settable', e => /4 blocos de 15, em ordem alfabética/.test(e.innerText)), 'explicação dos conjuntos (4 blocos de 15, alfabéticos)');
  ok(await p.$eval('[data-setrow="1"]', e => e.innerText.includes('abate → cogent')) && await p.$eval('[data-setrow="4"]', e => e.innerText.includes('placate → zealous')), 'faixa de cada conjunto (abate → cogent … placate → zealous)');
  const sr1 = await p.evaluate(() => { const ws = DATA.vocab.filter(v => v.set === 1).map(v => v.word); const seen = new Set(P.historico.filter(h => (h.mod === 'vocab' || h.mod === 'revisao') && h.palavra).map(h => h.palavra)); const a = P.historico.filter(h => h.mod === 'vocab' && h.set === 1); return { seen: ws.filter(w => seen.has(w)).length, ok: a.filter(h => h.ok).length, n: a.length }; });
  ok(await p.$eval('[data-setrow="1"] .seen', e => e.innerText.trim()) === sr1.seen + '/15', 'palavras vistas de 15 (conjunto 1: ' + sr1.seen + '/15)'); ok(sr1.seen === 3 && sr1.n === 4 && sr1.ok === 2, 'contagem determinística (3 vistas, 2/4)');
  const c1 = await p.$eval('[data-setrow="1"] .cdef', e => e.innerText);
    ok(sr1.n > 0 && c1.includes(`${sr1.ok}/${sr1.n} · ${Math.round(100 * sr1.ok / sr1.n)}%`), 'Definições acertos/tentativas · % no conjunto 1');
  ok(await p.$eval('[data-setrow="4"] .cdef', e => /ainda não treinado/.test(e.innerText) && !/0\/0/.test(e.innerText)) && await p.$eval('[data-setrow="4"] .cfr', e => /ainda não treinado/.test(e.innerText) && !/0\/0/.test(e.innerText)), 'células vazias: "ainda não treinado" em vez de 0/0 (0%)');
  ok(await p.$$eval('[data-setrow="1"] .chip', a => a.map(x => x.innerText).sort().join()) === 'abate,cogent' && await p.$$eval('[data-setrow="4"] .chip', a => a.length) === 0, 'erros pendentes como chips (resolvidos não aparecem)');
  ok(await p.$eval('#settable .legend', e => /quiz de significado/.test(e.innerText) && /Text Completion \/ Sentence Equivalence/.test(e.innerText)), 'legenda Definições / Frases TC/SE');
  await p.click_('[data-act=vmode][data-v=revisao]');
  await p.click_('[data-act=vtrain][data-v="3"]');
  ok(await p.evaluate('V.set === 3 && V.mode === "def" && R.queue.length === 15 && R.queue.every(v => v.set === 3)') && await p.$eval('[data-act=vset][data-v="3"]', e => e.classList.contains('on')), '"Treinar este conjunto" abre o quiz filtrado (conjunto 3, 15 palavras)');
  await p.click_('[data-act=vmode][data-v=frase]'); await p.click_('[data-act=vtrain][data-v="2"]');
  ok(await p.evaluate('V.mode === "frase" && R.queue.every(v => v.set === 2)'), '"Treinar este conjunto" mantém o modo Frases se estiver nele');
  await p.click_('[data-act=vmode][data-v=def]'); await p.click_('[data-act=vset][data-v="1"]');
  await p.screenshot({ path: '/workspace/treino-app/shots/sets-table.png', clip: await p.$eval('#settable', e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y + window.scrollY, width: r.width, height: r.height }; }), captureBeyondViewport: true });
  // v1.3.1: lista de conjuntos sem quebras de linha, linhas de mesma altura, +N expande
  const SETCHK = () => p.evaluate(() => {
    const lines = el => { const r = document.createRange(); r.selectNodeContents(el); return new Set([...r.getClientRects()].filter(q => q.width > 0.5).map(q => Math.round(q.top))).size; };
    const els = [...document.querySelectorAll('#settable .snm, #settable .srng, #settable .sseen, #settable .slbl, #settable .sval, #settable .sact .btn')].filter(e => e.offsetParent);
    const bad = els.filter(e => lines(e) !== 1 || (!e.classList.contains('btn') && e.scrollWidth > e.clientWidth + 1)).map(e => e.className + ':' + e.innerText);
    document.querySelectorAll('#settable .pend:not(.open)').forEach(e => { const t = [...e.children].filter(c => c.offsetParent).map(c => c.getBoundingClientRect().top); if (t.length && Math.max(...t) - Math.min(...t) > 3) bad.push('pend:' + e.innerText); });
    const hs = [...document.querySelectorAll('#settable .srow')].map(e => Math.round(e.getBoundingClientRect().height));
    const over = [...document.querySelectorAll('#settable .srow')].some(r => r.scrollWidth > r.clientWidth + 1);
    return { n: els.length, bad, hs, uniform: hs.length === 4 && Math.max(...hs) - Math.min(...hs) <= 1, over };
  });
  await p.evaluate(() => { const ws = DATA.vocab.filter(v => v.set === 2).map(v => v.word); ws.slice(0, 5).forEach(w => P.erros[w] = { n: 1, pendente: true }); render(); });
  for (const lang of ['pt', 'en']) for (const w of [1000, 800]) {
    await p.setViewport({ width: w, height: 860 }); await p.evaluate(l => { P.settings.language = l; render(); }, lang); await sleep(150);
    const r = await SETCHK();
    ok(r.n >= 30 && r.bad.length === 0 && !r.over, `v1.3.1: rótulos/valores numa linha só, sem cortes (${lang}, ${w}px)` + (r.bad.length ? ' ' + JSON.stringify(r.bad) : ''));
    ok(r.uniform, `v1.3.1: linhas da lista com a mesma altura (${lang}, ${w}px: ${r.hs})`);
  }
  await p.setViewport({ width: 1000, height: 860 }); await p.evaluate(() => { P.settings.language = 'pt'; render(); }); await sleep(150);
  const vis = () => p.$$eval('[data-setrow="2"] .chip', a => a.filter(c => c.offsetParent).length);
  ok(await p.$$eval('[data-setrow="2"] .chip', a => a.length) === 5 && await vis() === 2 && await p.$eval('[data-setrow="2"] [data-act=pmore]', e => !e.hidden && e.innerText.trim() === '+3'), 'v1.3.1: 5 erros → 2 chips + "+3"');
  await p.click_('[data-act=pmore][data-v="2"]'); await sleep(100);
  ok(await vis() === 5 && await p.$eval('[data-setrow="2"] [data-act=pmore]', e => e.innerText.trim() === 'menos') && await p.$eval('[data-setrow="2"] .pend', e => e.classList.contains('open')), 'v1.3.1: clicar em +N mostra todos os erros (e vira "menos")');
  await p.click_('[data-act=pmore][data-v="2"]'); await sleep(100);
  ok(await vis() === 2 && await p.$eval('[data-setrow="2"] [data-act=pmore]', e => e.innerText.trim() === '+3'), 'v1.3.1: "menos" recolhe de volta para 2 + "+3"');
  ok(await p.$eval('#settable .legend', e => /acertos\/tentativas · % de acerto/.test(e.innerText)) && await p.$$eval('#settable .slbl', a => a.every(x => !/acertos/.test(x.innerText))), 'v1.3.1: significado de acertos/tentativas na legenda, não nos rótulos');
  await p.evaluate(() => { P.settings.language = 'en'; render(); });
  ok(await p.$eval('#settable', e => /alphabetical blocks of 15/.test(e.innerText) && /not practised yet/.test(e.innerText) && /Practise this set/.test(e.innerText)), 'tabela de conjuntos em inglês');
  await p.evaluate(() => { P.settings.language = 'pt'; render(); });
  await p.close();

  console.log('12) Dados salvos: info, exportar e importar (ida e volta)');
  store = JSON.stringify(v11); p = await open('light'); await p.keyboard.press('Escape'); await sleep(300);
  await p.click_('#gear'); await sleep(200);
  const info = await p.$eval('#dinfo', e => e.innerText);
  ok(/TreinoTalTech/.test(info) && /progresso\.json/.test(info) && /KB/.test(info) && /\d{2}:\d{2}:\d{2}/.test(info), 'mostra pasta, arquivo, tamanho e último salvamento');
  const before = JSON.parse(store);
  exported = null; await p.click_('[data-act=bexport]'); await sleep(300);
  ok(exported && /^TreinoTalTech-backup-\d{8}-\d{4}\.json$/.test(exported.name) && JSON.parse(exported.content).historico.length === before.historico.length, 'Exportar: .json com nome datado e todo o progresso');
  await p.click_('[data-act=bexport]'); // sem crash na 2ª vez
  // importar arquivo inválido
  importFile = { name: 'lixo.json', content: '{"foo": 1}' }; await p.click_('[data-act=bimport]'); await sleep(150);
  ok(!(await p.modal()) && await p.$eval('.toast:last-of-type', e => /Não importei/.test(e.innerText)), 'arquivo inválido é recusado');
  importFile = { name: 'quebrado.json', content: '{nao é json' }; await p.click_('[data-act=bimport]'); await sleep(100);
  ok(!(await p.modal()), 'JSON quebrado é recusado');
  importFile = { name: 'futuro.json', content: JSON.stringify({ ...before, schemaVersion: 9 }) }; await p.click_('[data-act=bimport]'); await sleep(100);
  ok(!(await p.modal()), 'arquivo de versão mais nova é recusado');
  importFile = null; await p.click_('[data-act=bimport]'); await sleep(100); ok(!(await p.modal()), 'cancelar o diálogo não faz nada');
  // apaga parte do progresso e reimporta o backup exportado
  await p.evaluate(() => { P.historico = P.historico.slice(0, 3); P.redacoes = []; persist(true); }); await sleep(300);
  importFile = { name: exported.name, content: exported.content }; named = [];
  await p.click_('[data-act=bimport]'); await sleep(150);
  ok(await p.modal() && await p.$eval('#modalc', (e, n) => /Importar backup\?/.test(e.innerText) && e.innerText.includes(n), exported.name), 'confirmação de importação com nome e contagens');
  ok(JSON.parse(store).historico.length === 3, 'nada muda antes de confirmar');
  await p.enter(); await sleep(400);
  s = JSON.parse(store);
  ok(named.length === 1 && named[0].tag === 'antes-de-importar' && JSON.parse(named[0].content).historico.length === 3, 'backup .bak do estado atual feito ANTES de importar');
  ok(s.historico.length === before.historico.length && s.redacoes.length === before.redacoes.length && s.campoDaV11.x === 1 && s.schemaVersion === 4, 'ida e volta: progresso restaurado (inclui campos extras)');
  ok(!(await p.modal()) && await p.has('#s-data'), 'modal fecha e volta às Configurações');
  // importar um backup da v1.0 (sem schema) → migrado
  importFile = { name: 'antigo-v10.json', content: JSON.stringify(v10) }; await p.click_('[data-act=bimport]'); await p.click_('[data-act=iconfirm]'); await sleep(400);
  s = JSON.parse(store); ok(s.schemaVersion === 4 && s.versaoLegada !== undefined && s.settings.theme === 'system', 'importar backup antigo (v1.0) migra para schema 4');
  // settings do arquivo importado prevalecem
  importFile = { name: 'en.json', content: JSON.stringify({ ...before, settings: { theme: 'dark', language: 'en' } }) }; await p.click_('[data-act=bimport]'); await p.click_('[data-act=iconfirm]'); await sleep(400);
  ok(await p.evaluate('document.documentElement.dataset.theme') === 'dark' && await p.$eval('#nav', e => /Progress\b/.test(e.innerText)), 'importar aplica tema/idioma do arquivo na hora');
  await p.click_('[data-act=theme][data-v=system]'); await p.click_('[data-act=lang][data-v=pt]'); await sleep(300);

  console.log('13) Zerar progresso (digitar ZERAR)');
  const pre = JSON.parse(store); named = [];
  await p.click_('[data-act=breset]');
  ok(await p.modal() && await p.$eval('[data-act=rconfirm]', e => e.disabled), 'modal de perigo aberto, botão desabilitado');
  await p.enter(); await sleep(100); ok(JSON.parse(store).historico.length === pre.historico.length && await p.modal(), 'Enter não zera sem digitar');
  await p.type('#zerarIn', 'zerar'); ok(await p.$eval('[data-act=rconfirm]', e => e.disabled), '"zerar" minúsculo não habilita');
  await p.$eval('#zerarIn', e => { e.value = ''; }); await p.type('#zerarIn', 'ZERA'); ok(await p.$eval('[data-act=rconfirm]', e => e.disabled), '"ZERA" não habilita');
  await p.screenshot({ path: '/workspace/treino-app/shots/settings-reset.png' });
  await p.keyboard.press('Escape'); await sleep(100); ok(!(await p.modal()) && JSON.parse(store).historico.length === pre.historico.length, 'Esc cancela sem apagar');
  await p.click_('[data-act=breset]'); await p.type('#zerarIn', 'ZERAR');
  ok(!(await p.$eval('[data-act=rconfirm]', e => e.disabled)), '"ZERAR" habilita');
  await p.enter(); await sleep(400);
  s = JSON.parse(store);
  ok(named.length === 1 && named[0].tag === 'antes-de-zerar' && JSON.parse(named[0].content).historico.length === pre.historico.length, '.bak com o progresso completo feito ANTES de zerar');
  ok(s.historico.length === 0 && s.redacoes.length === 0 && s.falas.length === 0 && Object.keys(s.erros).length === 0 && Object.keys(s.marcos).length === 0 && s.rodadas.length === 0, 'progresso zerado');
  ok(s.settings.theme === 'system' && s.settings.language === 'pt' && s.schemaVersion === 4 && s.ultimaVersaoVista === '1.3.1' && Object.keys(s.sessoes).length === 0, 'tema/idioma mantidos, sessões limpas; sem painel de novidades depois');
  await p.close(); p = await open('light'); ok(!(await p.modal()) && await p.evaluate('P.historico.length') === 0, 'reabrindo após zerar: vazio, sem novidades');
  await p.close();

  console.log('15) Pronúncia, IPA e definições');
  ok(D.vocab.every(v => /^\/[^/\s]+\/$/.test(v.ipa || '')), 'IPA no formato /…/ nas 60 palavras');
  ok(D.vocab.filter(v => !v.ipa.includes('ˈ')).map(v => v.word).join() === 'laud', 'acento tônico marcado (só "laud", monossílaba, sem ˈ)');
  ok(D.vocab.find(v => v.word === 'ameliorate').definition === 'to make a bad situation better; to improve', 'nova definição de ameliorate');
  ok(new Set(D.vocab.map(v => v.definition)).size === 60 && !D.vocab.some(v => /unsatisfactory better/.test(v.definition)), 'definições únicas e sem a frase ambígua');
  store = ''; p = await open('light');
  ok(await p.evaluate('P.settings.autoSpeak') === false, 'pronúncia automática desligada por padrão');
  ok(await p.evaluate('__spoken.length') === 0, 'nada falado sem pedir');
  let w = await p.evaluate('R.cur.item.word');
  ok(await p.$eval('.qdef .spk[data-act=say]', e => e.dataset.v) === w, 'alto-falante ao lado da palavra no quiz');
  ok(await p.$eval('.qdef .ipa', e => e.textContent) === D.vocab.find(v => v.word === w).ipa, 'IPA mostrada no quiz');
  // v1.3: cabeçalho novo
  ok(await p.$eval('.qdef .qtext', e => e.innerText.trim()) === 'Qual é a definição de ' + w + '?', 'v1.3: frase inteira, "?" colado na palavra');
  ok(await p.$eval('.qdef .qtext b.w', e => e.nextSibling && e.nextSibling.nodeType === 3 && e.nextSibling.textContent === '?'), 'v1.3: nó logo depois da palavra é exatamente "?"');
  ok(await p.$eval('.qdef .wunit', (e, w) => { const ip = e.querySelector('.ipa'), wb = e.querySelector('.wbig'), sp = e.querySelector('.aud .spk[data-act=say]'), sl = e.querySelector('.aud .spk[data-act=sayslow]');
    if (!ip || !wb || !sp || !sl || wb.textContent !== w) return false;
    const a = wb.getBoundingClientRect(), b = ip.getBoundingClientRect(), c = sp.getBoundingClientRect();
    return b.left >= a.right && c.left >= b.right && Math.abs((a.top + a.bottom) / 2 - (b.top + b.bottom) / 2) < 14 && getComputedStyle(ip).display !== 'none' && b.width > 10; }, w), 'v1.3: palavra grande → IPA → alto-falante | devagar na mesma linha');
  ok(await p.$$eval('.qdef .spk[data-act=say]', a => a.length) === 1 && await p.$$eval('.qdef .spk[data-act=sayslow]', a => a.length) === 1, 'v1.3: um só alto-falante + um "devagar" no topo');
  ok(await p.$eval('.qmeta', e => /Questão \d+ de 60/.test(e.innerText) && /conj\. \d/.test(e.innerText) && !!e.querySelector('.qprog') && !!e.querySelector('[data-act=rnew]')), 'v1.3: linha de meta com conjunto, "Questão X de 60", barra e Nova sessão');
  ok(await p.$eval('.qdef', e => !e.querySelector('.pill')), 'v1.3: selo do conjunto saiu da frase');
  ok(await p.has('.qdef .spk[data-act=sayslow]'), 'botão devagar no quiz');
  await p.click_('.qdef .spk[data-act=say]'); await sleep(80);
  let sp = await p.evaluate('__spoken[__spoken.length-1]');
  ok(sp && sp.text === w && sp.rate === 0.85 && sp.voice.includes('Zira') && sp.lang === 'en-US', 'clique: voz en-US (Zira, preferida à en-GB), rate 0.85');
  await p.click_('.qdef .spk[data-act=sayslow]'); await sleep(80);
  sp = await p.evaluate('__spoken[__spoken.length-1]'); ok(sp.rate === 0.6 && sp.text === w, 'devagar: rate 0.6');
  let n0 = await p.evaluate('__spoken.length');
  const bx = await (await p.$('.qdef .spk[data-act=say]')).boundingBox();
  await p.mouse.move(bx.x + bx.width / 2, bx.y + bx.height / 2); await p.mouse.down(); await sleep(700); await p.mouse.up(); await sleep(120);
  sp = await p.evaluate('__spoken[__spoken.length-1]');
  ok(await p.evaluate('__spoken.length') === n0 + 1 && sp.rate === 0.6, 'segurar o botão = devagar (sem fala dupla)');
  // erra a palavra → feedback, erros pendentes, Progresso
  await p.evaluate(() => { const q = R.cur; R.picked = [q.options.find(o => !q.answers.includes(o))]; vocabCheck(); });
  ok(await p.$eval('.fb', e => !!e.querySelector('.spk[data-act=say]') && !!e.querySelector('.ipa')), 'alto-falante + IPA no feedback');
  ok(await p.$$eval('#settable .chip .spk', a => a.length) >= 1, 'alto-falante nos chips de erros pendentes');
  await p.click_('#settable .chip .spk'); sp = await p.evaluate('__spoken[__spoken.length-1]'); ok(sp.text === w, 'chip fala a palavra errada');
  await p.click_('[data-act=tab][data-v=prog]'); await sleep(100);
  ok(await p.$$eval('.spk[data-act=say]', (a, w) => a.some(e => e.dataset.v === w), w) && (await p.content()).includes(D.vocab.find(v => v.word === w).ipa), 'Progresso > Palavras para revisar: alto-falante + IPA');
  await p.click_('[data-act=tab][data-v=vocab]'); await p.click_('[data-act=vmode][data-v=revisao]');
  ok(await p.$eval('.qdef .spk', e => e.dataset.v) === w, 'Revisar erros: alto-falante na palavra');
  // TC/SE: só depois de confirmar
  await p.click_('[data-act=vmode][data-v=frase]'); await p.click_('[data-act=vset][data-v="1"]');
  let tcOk = true, tcSpk = true, optSpk = true, blankOk = true;
  for (let i = 0; i < 4; i++) {
    if (await p.$$eval('#app .card .spk', a => a.filter(e => !e.closest('#settable')).length) !== 0) tcSpk = false;
    if (await p.has('#saysent')) tcOk = false;
    await p.evaluate(() => { const q = R.cur; R.picked = q.options.filter(o => !q.answers.includes(o)).slice(0, q.need); vocabCheck(); });
    const st = await p.$eval('#saysent .spk[data-act=say]', e => e.dataset.v);
    const raw = await p.evaluate('R.cur.item.sentence');
    if (!/\bblank\b/.test(st) || /_/.test(st) || st.replace('blank', '') === raw) blankOk = false;
    if (await p.$$eval('#sayopts .spk', a => a.length) !== await p.evaluate('R.cur.options.length')) optSpk = false;
    if (i === 0) { await p.click_('#saysent .spk[data-act=say]'); sp = await p.evaluate('__spoken[__spoken.length-1]'); ok(sp.text === st && sp.rate === 0.85, 'frase lida em voz alta (lacuna = "blank")'); await p.screenshot({ path: '/workspace/treino-app/shots/tcse-feedback-light.png', fullPage: true }); }
    await p.click_('[data-act=next]');
  }
  ok(tcSpk && tcOk, 'TC/SE: nenhum alto-falante antes de confirmar (sem dica)');
  ok(blankOk, 'TC/SE: texto falado troca ___ por "blank"');
  ok(optSpk, 'TC/SE: alto-falante em cada alternativa no feedback');
  ok(await p.$$eval('.missed .chip .spk', a => a.length) >= 1, 'resultado da rodada: palavras erradas com alto-falante');
  // Configurações: voz detectada + pronúncia automática
  await p.click_('#gear'); await sleep(150);
  ok(await p.$eval('#voiceinfo', e => /Zira/.test(e.textContent)), 'Configurações mostram a voz en-US escolhida');
  await p.click_('[data-act=autospeak][data-v=on]'); await sleep(100);
  ok(JSON.parse(store).settings.autoSpeak === true, 'pronúncia automática ligada e salva');
  await p.click_('[data-act=vmode][data-v=def]').catch(() => {});
  await p.click_('[data-act=tab][data-v=vocab]'); await p.click_('[data-act=vmode][data-v=def]'); await sleep(100);
  if (await p.has('[data-act=next]')) { await p.click_('[data-act=next]'); await sleep(80); } // v1.2.1: sessão retomada na questão já respondida
  n0 = await p.evaluate('__spoken.length'); w = await p.evaluate('R.cur.item.word');
  sp = await p.evaluate('__spoken[__spoken.length-1]'); ok(sp && sp.text === w, 'automática: fala a palavra ao mostrar');
  await p.click_('[data-act=vpick][data-v="0"]'); await p.click_('[data-act=vpick][data-v="1"]');
  ok(await p.evaluate('__spoken.length') === n0, 'automática: não repete ao re-renderizar');
  await p.click_('[data-act=vconfirm]'); ok(await p.evaluate('__spoken.length') === n0, 'automática: não fala de novo no feedback');
  await p.click_('[data-act=next]'); await sleep(80);
  sp = await p.evaluate('__spoken[__spoken.length-1]'); ok(await p.evaluate('__spoken.length') === n0 + 1 && sp.text === await p.evaluate('R.cur.item.word'), 'automática: próxima palavra falada uma vez');
  await p.screenshot({ path: '/workspace/treino-app/shots/vocab-pronuncia-light.png' });
  await p.close(); p = await open('light'); ok(await p.evaluate('P.settings.autoSpeak') === true, 'pronúncia automática persiste ao reabrir');
  await p.click_('#gear'); await p.click_('[data-act=autospeak][data-v=off]'); ok(JSON.parse(store).settings.autoSpeak === false, 'desligar salva');
  await p.close();
  // fallback en-GB e sem voz em inglês
  p = await open('light', [{ name: 'Microsoft George - English (United Kingdom)', lang: 'en-GB', localService: true }, { name: 'Microsoft Maria - Portuguese (Brazil)', lang: 'pt-BR', localService: true }]);
  await p.click_('.qdef .spk[data-act=say]'); await sleep(80); sp = await p.evaluate('__spoken[__spoken.length-1]');
  ok(sp && sp.voice.includes('George') && sp.lang === 'en-GB', 'sem en-US: usa outra voz en-*');
  await p.close();
  for (const vs of [[{ name: 'Microsoft Maria - Portuguese (Brazil)', lang: 'pt-BR', localService: true }], []]) {
    p = await open('light', vs);
    await p.click_('.qdef .spk[data-act=say]'); await sleep(vs.length ? 150 : 1400);
    const tst = await p.$$eval('.toast', a => a.map(e => e.textContent).join(' '));
    ok(await p.evaluate('__spoken.length') === 0 && /Hora e idioma > Fala/.test(tst), 'sem voz em inglês (' + (vs.length ? 'só pt-BR' : 'nenhuma voz') + '): não fala e mostra dica em PT');
    await p.click_('#gear'); await sleep(vs.length ? 100 : 1400);
    ok(await p.$eval('#voiceinfo', e => /Hora e idioma > Fala/.test(e.textContent)), 'Configurações mostram a dica de instalar voz');
    await p.close();
  }
  // novidades mencionam pronúncia
  store = ''; p = await open('light'); await p.click_('#gear'); await p.click_('[data-act=novidades]');
  ok(await p.$eval('#modalc', e => /Pronúncia/.test(e.textContent) && /blank/.test(e.textContent) && /Treinar este conjunto/.test(e.textContent)), 'O que há de novo cita pronúncia, TC/SE e a tabela');
  await p.close();

  console.log('14) Screenshots das Configurações');
  store = JSON.stringify(before);
  for (const [t, file] of [['light', 'settings-light.png'], ['dark', 'settings-dark.png']]) {
    p = await open(t); await p.keyboard.press('Escape'); await sleep(200);
    await p.click_('#gear'); await sleep(300);
    ok(await p.evaluate('document.documentElement.dataset.theme') === t, 'screenshot no tema ' + t);
    await p.screenshot({ path: '/workspace/treino-app/shots/' + file, fullPage: true });
    await p.click_('[data-act=tab][data-v=vocab]'); await sleep(150);
    await p.$eval('#settable', e => e.scrollIntoView({ block: 'center' })); await sleep(100);
    await p.screenshot({ path: '/workspace/treino-app/shots/vocab-sets-' + t + '.png' });
    await p.click_('[data-act=tab][data-v=writing]'); await p.click_('[data-act=wstart]'); await sleep(200);
    await p.screenshot({ path: '/workspace/treino-app/shots/timer-' + t + '.png' });
    await p.close();
  }

  console.log('16) v1.2.1: sessões por modo — trocar de aba não zera, retomar ao reabrir, filtros, migração');
  store = ''; backups = []; p = await open('light');
  const st = () => p.evaluate(() => ({ key: R && R.key, i: R && R.i, n: R && R.n, ok: R && R.ok, done: R && R.done, ids: R ? R.queue.map(x => x.id).join() : '', cur: R && R.cur && R.cur.item.id }));
  const answer = async k => { await p.click_(`[data-act=vpick][data-v="${k || 0}"]`); await p.click_('[data-act=vconfirm]'); };
  for (let i = 0; i < 5; i++) { await answer(i % 4); await p.click_('[data-act=next]'); }
  let a = await st(); let hh = await p.hist();
  ok(a.key === 'def:0' && a.i === 5 && a.n === 5, 'Definições: 5 respondidas (questão 6 de 60)');
  await p.click_('[data-act=vpick][data-v="1"]'); // seleção ainda não confirmada
  await p.click_('[data-act=vmode][data-v=revisao]');
  ok((await st()).key === 'revisao' && await p.has('.qdef'), 'Revisar erros abre a própria sessão');
  await p.click_('[data-act=vmode][data-v=def]');
  let b2 = await st();
  ok(b2.ids === a.ids && b2.i === 5 && b2.n === 5 && b2.ok === a.ok && b2.cur === a.cur, 'voltar para Definições: mesma ordem, mesma questão, mesmos acertos (bug do Renato)');
  ok(await p.$eval('#app', e => /Questão 6 de 60/.test(e.innerText)) && await p.$$eval('.opt.sel', x => x.length === 1 && x[0].dataset.v === '1'), 'mostra "Questão 6 de 60" e mantém a alternativa marcada');
  ok(await p.hist() === hh, 'trocar de aba não registra nem apaga respostas');
  ok(await p.$eval('[data-act=vmode][data-v=def]', e => /5\/60/.test(e.innerText)), 'botão Definições mostra a sessão em andamento (5/60)');
  // menu de cima: Quant e Writing e volta
  await p.click_('[data-act=tab][data-v=quant]'); await p.click_('[data-act=qtype][data-v=MC]'); await p.click_('[data-act=qpick][data-v="0"]'); await p.click_('[data-act=qconfirm]');
  const qa = await st();
  await p.click_('[data-act=tab][data-v=writing]'); await p.click_('[data-act=tab][data-v=prog]'); await p.click_('[data-act=tab][data-v=vocab]');
  b2 = await st(); ok(b2.ids === a.ids && b2.i === 5 && b2.n === 5, 'Quant/Writing/Progresso e volta: Definições intacta');
  await p.click_('[data-act=tab][data-v=quant]');
  let qb = await st(); ok(qb.key === 'quant:MC' && qb.ids === qa.ids && qb.n === 1 && qb.done && await p.has('.fb') && !(await p.has('[data-act=qconfirm]')), 'GRE Quant também guarda a sessão (questão respondida continua respondida)');
  await p.click_('[data-act=qtype][data-v=QC]'); ok((await st()).n === 0, 'Quant: outro tipo = outra sessão');
  await p.click_('[data-act=qtype][data-v=MC]'); ok((await st()).ids === qa.ids && (await st()).n === 1, 'Quant: voltar ao tipo MC retoma');
  ok(await p.$eval('[data-act=qtype][data-v=MC]', e => !!e.querySelector('.dot')), 'Quant: tipo com sessão em andamento tem ponto');
  // confirma mais uma em Definições e "fecha o app"
  await p.click_('[data-act=tab][data-v=vocab]'); await p.click_('[data-act=vconfirm]');
  a = await st(); hh = await p.hist(); ok(a.n === 6 && a.done, '6ª resposta confirmada');
  await sleep(900);
  let sv = JSON.parse(store);
  ok(sv.schemaVersion === 4 && sv.sessoes['def:0'] && sv.sessoes['def:0'].ids.length === 60 && sv.sessoes['def:0'].i === 5 && sv.sessoes['def:0'].n === 6 && sv.sessoes['def:0'].done === true && sv.sessoes['quant:MC'] && !sv.sessoes.revisao, 'progresso.json guarda as sessões em andamento (não as vazias)');
  ok(sv.sessaoUI && sv.sessaoUI.vmode === 'def' && sv.sessaoUI.qtype === 'MC', 'progresso.json guarda modo/filtro atuais');
  ok(sv.historico.length === hh, 'resposta e sessão salvas juntas');
  await p.close();
  console.log('   reabrindo (simula fechar/abrir o app)');
  backups = []; p = await open('light');
  b2 = await st();
  ok(backups.length === 0 && b2.key === 'def:0' && b2.ids === a.ids && b2.i === 5 && b2.n === 6 && b2.ok === a.ok && b2.cur === a.cur && b2.done, 'reaberto: retoma Definições na mesma questão com a mesma ordem e placar');
  ok(await p.has('#resume') && await p.$eval('#resume', e => /Continuar sessão \(6\/60\)/.test(e.innerText) && /Começar nova sessão/.test(e.innerText)), 'mostra "Continuar sessão (6/60)" e "Começar nova sessão"');
  ok(await p.hist() === hh && await p.has('.fb') && !(await p.has('[data-act=vconfirm]')), 'questão já confirmada aparece respondida (sem Confirmar → não conta de novo)');
  await p.enter(); b2 = await st();
  ok(await p.hist() === hh && b2.i === 6 && b2.n === 6 && !b2.done && !(await p.has('#resume')), 'Enter avança sem recontar; aviso some');
  await answer(0); ok(await p.hist() === hh + 1 && (await st()).n === 7, 'nova resposta conta uma vez (7)');
  await p.click_('[data-act=tab][data-v=quant]'); qb = await st();
  ok(qb.key === 'quant:MC' && qb.ids === qa.ids && qb.n === 1 && qb.done, 'Quant MC também retomado após reabrir');
  await sleep(900); await p.close();
  // reabrir e começar nova sessão
  p = await open('light'); const rod0 = await p.evaluate('P.rodadas.length'); hh = await p.hist();
  await p.click_('[data-act=rcont]'); ok(!(await p.has('#resume')) && (await st()).n === 7, '"Continuar sessão" fecha o aviso e segue');
  await p.close(); p = await open('light');
  await p.click_('[data-act=rnewnow]'); b2 = await st();
  ok(b2.key === 'def:0' && b2.n === 0 && b2.i === 0 && b2.ids !== a.ids && !(await p.has('#resume')), '"Começar nova sessão" embaralha de novo e zera a rodada');
  ok(await p.evaluate('P.rodadas.length') === rod0 + 1 && await p.evaluate('P.rodadas[P.rodadas.length-1].total') === 7 && await p.hist() === hh, 'sessão descartada vai para "Últimas rodadas" (7); histórico intacto');
  // filtro de conjunto
  console.log('   filtro de conjunto');
  await answer(0); await p.click_('[data-act=next]'); await answer(1); a = await st(); hh = await p.hist();
  await p.click_('[data-act=vset][data-v="2"]'); b2 = await st();
  ok(b2.key === 'def:2' && b2.n === 0 && await p.evaluate('R.queue.length === 15 && R.queue.every(v => v.set === 2)') && await p.hist() === hh, 'trocar para o conjunto 2 abre outra sessão sem apagar nada');
  ok(await p.$eval('[data-act=vset][data-v="0"]', e => !!e.querySelector('.dot')), 'conjunto "Todos" marcado com ponto (sessão em andamento)');
  await answer(0);
  await p.click_('[data-act=vset][data-v="0"]'); b2 = await st();
  ok(b2.ids === a.ids && b2.n === 2 && b2.done && b2.cur === a.cur, 'voltar para "Todos": sessão anterior intacta (2 respondidas)');
  await p.click_('[data-act=vmode][data-v=frase]'); ok(await p.evaluate('V.set') === 0 && (await st()).key === 'frase:0', 'Frases tem filtro próprio');
  await p.click_('[data-act=vset][data-v="3"]'); await p.click_('[data-act=vmode][data-v=def]');
  ok(await p.evaluate('V.set') === 0 && (await st()).ids === a.ids, 'voltar para Definições restaura o filtro dela');
  await p.click_('[data-act=vmode][data-v=frase]'); ok(await p.evaluate('V.set') === 3, 'e Frases lembra o conjunto 3');
  await p.click_('[data-act=vmode][data-v=def]'); await p.click_('[data-act=vtrain][data-v="2"]');
  b2 = await st(); ok(b2.key === 'def:2' && b2.n === 1, '"Treinar este conjunto" retoma a sessão do conjunto 2');
  const rod1 = await p.evaluate('P.rodadas.length');
  await p.click_('[data-act=rnew]'); b2 = await st(); // confirm() aceito pelo teste
  ok(b2.key === 'def:2' && b2.n === 0 && await p.evaluate('P.rodadas.length') === rod1 + 1, 'botão "Nova sessão" (com confirmação) recomeça só este conjunto');
  // terminar uma rodada e trocar de aba: começa uma nova (sem resultado preso)
  await p.click_('[data-act=vset][data-v="4"]');
  for (let i = 0; i < 15; i++) { await answer(0); await p.click_('[data-act=next]'); }
  ok(await p.has('[data-act=again]'), 'rodada do conjunto 4 concluída');
  await p.click_('[data-act=tab][data-v=quant]'); await p.click_('[data-act=tab][data-v=vocab]');
  ok((await st()).key === 'def:4' && (await st()).n === 0 && await p.has('.qdef'), 'depois de concluída, voltar à aba começa uma rodada nova');
  // Build a Sentence: volta no item ao reabrir
  await p.click_('[data-act=tab][data-v=writing]'); await p.click_('[data-act=wtask][data-v=build]');
  const bLen = D.toeflWriting.buildSentence.practice.length, bi0 = await p.evaluate('B.idx');
  for (let i = 0; i < 2; i++) { await p.click_('[data-act=bchip][data-v="0"]'); await p.click_('[data-confirm]'); await p.click_('[data-act=bnext]'); }
  await p.click_('[data-act=bchip][data-v="0"]');
  await sleep(900); await p.close(); p = await open('light');
  await p.click_('[data-act=tab][data-v=writing]'); await p.click_('[data-act=wtask][data-v=build]');
  ok(await p.evaluate('B.idx') === (bi0 + 2) % bLen && await p.evaluate('B.built.length === 1 && !B.done') && await p.$eval('.built', e => e.querySelectorAll('[data-act=bremove]').length === 1), 'Build a Sentence retoma no mesmo item com o bloco já colocado');
  await p.close();
  // sessões salvas inválidas ou com dados alterados
  sv = JSON.parse(store);
  sv.sessoes['def:1'] = { kind: 'def', mod: 'vocab', label: 'x', set: 1, ids: ['v1', 'nao-existe'], i: 0, n: 1, ok: 0, cur: { id: 'v1', options: [] } };
  sv.sessoes['frase:0'] = 'lixo';
  sv.sessoes['def:3'] = { kind: 'def', mod: 'vocab', label: 'Definições · conjunto 3', set: 3, ids: D.vocab.filter(v => v.set === 3).map(v => v.id), i: 0, n: 1, ok: 1, done: true, lastOk: true, picked: ['definição antiga'], cur: { id: D.vocab.filter(v => v.set === 3)[0].id, options: ['definição antiga', 'b', 'c', 'd'] } };
  sv.sessaoUI = { vmode: 'def', vset: { def: 3, frase: 9 }, qtype: 'XX' };
  store = JSON.stringify(sv);
  const errCount = errors.length;
  p = await open('light'); b2 = await st();
  ok(errors.length === errCount && b2.key === 'def:3' && b2.done && b2.n === 1 && !(await p.has('[data-act=vconfirm]')) && await p.evaluate('R.cur.options.includes(R.cur.item.definition) && !R.cur.options.includes("definição antiga")'), 'sessão com definições antigas: refaz as alternativas, continua respondida (não reconta)');
  ok(await p.evaluate('!SESS["def:1"] && !SESS["frase:0"] && V.sets.frase === 0 && Q.type === ""'), 'sessões inválidas descartadas sem erro; filtros inválidos ignorados');
  await p.close();
  // migração do progresso.json da v1.2 (schema 3)
  console.log('   migração schema 3 (v1.2) → 4');
  const v12 = JSON.parse(JSON.stringify(fresh));
  v12.schemaVersion = 3; v12.appVersion = '1.2'; v12.ultimaVersaoVista = '1.2'; delete v12.sessoes; delete v12.sessaoUI; v12.campoDaV12 = { y: [1, 2] };
  v12.rascunhos = { 'issue:0': 'meu rascunho' }; v12.marcos = { 0: { feito: true, t: '2026-11-02T12:00:00.000Z' } }; v12.erros = { abate: { n: 2, pendente: true } };
  store = JSON.stringify(v12); const orig12 = store; backups = [];
  p = await open('light'); await sleep(300); s = JSON.parse(store);
  ok(backups.length === 1 && backups[0].old === 3 && backups[0].content === orig12, 'v1.2: backup progresso-v3.bak do arquivo original antes de converter');
  ok(s.schemaVersion === 4 && s.appVersion === '1.3.1' && s.sessoes && typeof s.sessoes === 'object' && !Array.isArray(s.sessoes), 'v1.2 → schema 4 com sessoes');
  ok(['historico', 'rodadas', 'redacoes', 'falas', 'erros', 'marcos', 'rascunhos', 'settings', 'campoDaV12', 'criado'].every(k => JSON.stringify(s[k]) === JSON.stringify(v12[k])), 'v1.2: todo o progresso e campos desconhecidos intactos');
  ok(await p.modal() && await p.$eval('#modalc', e => /v1\.3\.1\n/.test(e.innerText) && /v1\.3\n/.test(e.innerText) && /v1\.2\.1/.test(e.innerText) && !/v1\.2\n/.test(e.innerText) && /não zera mais a sessão/.test(e.innerText) && /Visual novo nas questões/.test(e.innerText) && /progresso-v3\.bak/.test(e.innerText)), 'novidades da v1.3 e v1.2.1 (sem v1.2, em PT), cita progresso-v3.bak');
  await p.enter(); await sleep(200);
  for (let i = 0; i < 3; i++) { await answer(0); await p.click_('[data-act=next]'); }
  await p.click_('[data-act=vmode][data-v=revisao]'); await p.click_('[data-act=vmode][data-v=def]');
  ok((await st()).n === 3, 'depois de migrar: trocar de aba mantém a sessão');
  await sleep(900); await p.close();
  backups = []; p = await open('light');
  ok(!(await p.modal()) && backups.length === 0 && (await st()).n === 3 && await p.has('#resume'), 'reabrindo: sem painel, sem novo backup, sessão retomada');
  await p.screenshot({ path: '/workspace/treino-app/shots/v121-continuar-sessao.png' });
  await p.close();
  // importar backup da v1.2 com sessão em andamento de outro arquivo
  store = orig12; p = await open('light'); await p.keyboard.press('Escape'); await sleep(200);
  const withSess = JSON.parse(JSON.stringify(sv)); delete withSess.sessoes['def:1']; delete withSess.sessoes['frase:0'];
  importFile = { name: 'com-sessao.json', content: JSON.stringify(withSess) }; await p.click_('#gear'); await p.click_('[data-act=bimport]'); await p.click_('[data-act=iconfirm]'); await sleep(400);
  await p.click_('[data-act=tab][data-v=vocab]');
  ok((await st()).key === 'def:3' && JSON.parse(store).sessoes['def:3'], 'importar backup traz as sessões em andamento junto');
  await p.close();

  console.log('17) v1.3.1: atualização a partir da v1.2.1, aviso de sessão no idioma da interface');
  const v121 = JSON.parse(store); v121.appVersion = '1.2.1'; v121.ultimaVersaoVista = '1.2.1'; v121.settings.language = 'en';
  store = JSON.stringify(v121); backups = []; p = await open('dark'); await sleep(300);
  ok(await p.modal() && await p.$eval('#modalc', e => /v1\.3\.1\n/.test(e.innerText) && /v1\.3\n/.test(e.innerText) && !/v1\.2\.1/.test(e.innerText) && /New question look/.test(e.innerText) && /Redesigned performance by set/.test(e.innerText)), 'v1.2.1 → v1.3.1: novidades da v1.3.1 e v1.3 (em EN)');
  ok(backups.length === 0 && JSON.parse(store).schemaVersion === 4, 'v1.2.1 → v1.3.1: mesmo schema 4, sem backup de migração');
  await p.enter(); await sleep(200);
  ok(!(await p.modal()) && JSON.parse(store).ultimaVersaoVista === '1.3.1', 'Enter fecha e grava ultimaVersaoVista=1.3.1');
  await p.click_('[data-act=tab][data-v=vocab]');
  ok(await p.has('#resume') && await p.$eval('#resume', e => /Definitions · set 3/.test(e.innerText) && !/Definições|conjunto/.test(e.innerText)), 'aviso "Session in progress" com o nome da sessão em inglês');
  ok(await p.evaluate("roundLabel({key:'quant:MC'}) === 'Quant · Multiple choice' && roundLabel({key:'revisao'}) === 'Mistake review' && roundLabel({key:'frase:0'}) === 'TC/SE sentences · all'"), 'roundLabel traduz todas as chaves');
  ok(await p.$eval('#resume', e => !e.querySelector('.btn.pri')) && await p.$$eval('#app .btn.pri', a => a.length) === 1, 'um só botão principal na tela (Confirmar)');
  await p.close();

  await b.close();
  console.log(`\nRESULTADO: ${pass} ok, ${fail} falhas | erros JS: ${errors.length ? errors.join(' | ') : 'nenhum'}`);
  process.exit(fail || errors.length ? 1 : 0);
})().catch(e => { console.error('FALHA', e); process.exit(1); });
