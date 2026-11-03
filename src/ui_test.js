// Teste headless v1.6.0: pacotes de conteúdo (importar/listar/abrir/remover, Simulados pelo pacote de simulados), atualizações (aviso, Depois, baixar e instalar, reiniciar, erros), download do modelo de fala; v1.5.0: gravação do Speaking (microfone falso), teste do mic, revisão com whisper, IA (chave DPAPI simulada), migração 5→6, "Só esta seção" sem sobrescrever; v1.4.3: confirmações no modal do app (sem diálogo nativo), teste de som do Listening, botões sem quebra; v1.4.2: tempos dos Simulados num formato só; v1.4.1: TPT 3–5 nos Simulados, marcos S4/S6 ligados; v1.4.0: aba Simulados (testes oficiais ETS, conteúdo local), migração schema 4→5; v1.3.2: nome do app muda com o idioma (TalTech Prep Trainer / Treino TalTech); v1.3.1: lista de conjuntos redesenhada (sem quebras, +N); v1.3: cabeçalho novo das questões; v1.2.1: sessões por modo (trocar de aba não zera), retomar após reabrir, filtros, migração schema 3→4; confirmação, migração (v1.0 e v1.1), tema, idioma, exportar/importar, zerar
const puppeteer = require('puppeteer-core'); const fs = require('fs');
const path = require('path');
const SRC = path.join(__dirname);
const html = fs.readFileSync(path.join(SRC, 'index.html'), 'utf8')
  .replace('/*__DATA__*/null', fs.readFileSync(path.join(SRC, 'data.json'), 'utf8').replace(/<\//g, '<\\/'))
  .replace('/*__VER__*/"dev"', '"1.6.0"');
const D = JSON.parse(fs.readFileSync(path.join(SRC, 'data.json')));
const ETSJ = JSON.parse(fs.readFileSync(path.join(SRC, 'ets', 'ets_tests.json'), 'utf8')); let etsMode = 'ok', opened = [], audioFail = () => false;
const RECDIR = '/tmp/uirec'; fs.rmSync(RECDIR, { recursive: true, force: true }); let recFetched = [], recSaved = [], recDeleted = [], evalCalls = [], aiKeys = {}, aiCalls = [], sttOk = true, jobs = {}, jobN = 0;
let packs = [], packPick = null, packCalls = [], packFolderErr = '', updMock = false, updLatest = '1.6.0', updErr = '', updInstallErr = '', updCalls = [], mdlCalls = 0;
let nativeDialogs = [], store = '', backups = [], named = [], exported = null, importFile = null, darkTitle = [], winTitles = [], savedAt = null, errors = [], pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) pass++; else { fail++; console.log('  FALHOU:', msg); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
// contador dos Simulados: textos "Item a de N" / "Itens a–b de N" (ou EN) precisam cobrir 1..N, em ordem, sem buraco, terminando em N
const covers = (txts, N) => { let next = 1; for (const x of txts) { const m = /^(?:Itens|Items) (\d+)–(\d+) (?:de|of) (\d+)$/.exec(x) || /^Item (\d+)() (?:de|of) (\d+)$/.exec(x); if (!m || +m[3] !== N) return false; const a = +m[1], b = m[2] ? +m[2] : a; if (a === next) next = b + 1; else if (!(a >= 1 && b < next)) return false; } return next === N + 1; };
(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
  const VOICES_DEF = [{ name: 'Microsoft George - English (United Kingdom)', lang: 'en-GB', localService: true }, { name: 'Microsoft Zira - English (United States)', lang: 'en-US', localService: true }, { name: 'Microsoft Maria - Portuguese (Brazil)', lang: 'pt-BR', localService: true }];
  async function open(scheme, voices) {
    const p = await b.newPage(); p.__scheme = scheme || 'light'; await p.setViewport({ width: 1180, height: 820 });
    p.on('pageerror', e => errors.push('pageerror: ' + e.message));
    p.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
    p.on('dialog', d => { nativeDialogs.push(d.type() + ': ' + d.message()); console.log('  FALHOU: diálogo nativo do navegador apareceu: ' + d.message()); fail++; d.dismiss().catch(() => {}); });
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
    await p.exposeFunction('goEtsData', () => etsMode === 'ok' ? fs.readFileSync(path.join(SRC, 'ets', 'ets_tests.json'), 'utf8') : '');
    await p.exposeFunction('goEtsAudio', key => { if (audioFail(key) || !/^[a-z0-9]+\/[A-Za-z0-9_]+$/.test(key)) throw new Error('no audio'); return fs.readFileSync(path.join(SRC, 'ets', 'audio', key + '.ogg')).toString('base64'); });
    await p.exposeFunction('goOpenURL', u => { opened.push(u); return null; });
    await p.exposeFunction('goSetTitle', t => { winTitles.push(t); return null; });
    await p.exposeFunction('goSetDarkTitle', d => { darkTitle.push(d); return null; });

    // v1.5.0: gravações + avaliação (fakes do lado Go)
    await p.exposeFunction('goSaveRecording', (test, att, item, webm, wav) => { const rel = test + '/' + att + '/' + item + '.webm', d = path.join(RECDIR, test, att); fs.mkdirSync(d, { recursive: true });
      fs.writeFileSync(path.join(d, item + '.webm'), Buffer.from(webm, 'base64')); if (wav) fs.writeFileSync(path.join(d, item + '.wav'), Buffer.from(wav, 'base64'));
      recSaved.push({ rel, webm: Buffer.from(webm, 'base64').length, wav: wav ? Buffer.from(wav, 'base64').length : 0 }); return { rel, wav: wav ? rel.replace(/\.webm$/, '.wav') : '', bytes: Buffer.from(webm, 'base64').length, abs: 'C:\\Users\\user\\AppData\\Roaming\\TreinoTalTech\\gravacoes\\' + rel.replace(/\//g, '\\') }; });
    await p.exposeFunction('goDeleteRecording', rel => { recDeleted.push(rel); fs.rmSync(path.join(RECDIR, rel), { recursive: true, force: true }); return null; });
    await p.exposeFunction('goOpenRecFolder', rel => { opened.push('rec:' + rel); return null; });
    await p.exposeFunction('goRecInfo', () => ({ bytes: recSaved.reduce((a, r) => a + r.webm + r.wav, 0), files: recSaved.length }));
    await p.exposeFunction('goSttStatus', () => sttOk ? { ok: true, motivo: '', dir: 'C:\\TreinoTalTech\\stt', model: 'C:\\TreinoTalTech\\stt\\ggml-base.en-q5_1.bin' } : { ok: false, motivo: 'sem_modelo', dir: 'C:\\TreinoTalTech\\stt', baixavel: true, modelBytes: 59721011 });
    // trabalhos: left = quantas vezes o poll ainda diz "rodando" (com prog = {bytes,total} para a barra)
    const mkJob = (fn, left, prog) => { const id = 'j' + (++jobN); jobs[id] = { left: left || 1, prog, fn }; return id; };
    await p.exposeFunction('goJobPoll', id => { const j = jobs[id]; if (!j) return { done: true, error: 'job?' }; if (j.left-- > 0) return Object.assign({ done: false }, j.prog || {});
      if (!j.r) { try { j.r = { done: true, result: j.fn() }; } catch (e) { j.r = { done: true, error: e.message }; } } return j.r; });
    // v1.6.0: pacotes de conteúdo (fakes do lado Go)
    await p.exposeFunction('goPackPick', () => { packCalls.push('pick'); return packPick ? JSON.parse(JSON.stringify(packPick)) : null; });
    await p.exposeFunction('goPackImportStart', () => { packCalls.push('import'); const pv = packPick; packPick = null; if (!pv) throw new Error('pac:nada_escolhido');
      return mkJob(() => { if (pv.fail) throw new Error(pv.fail); const pk = Object.assign({}, pv, { installed: '2026-11-02T12:00:00-03:00', dir: 'C:\\Users\\user\\AppData\\Roaming\\TreinoTalTech\\conteudo\\' + pv.id }); delete pk.file; delete pk.existing;
        packs = packs.filter(x => x.id !== pv.id).concat(pk).sort((a, b) => a.id < b.id ? -1 : 1); if (pv.type === 'ets') etsMode = 'ok'; return pk; }, 3, { bytes: 4 << 20, total: 10 << 20 }); });
    await p.exposeFunction('goPackList', () => JSON.parse(JSON.stringify(packs)));
    await p.exposeFunction('goPackRemove', id => { packCalls.push('rm:' + id); const pk = packs.find(x => x.id === id); if (!pk) throw new Error('pac:nao_instalado'); packs = packs.filter(x => x.id !== id); if (pk.type === 'ets') etsMode = 'none'; return null; });
    await p.exposeFunction('goPackOpenFile', (id, rel) => { packCalls.push('open:' + id + ':' + rel); return null; });
    await p.exposeFunction('goPackOpenFolder', id => { packCalls.push('folder:' + id); if (packFolderErr) throw new Error(packFolderErr); return null; });
    // v1.6.0: atualizações (só expostas quando updMock, para não disparar a procura automática nos outros testes)
    if (updMock) {
      await p.exposeFunction('goUpdateCheckStart', () => { updCalls.push('check'); return mkJob(() => { if (updErr) throw new Error(updErr); return { current: '1.6.0', latest: updLatest, tag: 'v' + updLatest, newer: updLatest !== '1.6.0', name: 'v' + updLatest, notes: '## Novidades\n- Melhorias nos Simulados\n- Correções', page: 'https://github.com/RenatoSouzaAN/taltech-prep-trainer/releases/tag/v' + updLatest, published: '2026-11-20T10:00:00Z', asset: { name: 'TreinoTalTech-v' + updLatest + '.zip', size: 10485760, url: 'https://github.com/x' }, sha256: 'ab'.repeat(32), shaFrom: 'arquivo' }; }); });
      await p.exposeFunction('goUpdateInstallStart', () => { updCalls.push('install'); return mkJob(() => { if (updInstallErr) throw new Error(updInstallErr); return { version: updLatest, files: 12, verified: true }; }, 3, { bytes: 6 << 20, total: 10 << 20 }); });
      await p.exposeFunction('goUpdateRestart', () => { updCalls.push('restart:' + (store ? JSON.parse(store).settings.atualizacoes ? 'saved' : 'nocfg' : 'nostore')); return null; });
    }
    await p.exposeFunction('goModelDownloadStart', () => { mdlCalls++; return mkJob(() => { sttOk = true; return { path: 'x' }; }, 3, { bytes: 20 << 20, total: 59721011 }); });
    await p.exposeFunction('goEvalStart', (kind, rel, ref) => { evalCalls.push({ kind, rel, ref }); return mkJob(() => {
      if (!fs.existsSync(path.join(RECDIR, rel.replace(/\.webm$/, '.wav')))) throw new Error('stt:sem_wav');
      if (kind === 'repeat') { const w = ref.replace(/[^A-Za-z' ]/g, '').split(/\s+/).filter(Boolean), said = w.slice(0, -1); const ops = w.map((x, i) => i < w.length - 1 ? { op: 'ok', ref: x } : { op: 'del', ref: x });
        return { kind, texto: said.join(' '), acc: Math.round(100 * (w.length - 1) / w.length), nota: 4, ops, erros: 1, faltou: 1, trocou: 0, sobrou: 0, motivos: ['lr_minor'] }; }
      return { kind, texto: 'I think the library is the best place to study because it is quiet um and I can focus on my work.', metricas: { palavras: 21, segundos: 12.4, inicio: 1.2, wpm: 101.6, pausas: 1, maiorPausa: 1.7, hesitacoes: 1, ttr: 0.81, frases: 1, repetidas: 1 }, nota: 2, motivos: ['iv_short', 'iv_onesentence'] }; }); });
    await p.exposeFunction('goAiStatus', () => ({ keys: { openai: { has: !!aiKeys.openai, hint: aiKeys.openai ? '…' + aiKeys.openai.slice(-4) : '', bad: false }, gemini: { has: !!aiKeys.gemini, hint: aiKeys.gemini ? '…' + aiKeys.gemini.slice(-4) : '', bad: false } }, defaults: { openai: 'gpt-6.1-sol', gemini: 'gemini-3.8-flash' }, secure: true }));
    await p.exposeFunction('goAiSetKey', (pv, k) => { if (k.length < 8) throw new Error('ia:chave_curta'); aiKeys[pv] = k; return null; });
    await p.exposeFunction('goAiRemoveKey', pv => { delete aiKeys[pv]; return null; });
    await p.exposeFunction('goAiTestStart', (pv, m) => { aiCalls.push({ test: pv, m }); return mkJob(() => { if (!aiKeys[pv]) throw new Error('ia:sem_chave'); return { provider: pv, model: m || 'gpt-6.1-sol' }; }); });
    await p.exposeFunction('goAiGradeStart', js => { const r = JSON.parse(js); aiCalls.push({ grade: r }); return mkJob(() => ({ score: 3, max: r.max || 5, summary: 'Clear answer with a few grammar slips.', criteria: [{ name: 'Task', score: 3, note: 'On topic.' }], strengths: ['Clear position'], improvements: ['Add one example'], corrections: [{ from: 'peoples', to: 'people', why: 'plural' }], provider: r.provider || 'openai', model: r.model || 'gpt-6.1-sol', basis: 'transcript', rubricSource: 'local', t: new Date().toISOString() })); });
    if (p.__scheme) await p.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: p.__scheme }]);
    const stub = `<script>(function(vs){window.__spoken=[];window.SpeechSynthesisUtterance=function(t){this.text=t;this.rate=1;this.lang='';this.voice=null;};
      var ss={speaking:false,getVoices:function(){return vs.slice();},speak:function(u){window.__spoken.push({text:u.text,rate:u.rate,voice:u.voice&&u.voice.name,lang:u.lang});},cancel:function(){},addEventListener:function(){},removeEventListener:function(){}};
      Object.defineProperty(window,'speechSynthesis',{value:ss,configurable:true});})(${JSON.stringify(voices || VOICES_DEF)});<\/script>`;
    // v1.5.0: como no app, a página vem de https://app.treinotaltech.example (contexto seguro → microfone) e as gravações de https://rec.treinotaltech.example
    const page = html.replace('<head>', '<head>' + stub.replace('<\\/script>', '</' + 'script>'));
    await p.setRequestInterception(true);
    p.on('request', r => { const u = new URL(r.url());
      if (u.hostname === 'app.treinotaltech.example') return r.respond({ status: 200, contentType: 'text/html; charset=utf-8', body: page });
      if (u.hostname === 'rec.treinotaltech.example') { const f = path.join(RECDIR, decodeURIComponent(u.pathname)); recFetched.push(u.pathname); return fs.existsSync(f) ? r.respond({ status: 200, contentType: f.endsWith('.wav') ? 'audio/wav' : 'audio/webm', body: fs.readFileSync(f) }) : r.respond({ status: 404, body: '' }); }
      r.continue(); });
    await p.goto('https://app.treinotaltech.example/'); await p.waitForFunction('window.__ready === true'); await sleep(150);
    p.click_ = async sel => { await p.$eval(sel, e => e.click()); await sleep(40); };
    p.has = async sel => !!(await p.$(sel));
    p.enter = async () => { await p.keyboard.press('Enter'); await sleep(60); };
    p.hist = () => p.evaluate('P.historico.length');
    p.confirmDisabled = () => p.$eval('[data-confirm]', e => e.disabled);
    p.modal = () => p.$eval('#modal', e => e.style.display === 'flex');
    p.cfOpen = () => p.$eval('#modal', e => e.style.display === 'flex' && e.dataset.cf === '1');
    // confirmação do app (appConfirm): se abriu, clica no botão principal
    p.cfIf = async (ms = 400) => { try { await p.waitForSelector('#modal[data-cf="1"] [data-act=cfok]', { visible: true, timeout: ms }); } catch (e) { return false; } await p.click_('#modal [data-act=cfok]'); await sleep(60); return true; };
    p.cf = async () => { const r = await p.cfIf(2000); ok(r, 'confirmação do app apareceu (' + (new Error().stack.split('\n')[2] || '').trim() + ')'); };
    return p;
  }

  console.log('1) Instalação nova');
  let p = await open();
  ok(await p.$eval('#ver', e => e.textContent.includes('1.6.0')), 'versão v1.6.0 no cabeçalho');
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
  ok(fresh.schemaVersion === 6 && fresh.appVersion === '1.6.0' && fresh.ultimaVersaoVista === '1.6.0' && fresh.settings.theme === 'system' && fresh.settings.language === 'pt', 'instalação nova salva schemaVersion 6 / appVersion 1.6.0 / settings padrão');
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
  ok(s.schemaVersion === 6 && s.appVersion === '1.6.0' && s.settings && s.settings.theme === 'system' && s.settings.language === 'pt', 'v1.0 migrado direto para schemaVersion 5 com settings');
  ok(JSON.stringify(s.campoFuturo) === JSON.stringify(v10.campoFuturo) && s.historico[0].extraX === 42, 'campos desconhecidos preservados');
  ok(['historico', 'rodadas', 'redacoes', 'falas', 'rascunhos', 'erros', 'marcos', 'criado'].every(k => JSON.stringify(s[k]) === JSON.stringify(v10[k])), 'todo o progresso v1.0 intacto (histórico, rodadas, redações, falas, rascunhos, erros, marcos)');
  ok(await p.modal() && await p.$eval('#modalc', e => /O que há de novo/.test(e.innerText) && /v1\.2/.test(e.innerText) && /v1\.1/.test(e.innerText) && /progresso-v1\.bak/.test(e.innerText)), 'painel "O que há de novo" aparece, cita o backup');
    await p.enter(); await sleep(300);
  ok(!(await p.modal()) && JSON.parse(store).ultimaVersaoVista === '1.6.0', 'Enter fecha o painel e grava ultimaVersaoVista=1.6.0');
  await p.close();
  backups = []; p = await open();
  ok(!(await p.modal()) && backups.length === 0, 'reabrindo: painel não reaparece, sem novo backup');
  await p.click_('#ver'); ok(await p.modal(), 'clicar em "v1.2" reabre as novidades');
  await p.keyboard.press('Escape'); await sleep(50); ok(!(await p.modal()), 'Esc fecha');
  await p.click_('[data-act=tab][data-v=prog]'); await sleep(100);
  ok(await p.$$eval('[data-ms]:checked', a => a.length) === Object.values(v10.marcos).filter(m => m.feito).length, 'marcos da v1.0 continuam marcados na tela');
  await p.close();

  console.log('7) Arquivo de versão mais nova (schemaVersion 7) não é rebaixado');
  store = JSON.stringify({ ...v10, schemaVersion: 7, appVersion: '1.6', ultimaVersaoVista: '1.6', novoDaV15: true }); backups = [];
  p = await open();
  await p.click_('[data-act=vpick][data-v="0"]'); await p.enter(); await sleep(900);
  s = JSON.parse(store);
  ok(backups.length === 0 && s.schemaVersion === 7 && s.appVersion === '1.6' && s.novoDaV15 === true && !(await p.modal()), 'schema 7 mantido, campos novos preservados, sem painel');
  await p.close();

  console.log('8) Migração de dados da v1.1 (schema 2)');
  const v11 = JSON.parse(JSON.stringify(fresh));
  v11.schemaVersion = 2; v11.appVersion = '1.1'; v11.ultimaVersaoVista = '1.1'; delete v11.settings; v11.campoDaV11 = { x: 1 };
  store = JSON.stringify(v11); const orig11 = store; backups = [];
  p = await open();
  await sleep(300); s = JSON.parse(store);
  ok(backups.length === 1 && backups[0].old === 2 && backups[0].content === orig11, 'v1.1: backup (progresso-v2.bak) do arquivo original antes de converter');
  ok(s.schemaVersion === 6 && s.settings.theme === 'system' && s.settings.language === 'pt', 'v1.1 → schema 5 com settings padrão');
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
  ok(await p.$eval('#brand', e => e.textContent) === 'Treino TalTech' && await p.evaluate('document.title') === 'Treino TalTech v1.6.0 | GRE + TOEFL' && winTitles[winTitles.length - 1] === 'Treino TalTech v1.6.0 | GRE + TOEFL', 'v1.3.2: em PT o nome é Treino TalTech (topo, document.title, janela)');
  ok(await p.$eval('#s-about', e => /Treino TalTech/.test(e.innerText)), 'v1.3.2: Sobre mostra Treino TalTech em PT');
  winTitles = [];
  await p.click_('[data-act=lang][data-v=en]'); await sleep(300);
  ok(JSON.parse(store).settings.language === 'en' && await p.evaluate('document.documentElement.lang') === 'en', 'English salvo; <html lang=en>');
  ok(await p.$eval('#nav', e => /Progress\b/.test(e.innerText) && !/Progresso/.test(e.innerText)) && await p.$eval('#gear', e => e.title === 'Settings'), 'menu e engrenagem em inglês');
  ok(await p.$eval('#brand', e => e.textContent) === 'TalTech Prep Trainer' && await p.evaluate('document.title') === 'TalTech Prep Trainer v1.6.0 | GRE + TOEFL' && winTitles[winTitles.length - 1] === 'TalTech Prep Trainer v1.6.0 | GRE + TOEFL', 'v1.3.2: trocar para EN muda o nome na hora (topo, document.title, goSetTitle)');
  ok(await p.$eval('#s-about', e => /TalTech Prep Trainer/.test(e.innerText) && !/Treino TalTech/.test(e.innerText)), 'v1.3.2: Sobre mostra TalTech Prep Trainer em EN');
  ok(await p.$eval('header', e => !/Treino TalTech/.test(e.innerText)), 'v1.3.2: nenhum "Treino TalTech" no topo em EN');
  await p.click_('[data-act=lang][data-v=pt]'); await sleep(200);
  ok(await p.$eval('#brand', e => e.textContent) === 'Treino TalTech' && winTitles[winTitles.length - 1] === 'Treino TalTech v1.6.0 | GRE + TOEFL', 'v1.3.2: voltar para PT restaura o nome na hora');
  await p.click_('[data-act=lang][data-v=en]'); await sleep(200);
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
  ok(s.historico.length === before.historico.length && s.redacoes.length === before.redacoes.length && s.campoDaV11.x === 1 && s.schemaVersion === 6, 'ida e volta: progresso restaurado (inclui campos extras)');
  ok(!(await p.modal()) && await p.has('#s-data'), 'modal fecha e volta às Configurações');
  // importar um backup da v1.0 (sem schema) → migrado
  importFile = { name: 'antigo-v10.json', content: JSON.stringify(v10) }; await p.click_('[data-act=bimport]'); await p.click_('[data-act=iconfirm]'); await sleep(400);
  s = JSON.parse(store); ok(s.schemaVersion === 6 && s.versaoLegada !== undefined && s.settings.theme === 'system', 'importar backup antigo (v1.0) migra para schema 5');
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
  ok(s.settings.theme === 'system' && s.settings.language === 'pt' && s.schemaVersion === 6 && s.ultimaVersaoVista === '1.6.0' && Object.keys(s.sessoes).length === 0, 'tema/idioma mantidos, sessões limpas; sem painel de novidades depois');
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
  ok(sv.schemaVersion === 6 && sv.sessoes['def:0'] && sv.sessoes['def:0'].ids.length === 60 && sv.sessoes['def:0'].i === 5 && sv.sessoes['def:0'].n === 6 && sv.sessoes['def:0'].done === true && sv.sessoes['quant:MC'] && !sv.sessoes.revisao, 'progresso.json guarda as sessões em andamento (não as vazias)');
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
  await p.click_('[data-act=rnew]'); await p.cf(); b2 = await st(); // v1.4.3: confirmação do app
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
  ok(s.schemaVersion === 6 && s.appVersion === '1.6.0' && s.sessoes && typeof s.sessoes === 'object' && !Array.isArray(s.sessoes), 'v1.2 → schema 5 com sessoes');
  ok(['historico', 'rodadas', 'redacoes', 'falas', 'erros', 'marcos', 'rascunhos', 'settings', 'campoDaV12', 'criado'].every(k => k === 'settings' ? JSON.stringify({ ...s[k], gravar: undefined, ia: undefined }) === JSON.stringify({ ...v12[k], gravar: undefined, ia: undefined }) : JSON.stringify(s[k]) === JSON.stringify(v12[k])) || console.log('   difere: ' + ['historico', 'rodadas', 'redacoes', 'falas', 'erros', 'marcos', 'rascunhos', 'settings', 'campoDaV12', 'criado'].filter(k => JSON.stringify(s[k]) !== JSON.stringify(v12[k])).join(',')), 'v1.2: todo o progresso e campos desconhecidos intactos');
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

  console.log('17) v1.3.2: atualização a partir da v1.2.1, aviso de sessão no idioma da interface');
  const v121 = JSON.parse(store); v121.appVersion = '1.2.1'; v121.ultimaVersaoVista = '1.2.1'; v121.schemaVersion = 4; delete v121.simulados; delete v121.simuladoAtual; v121.settings.language = 'en';
  store = JSON.stringify(v121); backups = []; p = await open('dark'); await sleep(300);
  ok(await p.modal() && await p.$eval('#modalc', e => /v1\.4\.0\n/.test(e.innerText) && /Practice tests tab/.test(e.innerText) && /v1\.3\.2\n/.test(e.innerText) && /v1\.3\.1\n/.test(e.innerText) && /v1\.3\n/.test(e.innerText) && !/v1\.2\.1/.test(e.innerText) && /TalTech Prep Trainer/.test(e.innerText) && /New question look/.test(e.innerText) && /Redesigned performance by set/.test(e.innerText)), 'v1.2.1 → v1.4.0: novidades da v1.4.0, v1.3.2, v1.3.1 e v1.3 (em EN)');
  ok(backups.length === 1 && backups[0].old === 4 && JSON.parse(store).schemaVersion === 6 && Array.isArray(JSON.parse(store).simulados) && JSON.parse(store).simuladoAtual === null, 'v1.2.1 → v1.4.0: schema 4 → 5 com backup e simulados vazios');
  await p.enter(); await sleep(200);
  ok(!(await p.modal()) && JSON.parse(store).ultimaVersaoVista === '1.6.0', 'Enter fecha e grava ultimaVersaoVista=1.6.0');
  await p.click_('[data-act=tab][data-v=vocab]');
  ok(await p.has('#resume') && await p.$eval('#resume', e => /Definitions · set 3/.test(e.innerText) && !/Definições|conjunto/.test(e.innerText)), 'aviso "Session in progress" com o nome da sessão em inglês');
  ok(await p.evaluate("roundLabel({key:'quant:MC'}) === 'Quant · Multiple choice' && roundLabel({key:'revisao'}) === 'Mistake review' && roundLabel({key:'frase:0'}) === 'TC/SE sentences · all'"), 'roundLabel traduz todas as chaves');
  ok(await p.$eval('#resume', e => !e.querySelector('.btn.pri')) && await p.$$eval('#app .btn.pri', a => a.length) === 1, 'um só botão principal na tela (Confirmar)');
  await p.close();


  console.log('18) v1.4.0: Simulados (pacote de simulados)');
  const SH = n => '/workspace/treino-app/shots/v14-' + n + '.png';
  const onePri = async (pp, msg) => ok(await pp.$$eval('#app .btn.pri', a => a.length) === 1, 'um só botão principal: ' + msg);
  const simA = pp => pp.evaluate('JSON.parse(JSON.stringify(P.simuladoAtual))');
  // 18a) sem o conteúdo oficial (build do repositório público)
  etsMode = 'none'; store = ''; opened = []; p = await open('light'); await p.keyboard.press('Escape'); await sleep(100);
  ok(await p.$eval('nav', e => /Simulados/.test(e.innerText)), 'aba Simulados no menu');
  await p.click_('[data-act=tab][data-v=sim]'); await sleep(100);
  ok(await p.has('#simnone') && await p.$eval('#simnone h2', e => e.innerText === 'Nenhum conteúdo de simulado instalado. Importe um pacote de conteúdo em Configurações.' && !/—/.test(e.innerText)), 'v1.6.0: sem conteúdo: "Nenhum conteúdo de simulado instalado. Importe um pacote de conteúdo em Configurações." (sem travessão)');
  ok(await p.$eval('#simnone', e => !/ETS|oficia|pack\.zip/i.test(e.innerText)), 'v1.6.0: sem conteúdo: texto genérico (não cita pacote ETS nem conteúdo oficial)');
  ok(await p.has('#simnone [data-act=pkimport]'), 'v1.6.0: sem conteúdo: botão Importar pacote (.zip) na própria aba');
  await onePri(p, 'sem conteúdo');
  await p.screenshot({ path: SH('sem-conteudo') }); await p.screenshot({ path: '/workspace/treino-app/shots/v160-simulados-vazio.png' });
  ok(!(await p.has('#simets')), 'v1.6.0: sem conteúdo: sem botão para página externa');
  await p.evaluate('P.settings.language = "en"; render()'); await sleep(120);
  ok(await p.$eval('#simnone h2', e => e.innerText === 'No practice-test content installed. Import a content pack in Settings.') && await p.$eval('#simnone', e => !/ETS|official|pack\.zip/i.test(e.innerText)), 'v1.6.0: sem conteúdo em EN: "No practice-test content installed. Import a content pack in Settings."');
  await p.screenshot({ path: '/workspace/treino-app/shots/v160-simulados-vazio-en.png' });
  await p.evaluate('P.settings.language = "pt"; render()'); await sleep(120);
  await p.click_('[data-act=tab][data-v=prog]'); await sleep(80);
  ok(!(await p.has('label.ms [data-act=simopen]')) && await p.$eval('#app', e => !/Não incluído no app/.test(e.innerText)), 'sem conteúdo: marcos sem botão Iniciar e sem dica de PDF');
  await p.close();

  // 18b) com o conteúdo: lista, detalhe, Reading
  etsMode = 'ok'; store = ''; opened = []; audioFail = () => false; p = await open('light'); await p.keyboard.press('Escape'); await sleep(100);
  await p.evaluate('window.__simRate = 16');
  await p.click_('[data-act=tab][data-v=sim]'); await sleep(100);
  ok(JSON.stringify(await p.$$eval('tr[data-test]', a => a.map(e => e.dataset.test))) === '["flpt1","tpt1","tpt2","tpt3","flpt2","tpt4","tpt5"]', 'v1.4.1: lista com os 7 testes na ordem do plano (FLPT 1, TPT 1, TPT 2, TPT 3, FLPT 2, TPT 4, TPT 5)');
  await p.screenshot({ path: '/workspace/treino-app/shots/v141-lista.png', fullPage: true });
  ok(await p.$eval('tr[data-test=flpt1] .btn', e => e.classList.contains('pri')), 'próximo do plano (FLPT 1) é o botão principal');
  ok(await p.$eval('#app', e => !/Não incluídos/.test(e.innerText)), 'v1.4.1: a nota "Não incluídos: TPT 3–5" saiu');
  await onePri(p, 'lista'); await p.screenshot({ path: SH('lista'), fullPage: true });
  await p.click_('tr[data-test=flpt1] .btn'); await sleep(80);
  ok(await p.has('#simdetail') && await p.$$eval('[data-act=simgo]', a => a.length) === 5, 'detalhe: 4 seções + simulado completo');
  ok(await p.$eval('#app', e => /12:00 \+ 12:00/.test(e.innerText) === false && /Só pontos|ritmo por item/.test(e.innerText)), 'detalhe: explicação do tempo, sem mm:ss na tabela');
  const tms = await p.$$eval('#simdetail ~ .card tr td:nth-child(3)', a => a.map(e => e.textContent));
  console.log('   tempos: ' + tms.join(' | '));
  ok(tms.length === 4 && tms[0] === '24 min (12 + 12)' && /^~?2[01] min \(1[01] \+ 1[01]\)$/.test(tms[1]) && tms[2] === '23 min (6 + 7 + 10)' && /^~\d+ min \(\d+ itens\)$/.test(tms[3]), 'v1.4.2: coluna Tempo num formato só (total em min + módulos)');
  await p.screenshot({ path: '/workspace/treino-app/shots/v142-tempos.png', fullPage: true });
  { const gaps = await p.evaluate(() => { const out = [];
      for (const t of ETS.tests || []) for (const s of ['R1', 'R2', 'L1', 'L2']) {
        const n = simItems(t, s), pages = s[0] === 'R' ? rPages(t.reading[+s[1] - 1]).length : t.listening[+s[1] - 1].length, seen = new Array(n + 1).fill(0); let prev = 0;
        for (let i = 0; i < pages; i++) { const [a, b] = simRange(t, s, i); if (a !== prev + 1) out.push(`${t.id} ${s} tela ${i + 1}: começa em ${a}, esperado ${prev + 1}`); for (let k = a; k <= b; k++) seen[k]++; prev = b; }
        for (let k = 1; k <= n; k++) if (seen[k] !== 1) out.push(`${t.id} ${s} item ${k} aparece ${seen[k]}x`);
        if (prev !== n) out.push(`${t.id} ${s}: última tela termina em ${prev}, N = ${n}`);
        if (s[0] === 'L') t.listening[+s[1] - 1].forEach((g, i) => { const [a] = simRange(t, s, i); g.qs.forEach((q, j) => { if (q.n !== a + j) out.push(`${t.id} ${s} q.n ${q.n} ≠ ${a + j}`); }); });
        else { const m = t.reading[+s[1] - 1]; rPages(m).forEach((pg, i) => { if (pg.k === 'q') { const [a] = simRange(t, s, i); if (pg.q.n !== a) out.push(`${t.id} ${s} q.n ${pg.q.n} ≠ ${a}`); } }); }
      } return { out, tests: (ETS.tests || []).length }; });
    console.log('   lacunas na numeração: ' + (gaps.out.length ? gaps.out.join(' | ') : 'nenhuma') + ` (${gaps.tests} testes × R1 R2 L1 L2)`);
    const en = await p.evaluate(() => { const t = ETS.tests[0], A = { test: t.id, phase: 'intro' }; P.settings.language = 'en'; const r = [simBar(A, t, 'L2', 13, 16, 16), simBar(A, t, 'L2', 7, 16)]; P.settings.language = 'pt'; return r.map(h => { const d = document.createElement('div'); d.innerHTML = h; return d.querySelector('#simcount').textContent + '/' + d.querySelector('.qprog i').style.width; }); });
    ok(en[0] === 'Items 13–16 of 16/100%' && en[1] === 'Item 7 of 16/44%', 'v1.4.3: contador em inglês (' + en.join(', ') + ')');
    ok(gaps.tests === 7 && !gaps.out.length, 'v1.4.3: todo item 1..N de cada módulo de Reading/Listening aparece uma vez só, sem pular'); }
  await onePri(p, 'detalhe'); await p.screenshot({ path: SH('detalhe'), fullPage: true });
  // v1.4.3: nenhum botão quebra linha (900 e 1180 px)
  const wrapped = () => p.evaluate(() => [...document.querySelectorAll('#app .btn, nav .btn, header .btn')].filter(e => e.offsetParent).filter(e => { const r = document.createRange(); r.selectNodeContents(e); const ls = new Set([...r.getClientRects()].map(x => Math.round(x.top))); return ls.size > 1; }).map(e => e.innerText.trim()));
  for (const w of [900, 1180]) { await p.setViewport({ width: w, height: 820 }); await sleep(80); const wr = await wrapped(); ok(!wr.length, `v1.4.3: botões sem quebra de linha em ${w}px` + (wr.length ? ': ' + wr.join(' | ') : '')); ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `sem rolagem horizontal em ${w}px`); if (w === 900) await p.screenshot({ path: '/workspace/treino-app/shots/v143-detalhe-900.png', fullPage: true }); }
  ok(await p.$$eval('#simdetail ~ .card [data-act=simgo]:not([data-v=full])', a => a.length === 4 && a.every(e => getComputedStyle(e).whiteSpace === 'nowrap' && e.innerText.trim() === 'Só esta seção')), 'v1.4.3: "Só esta seção" com nowrap');
  await p.screenshot({ path: '/workspace/treino-app/shots/v143-detalhe.png', fullPage: true });
  await p.click_('[data-act=simlist]'); await p.setViewport({ width: 900, height: 820 }); await sleep(60); { const wr = await wrapped(); ok(!wr.length, 'v1.4.3: lista de simulados sem quebra em 900px' + (wr.length ? ': ' + wr.join(' | ') : '')); }
  await p.setViewport({ width: 1180, height: 820 }); await p.click_('tr[data-test=flpt1] .btn'); await sleep(80);
  await p.click_('[data-act=simgo][data-v=reading]'); await sleep(80);
  ok(await p.has('#simintro') && !(await p.has('#tmr')), 'introdução da etapa, cronômetro ainda parado'); await onePri(p, 'introdução');
  await p.screenshot({ path: SH('intro') });
  await p.enter(); await sleep(150);
  const F1 = ETSJ.tests.find(t => t.id === 'flpt1'), ctw1 = F1.reading[0].ctw.filter(x => typeof x === 'object');
  ok(await p.$$eval('input.ctw', a => a.length) === ctw1.length && ctw1.length === 10, 'Complete the Words: 10 lacunas');
  const t0 = await p.$eval('#tmr', e => e.textContent); ok(t0 === '12:00' || t0 === '11:59', 'cronômetro do módulo começa em 12:00 (' + t0 + ')');
  await p.focus('input.ctw');
  for (let i = 0; i < ctw1.length; i++) { const x = ctw1[i]; const typed = i === 3 ? 'z' : x.ans; await p.keyboard.type(typed); if (typed.length < x.len) await p.keyboard.press('Enter'); }
  await sleep(100);
  let A = await simA(p);
  ok(Object.keys(A.ans.R1.ctw).length === 10 && A.ans.R1.ctw[ctw1[0].n] === ctw1[0].ans, 'lacunas gravadas no progresso; o foco pula sozinho para a próxima');
  await onePri(p, 'Reading CtW'); await p.screenshot({ path: SH('reading-ctw') });
  await p.click_('[data-act=simnext]'); await sleep(80);
  ok(await p.has('.simgrid #simq') && await p.$$eval('#simq [data-act=spick]', a => a.length) === 4, 'questão de múltipla escolha com texto ao lado');
  await p.keyboard.press('2'); await sleep(60); A = await simA(p);
  ok(Object.values(A.ans.R1.q)[0] === 1, 'tecla 2 escolhe a opção (B)');
  await onePri(p, 'Reading MCQ'); await p.screenshot({ path: SH('reading-mcq') });
  // sai da aba no meio e volta: tempo e respostas guardados
  await sleep(1200); await p.click_('[data-act=tab][data-v=vocab]'); await sleep(80); A = await simA(p);
  ok(A.left < 720 && A.left > 700 && JSON.parse(store).simuladoAtual && JSON.parse(store).simuladoAtual.left === A.left, 'trocar de aba pausa e grava o tempo restante (' + Math.round(A.left) + ' s)');
  await p.click_('[data-act=tab][data-v=sim]'); await sleep(80);
  ok(await p.has('#tmr') && await p.has('#simq'), 'voltar à aba continua a etapa');
  const qs1 = [].concat(...F1.reading[0].groups.map(g => g.qs));
  // v1.4.3: "Encerrar módulo" abre o modal do app (não o confirm() nativo)
  { const pg0 = await p.evaluate('P.simuladoAtual.page'); await p.evaluate('P.simuladoAtual.page = 999; render()'); await sleep(60);
    await p.click_('[data-act=simend]'); await sleep(80);
    ok(await p.cfOpen(), 'v1.4.3: encerrar abre o modal do app');
    const mt = await p.$eval('#modalc', e => e.innerText); const nq = qs1.length - 1;
    ok(/Encerrar módulo\?/.test(mt) && /Você não poderá voltar a este módulo\./.test(mt) && new RegExp(nq + ' questões sem resposta').test(mt), 'v1.4.3: título, aviso e "' + nq + ' questões sem resposta"');
    ok(await p.$eval('#modal [data-act=cfok]', e => e.innerText.trim() === 'Encerrar') && await p.$eval('#modal [data-act=cfno]', e => e.innerText.trim() === 'Continuar respondendo'), 'v1.4.3: botões Encerrar / Continuar respondendo');
    ok(await p.evaluate(() => document.activeElement && document.activeElement.dataset.act === 'cfok'), 'v1.4.3: foco no botão principal');
    await p.keyboard.press('Tab'); ok(await p.evaluate(() => document.activeElement.dataset.act === 'cfno'), 'Tab vai para "Continuar respondendo"');
    await p.keyboard.press('Tab'); ok(await p.evaluate(() => document.activeElement.dataset.act === 'cfok'), 'Tab volta ao início (foco preso no modal)');
    await p.keyboard.down('Shift'); await p.keyboard.press('Tab'); await p.keyboard.up('Shift'); ok(await p.evaluate(() => document.activeElement.dataset.act === 'cfno'), 'Shift+Tab também fica no modal');
    await p.keyboard.press('Tab');
    await p.keyboard.press('3'); await sleep(40); ok(await p.cfOpen(), 'teclas 1–6 não agem por trás do modal');
    const ta = await p.$eval('#tmr', e => e.textContent); await sleep(1300); const tb = await p.$eval('#tmr', e => e.textContent);
    ok(ta !== tb, 'v1.4.3: o cronômetro continua com o modal aberto (' + ta + ' → ' + tb + ')');
    await p.screenshot({ path: '/workspace/treino-app/shots/v143-modal.png' });
    await p.keyboard.press('Escape'); await sleep(60);
    ok(!(await p.modal()) && await p.evaluate('P.simuladoAtual.steps[P.simuladoAtual.si] === "R1"') && await p.has('#tmr'), 'v1.4.3: Esc = continuar respondendo (fica no módulo)');
    await p.click_('[data-act=simend]'); await sleep(60); await p.click_('#modal [data-act=cfno]'); await sleep(60);
    ok(!(await p.modal()) && await p.evaluate('P.simuladoAtual.si === 0'), '"Continuar respondendo" fecha e fica no módulo');
    await p.click_('[data-act=simend]'); await sleep(60); await p.click_('#modal'); await sleep(60);
    ok(!(await p.modal()) && await p.evaluate('P.simuladoAtual.si === 0'), 'clicar fora do modal = cancelar');
    await p.evaluate(pg => { P.simuladoAtual.page = pg; render(); }, pg0); await sleep(60); }
  // responde tudo (MCQ do módulo 1: uma errada de propósito)
  for (let i = 0; i < qs1.length; i++) { await p.click_(`[data-act=spick][data-v="${i === 0 ? (qs1[i].ans + 1) % 4 : qs1[i].ans}"]`); if (i < qs1.length - 1) await p.click_('[data-act=simnext]'); }
  ok(await p.$eval('[data-confirm]', e => /Encerrar módulo/.test(e.innerText)), 'última página: botão "Encerrar módulo"');
  // a questão de inserir frase mostra os marcadores no texto
  await p.click_('[data-act=simend]'); await p.cf(); await sleep(100);
  ok(await p.has('#simintro') && await p.$eval('#simintro', e => /Módulo 2/.test(e.innerText)), 'módulo 1 encerrado → introdução do módulo 2');
  await p.enter(); await sleep(100);
  const ctw2 = F1.reading[1].ctw.filter(x => typeof x === 'object'), qs2 = [].concat(...F1.reading[1].groups.map(g => g.qs));
  await p.evaluate((c) => { document.querySelectorAll('input.ctw').forEach((e, i) => { e.value = c[i]; e.dispatchEvent(new Event('input', { bubbles: true })); }); }, ctw2.map(x => x.ans.toUpperCase()));
  const rc = [await p.$eval('#simcount', e => e.textContent)];
  for (let i = 0; i < qs2.length; i++) { await p.click_('[data-act=simnext]'); rc.push(await p.$eval('#simcount', e => e.textContent)); await p.click_(`[data-act=spick][data-v="${qs2[i].ans}"]`); }
  console.log('   contador Reading M2: ' + rc.join(' | '));
  ok(covers(rc, 20) && rc[0] === 'Itens 1–10 de 20' && rc[1] === 'Item 11 de 20', 'v1.4.3: Reading M2 percorrido: CtW "Itens 1–10", depois item a item, cobre 1..20 sem falhas e termina em 20');
  ok(await p.$eval('.qprog i', e => e.style.width === '100%'), 'barra em 100% na última tela do Reading');
  await p.click_('[data-act=simend]'); await p.cf(); await sleep(120);
  ok(await p.has('#simres') && await p.$eval('#simscore', e => /Reading\s+38\/40/.test(e.innerText) && /M1 18\/20 · M2 20\/20/.test(e.innerText)), 'resultado: Reading 38/40 (M1 18/20, M2 20/20; maiúsculas aceitas)');
  ok(await p.$eval('#simnoband', e => /não publica tabela de conversão/.test(e.innerText)), 'avisa que só há pontos brutos (sem conversão da ETS)');
  await onePri(p, 'resultado'); await p.screenshot({ path: SH('resultado'), fullPage: true });
  await p.click_('[data-act=simsave]'); await sleep(150);
  let S = JSON.parse(store);
  ok(S.simulados.length === 1 && S.simulados[0].test === 'flpt1' && S.simulados[0].mode === 'reading' && S.simulados[0].pontos.reading.ok === 38 && S.simuladoAtual === null && S.schemaVersion === 6, 'resultado salvo em progresso.json (simulados[]) e tentativa encerrada');
  ok(await p.has('#simrec') && await p.$$eval('#simreview details', a => a.length) === 2, 'tela do resultado salvo com revisão por módulo');
  await p.$$eval('#simreview details', a => a.forEach(d => d.open = true)); await sleep(50);
  ok(await p.$eval('#simreview', e => /✗/.test(e.innerText) && e.querySelectorAll('.ctwr.bad').length === 1), 'revisão mostra a lacuna e a questão erradas');
  await onePri(p, 'resultado salvo'); await p.screenshot({ path: SH('revisao'), fullPage: true });
  // v1.6.0: revisão item a item de uma tentativa salva (Revisar, filtro só erros, tentativas, PT/EN, Speaking "feito, sem nota")
  { const SH6 = n => '/workspace/treino-app/shots/v160-' + n + '.png', rid = await p.evaluate('P.simulados[0].id');
    await p.evaluate(() => document.querySelectorAll('.toast').forEach(e => e.remove()));
    ok(await p.$$eval('#simrecrv [data-act=simrv]', a => a.length === 1 && a[0].dataset.s === 'reading' && !a[0].classList.contains('pri')), 'v1.6.0: resultado salvo tem botão de revisão por seção (sem outro botão primário)');
    await p.click_('#simrecrv [data-act=simrv]'); await sleep(80);
    ok(await p.has('#simrv') && await p.$eval('#rvsum', e => /38\/40/.test(e.innerText) && /95%/.test(e.innerText) && /2 erros/.test(e.innerText) && /Módulo 1 18\/20/.test(e.innerText)), 'v1.6.0: revisão abre com o resumo (38/40, 95%, 2 erros, por módulo)');
    ok(await p.$$eval('.rvmod', a => a.length) === 2, 'revisão com os dois módulos');
    const qn = await p.evaluate(() => { const t = simTest('flpt1'); return t.reading.reduce((a, m) => a + m.groups.reduce((x, g) => x + g.qs.length, 0), 0); });
    ok(await p.$$eval('#simrv ~ .rvmod .rvq', a => a.length) === qn, 'Todos: todas as questões de múltipla escolha dos dois módulos');
    ok(await p.$$eval('.rvq.bad', a => a.length) === 1 && await p.$$eval('.rvq.bad .rvo.bad', a => a.length) === 1 && await p.$$eval('.rvq.bad .rvo.ok', a => a.length) === 1, 'questão errada: sua opção em vermelho e a correta em verde');
    ok(await p.$eval('.rvq.bad', e => /sua resposta/.test(e.innerText) && /correta/.test(e.innerText)), 'etiquetas "sua resposta" e "correta"');
    ok(await p.$$eval('.rvctw tr.bad', a => a.length) === 1 && await p.$$eval('.rvctw tr.ok', a => a.length) === 19, 'lacunas: 1 errada, 19 certas, com a palavra completa');
    ok(await p.$eval('.rvpass', e => !e.open && /Texto/.test(e.innerText)), 'texto do trecho num bloco recolhível');
    ok(!(await p.has('#rvnoresp')) && !(await p.has('#rvdiff')), 'tentativa com respostas guardadas: sem aviso');
    await p.screenshot({ path: SH6('revisao-pt'), fullPage: true });
    await p.click_('[data-act=simrvf][data-v=wrong]'); await sleep(60);
    ok(await p.$$eval('.rvq', a => a.length) === 1 && await p.$$eval('.rvctw tr', a => a.length) === 2 && await p.$eval('[data-act=simrvf][data-v=wrong]', e => e.classList.contains('on') && /\(2\)/.test(e.innerText)), 'v1.6.0: "Só os erros" mostra só a questão e a lacuna erradas');
    ok(await p.$eval('.rvmod[data-step=R2]', e => /Tudo certo neste módulo/.test(e.innerText)), 'módulo sem erros diz "Tudo certo"');
    await p.screenshot({ path: SH6('revisao-erros-pt'), fullPage: true });
    await p.evaluate(() => { P.settings.language = 'en'; render(); }); await sleep(80);
    ok(await p.$eval('#simrv', e => /Review/.test(e.innerText) && /Wrong only \(2\)/.test(e.innerText) && /2 mistakes/.test(e.innerText)) && await p.$eval('.rvq.bad', e => /your answer/.test(e.innerText) && /correct/.test(e.innerText)), 'v1.6.0: revisão em inglês');
    await p.screenshot({ path: SH6('revisao-erros'), fullPage: true });
    await p.click_('[data-act=simrvf][data-v=all]'); await sleep(60); await p.screenshot({ path: SH6('revisao'), fullPage: true });
    await p.evaluate(() => { P.settings.language = 'pt'; render(); }); await sleep(60);
    // tentativas sintéticas: uma 2ª de Reading, Listening + Writing, Speaking sem nota e uma antiga sem respostas
    await p.evaluate(rid => { const a = P.simulados.find(x => x.id === rid), t = simTest('flpt1'), c = JSON.parse(JSON.stringify(a));
      c.id = 'x-rv-2'; c.t = new Date(Date.now() + 1000).toISOString(); c.respostas.ans.R2 = { ctw: {}, q: {} }; c.pontos.reading.ok = 18; P.simulados.push(c);
      const L1 = {}; t.listening[0].forEach(g => g.qs.forEach((q, i) => L1[q.n] = i ? q.ans : (q.ans + 1) % q.opts.length));
      const bas = {}; t.writing.build.forEach((b, i) => bas[b.n] = i ? b.solution.order.slice() : b.solution.order.slice().reverse());
      const wid = 'x-rv-essay'; P.redacoes.push({ id: wid, t: new Date().toISOString(), tarefa: 'email', titulo: 'Email (simulado)', texto: 'Dear Ms. Smith,\nI am writing to ask about the library hours.', palavras: 11, segundos: 300, nota: 4 });
      P.simulados.push({ id: 'x-rv-lw', test: 'flpt1', mode: 'full', secoes: ['listening', 'writing', 'speaking'], t: new Date(Date.now() + 2000).toISOString(), redacoes: { WE: wid },
        pontos: { listening: (() => { let ok = 0, n = 0; t.listening.forEach(m => m.forEach(g => g.qs.forEach(q => { n++; if (L1[q.n] === q.ans) ok++; }))); return { ok, n }; })(), writing: { build: { ok: t.writing.build.length - 1, n: t.writing.build.length }, email: { palavras: 11, nota: 4 }, disc: { palavras: 0, nota: '' } }, speaking: { repeat: { nota: '' }, interview: { nota: '' } } },
        respostas: { ans: { L1 }, bas, tr: {} } });
      P.simulados.push({ id: 'x-rv-old', test: 'flpt1', mode: 'reading', secoes: ['reading'], t: '2026-01-02T10:00:00.000Z', pontos: { reading: { ok: 30, n: 40 } } });
      SIM.view = 'flpt1'; render(); }, rid); await sleep(80);
    ok(await p.$eval('#simdetail + .card', e => /feito, sem nota/.test(e.innerText) && !/- \/ -/.test(e.innerText)), 'v1.6.0: Speaking sem nota: melhor resultado "feito, sem nota" (não "- / -")');
    ok(await p.$$eval('#simdetail + .card [data-act=simrv]', a => a.map(x => x.dataset.s).join()) === 'reading,listening,writing,speaking', 'v1.6.0: botão Revisar no melhor resultado de cada seção feita');
    ok(await p.$$eval('#simatts tr[data-rec]', a => a.length) === 4 && await p.$eval('#simatts', e => /S feito, sem nota/.test(e.innerText)), 'lista de tentativas no detalhe; linha do Speaking sem "-/-"');
    await p.screenshot({ path: SH6('revisao-detalhe'), fullPage: true });
    for (const w of [900, 1180]) { await p.setViewport({ width: w, height: 820 }); await sleep(60); ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `v1.6.0: detalhe com Revisar sem rolagem horizontal em ${w}px`); }
    await p.click_('#simdetail + .card [data-act=simrv][data-s=reading]'); await sleep(80);
    ok(await p.$eval('#simrv', e => e.dataset.rec) === rid && await p.$$eval('#rvatt option', a => a.length) === 3, 'v1.6.0: Revisar abre a melhor tentativa; seletor com as 3 tentativas de Reading');
    await p.select('#rvatt', 'x-rv-2'); await sleep(80);
    ok(await p.$eval('#simrv', e => e.dataset.rec) === 'x-rv-2' && await p.$eval('.rvmod[data-step=R2] .pill', e => e.innerText === '0/20') && await p.$$eval('.rvnone', a => a.length) > 0, 'trocar a tentativa: R2 sem respostas = erros com "sem resposta"');
    await p.select('#rvatt', 'x-rv-old'); await sleep(80);
    ok(await p.has('#rvnoresp') && await p.$$eval('.rvo.ok', a => a.length) > 0, 'v1.6.0: tentativa antiga sem respostas: aviso claro e questões com a correta');
    await p.evaluate(() => { SIM.view = { rv: 'x-rv-lw', sec: 'listening', wrong: false }; render(); }); await sleep(80);
    ok(await p.$$eval('.rvsecs [data-act=simrvsec]', a => a.map(x => x.dataset.v).join()) === 'listening,writing,speaking', 'abas das seções da tentativa');
    ok(await p.$$eval('[data-act=simrvplay]', a => a.length) > 0 && await p.$$eval('.rvmod[data-step=L1] .rvq.bad', a => a.length) === await p.evaluate(() => simTest('flpt1').listening[0].length), 'Listening: botão de ouvir de novo e 1 erro por trecho do módulo 1');
    ok(await p.$eval('.rvmod[data-step=L2]', e => /sem resposta|Sem resposta/.test(e.innerText)), 'Listening M2 sem respostas aparece como erro');
    { const n0 = await p.evaluate('SIM_AUDIO.gen'); await p.click_('[data-act=simrvplay]'); await sleep(150);
      ok(await p.evaluate('String(SIM_AUDIO.playing).startsWith("rv:L1:")') && await p.$eval('[data-act=simrvplay]', e => /Parar/.test(e.innerText)), 'v1.6.0: Listening: tocar o áudio do trecho de novo (botão vira Parar)');
      await p.click_('[data-act=simrvplay]'); await sleep(60); ok(!(await p.evaluate('SIM_AUDIO.playing')) && await p.evaluate('SIM_AUDIO.gen') > n0, 'Parar interrompe o áudio'); }
    await p.$$eval('.rvpass', a => a.forEach(d => d.open = true)); await sleep(40);
    ok(await p.$$eval('.rvpass .passage', a => a.some(x => x.innerText.length > 40)), 'transcrição disponível no bloco recolhível');
    await p.$$eval('.rvpass', a => a.forEach(d => d.open = false)); await p.click_('[data-act=simrvf][data-v=wrong]'); await sleep(60); await p.screenshot({ path: SH6('revisao-listening-pt'), fullPage: true });
    await p.click_('[data-act=simrvsec][data-v=writing]'); await sleep(80);
    ok(await p.$eval('#rvsum', e => /erro\b/.test(e.innerText)) && await p.$$eval('.rvmod[data-step=WB] .rvq', a => a.length) === 1 && await p.$eval('.rvmod[data-step=WB] .rvq', e => /Sua frase/.test(e.innerText) && /Correta/.test(e.innerText)), 'v1.6.0: Build a Sentence: só a errada no filtro, sua frase x correta');
    ok(await p.$eval('.rvessay[data-step=WE]', e => /library hours/.test(e.innerText) && /autoavaliação 4\/5/.test(e.innerText) && !!e.querySelector('[data-act=eview]')), 'Write an Email: seu texto e a autoavaliação');
    ok(await p.$eval('.rvessay[data-step=WD]', e => /Nenhum texto salvo/.test(e.innerText) && /sem nota/.test(e.innerText)), 'Academic Discussion sem texto: aviso');
    await p.click_('[data-act=simrvf][data-v=all]'); await sleep(60); await p.screenshot({ path: SH6('revisao-writing-pt'), fullPage: true });
    await p.click_('[data-act=simrvsec][data-v=speaking]'); await sleep(80);
    ok(!(await p.has('.rvfilt')) && await p.$$eval('.rvmod', a => a.length === 2 && a.every(x => /feito, sem nota/.test(x.innerText))) && await p.$$eval('.rvsp [data-act=rvorig]', a => a.length) > 0 && await p.has('.rvnote0'), 'v1.6.0: Speaking: "feito, sem nota", aviso sem gravações e áudio original de cada item');
    await p.click_('#simrv .mhead [data-act=simopen]'); await sleep(60);
    ok(await p.has('#simdetail'), 'voltar da revisão leva ao detalhe do teste');
    await p.evaluate(rid => { P.simulados = P.simulados.filter(x => !/^x-rv-/.test(x.id)); P.redacoes = P.redacoes.filter(x => x.id !== 'x-rv-essay'); persist(true); SIM.view = { rec: rid }; render(); }, rid); await sleep(80);
    await p.setViewport({ width: 1180, height: 820 }); }
  await p.click_('#simrec .btn.pri'); await sleep(80);
  ok(await p.$eval('tr[data-test=flpt1]', e => /✓ Reading/.test(e.innerText) && /R 38\/40/.test(e.innerText)), 'lista marca Reading do FLPT 1 como feito');

  // 18c) Listening do TPT 2 (áudio oficial; fallback de transcrição)
  const T2 = ETSJ.tests.find(t => t.id === 'tpt2');
  await p.click_('tr[data-test=tpt2] .btn'); await p.click_('[data-act=simgo][data-v=listening]'); await sleep(80);
  // v1.4.3: teste de som antes do módulo de Listening (cronômetro parado)
  { const full = await p.evaluate('P.simuladoAtual.left');
    ok(await p.has('#simintro #simvol') && await p.has('#simvolr') && !(await p.has('#tmr')), 'v1.4.3: teste de som na introdução do Listening, sem cronômetro');
    ok(await p.$eval('[data-act=simbegin]', e => e.innerText.trim() === 'Começar módulo' && e.classList.contains('pri')) && await p.$eval('#simvol', e => /volume do Windows/.test(e.innerText) && /Tocar trecho/.test(e.innerText)), 'v1.4.3: botão "Começar módulo", Tocar e dica do volume do Windows');
    await p.click_('[data-act=volplay]'); await p.waitForFunction('document.querySelector("#volstat") && /Tocando|Fim do trecho/.test(document.querySelector("#volstat").textContent)', { timeout: 8000 }).catch(() => {});
    ok(await p.$eval('#volstat', e => /Tocando|Fim do trecho/.test(e.textContent)) && await p.$eval('[data-act=volplay]', e => /Tocar de novo/.test(e.innerText)), 'v1.4.3: toca o trecho de teste; botão vira "Tocar de novo"');
    await p.$eval('#simvolr', e => { e.value = '40'; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }); await sleep(60);
    ok(JSON.parse(store).settings.volume === 0.4 && await p.$eval('#volpct', e => e.textContent === '40%'), 'v1.4.3: volume salvo no progresso.json (settings.volume = 0.4)');
    ok(await p.evaluate('!SIM_AUDIO.el || Math.abs(SIM_AUDIO.el.volume - 0.4) < 0.01'), 'o volume vale na hora para o trecho tocando');
    await sleep(1200);
    ok(!(await p.has('#tmr')) && await p.evaluate('!T.running() && P.simuladoAtual.phase === "intro"') && await p.evaluate('P.simuladoAtual.left') === full, 'v1.4.3: o cronômetro não corre na tela do teste de som');
    await p.screenshot({ path: '/workspace/treino-app/shots/v143-volume.png', fullPage: true });
    await p.evaluate(() => { window.__seen = { play: false, qFirst: false, astat: '' }; const chk = () => { const pl = document.querySelector('#simplay'), q = document.querySelector('#simq'), st = document.querySelector('#astat'); if (pl && !q) window.__seen.play = true; if (q && !window.__seen.play) window.__seen.qFirst = true; if (st && /\d\d:\d\d \/ \d\d:\d\d/.test(st.textContent)) window.__seen.astat = st.textContent; if (q) window.__seenObs.disconnect(); }; window.__seenObs = new MutationObserver(chk); window.__seenObs.observe(document.querySelector('#app'), { childList: true, subtree: true, characterData: true }); });
    await p.evaluate(() => { window.__vols = []; const P0 = HTMLMediaElement.prototype.play; HTMLMediaElement.prototype.play = function () { window.__vols.push(this.volume); return P0.call(this); }; });
    await p.enter(); await sleep(150);
    ok(await p.has('#tmr') && await p.evaluate('T.running()'), 'v1.4.3: "Começar módulo" inicia o cronômetro');
    ok(await p.evaluate('SIM_AUDIO.playing !== "vol"'), 'o trecho de teste para ao começar o módulo');
    ok(await p.evaluate('window.__vols.length > 0 && window.__vols.every(v => Math.abs(v - 0.4) < 0.01)'), 'v1.4.3: o áudio do Listening usa o volume do app'); }
  // o 1º trecho é curto: pode acabar antes desta checagem, então vale o que o observador viu desde o "Começar módulo"
  await p.waitForFunction('window.__seen && (window.__seen.astat || window.__seen.qFirst || document.querySelector("#simq"))', { timeout: 10000 }).catch(() => {});
  ok(await p.evaluate('window.__seen ? window.__seen.play && !window.__seen.qFirst : !!document.querySelector("#simplay") && !document.querySelector("#simq")'), 'Listening: áudio toca antes das perguntas');
  ok(await p.evaluate('window.__seen ? !!window.__seen.astat : /\\d\\d:\\d\\d \\/ \\d\\d:\\d\\d/.test((document.querySelector("#astat") || {}).textContent || "")'), 'mostra o andamento do áudio');
  console.log('   1º trecho: ' + await p.evaluate('JSON.stringify(window.__seen || null)'));
  ok(!(await p.has('#simplay')) || await p.$$eval('#app .btn.pri', a => a.length) === 0, 'tocando: nenhum botão para pular o áudio');
  await p.screenshot({ path: SH('listening-audio') });
  // v1.4.3: retomar o módulo (como ao reabrir o app) oferece o teste de som, que dá para pular
  await p.evaluate('SIM.volOK = null; T.stop(); T.total = 0; simStopAudio(); render()'); await sleep(80);
  ok(await p.has('#simvolresume #simvol') && !(await p.has('#tmr')) && await p.evaluate('!T.running()'), 'v1.4.3: retomar o Listening mostra o teste de som, cronômetro parado');
  ok(await p.$eval('#simvolresume', e => /Continuar módulo/.test(e.innerText) && /Pular teste de som/.test(e.innerText)) && await p.$eval('#simvolr', e => e.value === '40'), 'retomar: "Continuar módulo" / "Pular teste de som"; slider lembra 40%');
  await p.click_('#simvolresume .btn.ghost[data-act=volgo]'); await sleep(150);
  ok((await p.has('#simplay') || await p.has('#simq')) && await p.has('#tmr') && await p.evaluate('T.running()'), 'v1.4.3: pular volta ao módulo e o cronômetro volta a correr');
  const lm1 = T2.listening[0]; let wrongL = 0;
  const lc = [], lplay = {};
  for (let gi = 0; gi < lm1.length; gi++) {
    if (await p.has('#simplay')) { lplay[gi] = await p.$eval('#simcount', e => e.textContent); if (gi === lm1.length - 1) await p.screenshot({ path: '/workspace/treino-app/shots/v143-contador.png' }); }
    await p.waitForSelector('#simq', { timeout: 30000 });
    const g = lm1[gi]; lc.push(await p.$eval('#simcount', e => e.textContent));
    if (lplay[gi] != null) ok(lplay[gi] === lc[gi], `v1.4.3: tela do áudio e das perguntas com o mesmo contador (${lc[gi]})`);
    if (gi === lm1.length - 1) ok(await p.$eval('.qprog i', e => e.style.width === '100%'), 'v1.4.3: barra em 100% na última tela do Listening');
    if (gi === 0) { ok(await p.$eval('#simq', e => !/Woman:|Man:/.test(e.innerText)), 'Choose a Response: a fala não aparece escrita'); ok(await p.confirmDisabled(), 'Próxima desativada até responder'); }
    for (const q of g.qs) { const v = gi === 1 ? (q.ans + 1) % 4 : q.ans; if (gi === 1) wrongL++; await p.click_(`[data-act=lpick][data-q="${q.n}"][data-v="${v}"]`); }
    if (gi === lm1.length - 1) { await p.screenshot({ path: SH('listening-perguntas'), fullPage: true }); await onePri(p, 'Listening perguntas'); }
    await p.click_('[data-confirm]'); await sleep(80);
  }
  console.log('   contador Listening M1: ' + lc.join(' | '));
  { const n = lm1.reduce((x, g) => x + g.qs.length, 0), lastN = lm1[lm1.length - 1].qs.length;
    ok(covers(lc, n) && lc[lc.length - 1] === `Itens ${n - lastN + 1}–${n} de ${n}`, `v1.4.3: Listening M1 percorrido: faixas cobrem 1..${n} sem falhas e a última tela termina em ${n}`);
    ok(lplay[lm1.length - 1] === `Itens ${n - lastN + 1}–${n} de ${n}`, 'v1.4.3: o áudio da última palestra já mostra a faixa (' + lplay[lm1.length - 1] + ')'); }
  ok(await p.$eval('#simintro', e => /Módulo 2/.test(e.innerText)), 'Listening módulo 1 terminado');
  audioFail = () => true; await p.enter(); await sleep(200);
  await p.waitForSelector('[data-act=simtr]', { timeout: 5000 }).catch(() => {});
  ok(await p.has('[data-act=simtr]'), 'sem áudio: oferece "Mostrar transcrição e responder"');
  await p.screenshot({ path: SH('listening-fallback') });
  const lm2 = T2.listening[1];
  for (let gi = 0; gi < lm2.length; gi++) {
    await p.waitForSelector('[data-act=simtr]', { timeout: 5000 }); await p.click_('[data-act=simtr]'); await sleep(40);
    if (gi === lm2.length - 1) ok(await p.$eval('#app', e => /Transcrição oficial/.test(e.innerText)), 'transcrição oficial aparece');
    for (const q of lm2[gi].qs) await p.click_(`[data-act=lpick][data-q="${q.n}"][data-v="${q.ans}"]`);
    await p.click_('[data-confirm]'); await sleep(80);
  }
  audioFail = () => false;
  const nL = lm1.reduce((a, g) => a + g.qs.length, 0) + lm2.reduce((a, g) => a + g.qs.length, 0);
  ok(await p.$eval('#simscore', e => e.innerText).then(t => new RegExp('Listening\\s+' + (nL - wrongL) + '/' + nL).test(t)), `Listening ${nL - wrongL}/${nL}`);
  await p.click_('[data-act=simsave]'); await sleep(120);
  S = JSON.parse(store); ok(S.simulados[1].pontos.listening.n === 34 && S.simulados[1].pontos.listening.ok === 34 - wrongL, 'Listening salvo (34 itens)');
  ok(await p.$eval('#simreview', e => /respondida lendo a transcrição/.test(e.innerHTML)), 'resultado marca itens respondidos pela transcrição');
  await p.click_('#simrec .btn.pri');

  // 18d) Writing do TPT 2: Build a Sentence + Email + Discussão
  await p.click_('tr[data-test=tpt2] .btn'); await p.click_('[data-act=simgo][data-v=writing]'); await p.enter(); await sleep(100);
  const bs = T2.writing.build; ok(bs.length === 10, 'Build a Sentence: 10 itens');
  ok(await p.$eval('#tmr', e => /^0[56]:\d\d$/.test(e.textContent)), 'Build a Sentence: 6 min');
  for (let i = 0; i < bs.length; i++) { const order = i === 2 ? bs[i].solution.order.slice().reverse() : bs[i].solution.order; for (const ci of order) await p.click_(`[data-act=sbchip][data-v="${ci}"]`);
    if (i === 0) { ok(await p.$$eval('.bas [data-act=sbrem]', a => a.length) === bs[0].solution.order.length, 'blocos entram nas lacunas'); await onePri(p, 'Build a Sentence'); await p.screenshot({ path: SH('build-sentence') }); }
    if (i < bs.length - 1) await p.click_('[data-act=simnext]'); }
  await p.click_('[data-act=simend]'); await p.cf(); await p.enter(); await sleep(120);
  ok(await p.has('#essay') && await p.$eval('#tmr', e => /^0[67]:\d\d$/.test(e.textContent)), 'Email: editor com cronômetro de 7 min');
  await p.type('#essay', 'Dear Ms. Lee, thank you for the invitation. I would be glad to help with the event next week.'); await sleep(80);
  ok(await p.$eval('#wc', e => e.textContent) === '19', 'contagem de palavras ao vivo (19)');
  await onePri(p, 'Email'); await p.screenshot({ path: SH('email') });
  await p.click_('[data-act=simend]'); await p.cf(); await p.enter(); await sleep(120);
  ok(await p.$eval('#app', e => /Aluno 1/.test(e.innerText) && /Aluno 2/.test(e.innerText) && /Professor/.test(e.innerText)), 'Discussão: professor e dois alunos');
  await p.type('#essay', 'I agree with the second student because practical experience matters more than theory in this case.'); await sleep(50);
  await p.screenshot({ path: SH('discussao') });
  await p.click_('[data-act=simend]'); await p.cf(); await sleep(120);
  const nOkB = bs.filter((b, i) => i !== 2 || b.solution.order.length < 2 || JSON.stringify(b.solution.order.map(c => b.chips[c])) === JSON.stringify(b.solution.order.slice().reverse().map(c => b.chips[c]))).length;
  ok(await p.$eval('#simscore', (e, n) => new RegExp('Build a Sentence\\s+' + n + '/10').test(e.innerText), nOkB), 'Build a Sentence corrigido (' + nOkB + '/10)');
  await p.select('#self-email', '4'); await p.select('#self-disc', '3');
  await p.click_('[data-act=simsave]'); await sleep(120);
  S = JSON.parse(store); const essays = S.redacoes.filter(r => /TPT 2/.test(r.titulo));
  ok(essays.length === 2 && essays.find(r => r.tarefa === 'email').nota === '4' && essays.find(r => r.tarefa === 'disc').nota === '3' && essays[0].palavras === 19, 'Email e Discussão vão para Redações com a autoavaliação');
  await p.click_('#simrec .btn.pri');

  // Reading do TPT 2 (respostas preenchidas direto; o fluxo da tela já foi testado no FLPT 1)
  await p.click_('tr[data-test=tpt2] .btn'); await p.click_('[data-act=simgo][data-v=reading]');
  for (const st of ['R1', 'R2']) { await p.enter(); await sleep(60); await p.evaluate(st => { const t = simTest('tpt2'), m = t.reading[+st[1] - 1], A = P.simuladoAtual; A.ans[st] = { ctw: {}, q: {} }; m.ctw.forEach(x => { if (typeof x === 'object') A.ans[st].ctw[x.n] = x.ans; }); m.groups.forEach(g => g.qs.forEach(q => A.ans[st].q[q.n] = q.ans)); A.page = 999; render(); }, st); await p.click_('[data-act=simend]'); await p.cf(); await sleep(60); }
  ok(await p.$eval('#simscore', e => /Reading\s+40\/40/.test(e.innerText)), 'TPT 2 Reading 40/40'); await p.click_('[data-act=simsave]'); await sleep(100); await p.click_('#simrec .btn.pri');
  // 18e) Speaking do TPT 2
  await p.click_('tr[data-test=tpt2] .btn'); await p.click_('[data-act=simgo][data-v=speaking]'); await sleep(60);
  ok(await p.has('#app [data-act=miccheck]') && !(await p.$eval('#app', e => /Gravador de Voz/.test(e.innerText))), 'v1.5.0: introdução do Speaking tem teste do microfone (sem a dica do Gravador de Voz)');
  await p.enter(); await sleep(100);
  await p.waitForSelector('[data-act=simspnext]', { timeout: 30000 });
  ok(await p.$eval('#tmr', e => /^00:(0[89]|1[0-2])$/.test(e.textContent)), 'Listen and Repeat: tempo de resposta 8–12 s');
  await p.click_('#spshow'); await sleep(60);
  ok(await p.$eval('#simsp', e => /Trainer:/.test(e.innerText)), 'opção mostra o texto da frase');
  await onePri(p, 'Speaking'); await p.screenshot({ path: SH('speaking') });
  for (let k = 0; k < 40 && await p.evaluate('!!(P.simuladoAtual && P.simuladoAtual.phase !== "done")'); k++) {
    await p.waitForSelector('[data-act=simspnext], [data-act=simbegin]', { timeout: 30000 }); await p.click_('[data-act=simspnext], [data-act=simbegin]'); await sleep(60);
  }
  ok(await p.has('#simres') && await p.has('#self-repeat') && await p.has('#self-interview'), 'Speaking termina com autoavaliação (rubricas)');
  await p.select('#self-repeat', '4'); await p.click_('[data-act=simsave]'); await sleep(150);
  S = JSON.parse(store);
  ok(S.marcos[2] && S.marcos[2].feito && S.marcos[2].auto, 'marco S3 (TPT 2 completo) marcado sozinho após as 4 seções');
  ok(!(S.marcos[0] && S.marcos[0].feito), 'marco S1 (FLPT 1 + agendar) continua manual');
  await p.click_('#simrec .btn.pri'); await sleep(50);
  ok(await p.$eval('tr[data-test=flpt2] .btn', e => e.classList.contains('pri')) === false && await p.$eval('tr[data-test=flpt1] .btn', e => e.classList.contains('pri')), 'próximo do plano continua FLPT 1 (incompleto)');

  // 18f) marcos com link
  await p.click_('[data-act=tab][data-v=prog]'); await sleep(80);
  ok(await p.$eval('label.ms:nth-of-type(3)', e => e.classList.contains('done') && /marcado sozinho/.test(e.innerText)), 'Progresso mostra S3 marcado sozinho');
  ok(await p.$eval('label.ms:nth-of-type(1)', e => /FLPT 1: 1\/4/.test(e.innerText) && !!e.querySelector('[data-act=simopen][data-v=flpt1]')), 'S1: estado do FLPT 1 e botão Iniciar');
  await p.screenshot({ path: SH('marcos'), fullPage: true });
  opened = []; await p.click_('label.ms:nth-of-type(7) [data-act=simurl]'); await sleep(50);
  ok(opened[0] && /powerprep/.test(opened[0]) && !(await p.$eval('[data-ms="6"]', e => e.checked)), 'link POWERPREP abre a ETS sem marcar o marco');
  await p.click_('label.ms:nth-of-type(5) [data-act=simopen]'); await sleep(80);
  ok(await p.evaluate('TAB') === 'sim' && await p.has('#simdetail') && await p.$eval('#simdetail', e => /Full-Length Practice Test 2/.test(e.innerText)), 'Iniciar no marco S5 abre o FLPT 2');
  // manual continua funcionando
  await p.click_('[data-act=tab][data-v=prog]'); await p.click_('[data-ms="0"]'); await sleep(700);
  ok(JSON.parse(store).marcos[0].feito === true, 'marcar à mão continua funcionando');

  // 18h) v1.4.1: TPT 3 (Reading pela tela, Writing com o item corrigido), marcos S4/S6 ligados
  const SH1 = n => '/workspace/treino-app/shots/v141-' + n + '.png';
  await p.click_('[data-act=tab][data-v=prog]'); await sleep(80);
  ok(await p.$eval('label.ms:nth-of-type(4)', e => /TPT 3: 0\/4/.test(e.innerText) && !!e.querySelector('[data-act=simopen][data-v=tpt3]') && /marca sozinho/.test(e.innerText)), 'S4: estado do TPT 3, botão Iniciar e "marca sozinho"');
  ok(await p.$eval('label.ms:nth-of-type(6)', e => /TPT 4: 0\/4/.test(e.innerText) && !!e.querySelector('[data-act=simopen][data-v=tpt4]')), 'S6: estado do TPT 4 e botão Iniciar');
  const T3 = await p.evaluate('JSON.parse(JSON.stringify(simTest("tpt3")))');
  ok(['tpt3', 'tpt4', 'tpt5'].every(x => true) && T3.reading.length === 2 && T3.listening.length === 2 && T3.writing.build.length === 10, 'TPT 3: 2 módulos de Reading e Listening, 10 Build a Sentence');
  await p.click_('label.ms:nth-of-type(4) [data-act=simopen]'); await sleep(80);
  ok(await p.has('#simdetail') && await p.$eval('#simdetail', e => /Teacher Practice Test 3/.test(e.innerText)), 'Iniciar no marco S4 abre o TPT 3');
  await p.click_('[data-act=simgo][data-v=reading]'); await p.enter(); await sleep(100);
  ok(await p.has('input.ctw'), 'TPT 3 Reading: Complete the Words');
  await p.screenshot({ path: SH1('tpt3-reading') });
  await p.click_('[data-act=simnext]'); await sleep(80); await p.screenshot({ path: SH1('tpt3-questao') });
  for (const st of ['R1', 'R2']) { if (st === 'R2') { await p.enter(); await sleep(60); } await p.evaluate(st => { const t = simTest('tpt3'), m = t.reading[+st[1] - 1], A = P.simuladoAtual; A.ans[st] = { ctw: {}, q: {} }; m.ctw.forEach(x => { if (typeof x === 'object') A.ans[st].ctw[x.n] = x.ans; }); m.groups.forEach(g => g.qs.forEach(q => A.ans[st].q[q.n] = q.ans)); A.page = 999; render(); }, st); await p.click_('[data-act=simend]'); await p.cf(); await sleep(60); }
  ok(await p.$eval('#simscore', e => /Reading\s+40\/40/.test(e.innerText)), 'TPT 3 Reading 40/40 com o gabarito oficial'); await p.click_('[data-act=simsave]'); await sleep(100); await p.click_('#simrec .btn.pri');
  await p.click_('tr[data-test=tpt3] .btn'); await p.click_('[data-act=simgo][data-v=writing]'); await p.enter(); await sleep(100);
  const bs3 = T3.writing.build;
  ok(bs3[0].tplPdf && (bs3[0].tplPdf.match(/_____/g) || []).length === bs3[0].solution.order.length + 1 && (bs3[0].tpl.match(/_____/g) || []).length === bs3[0].solution.order.length, 'TPT 3 BaS 1: lacuna a mais do PDF tratada no item (tplPdf guardado)');
  for (let i = 0; i < bs3.length; i++) { for (const ci of bs3[i].solution.order) await p.click_(`[data-act=sbchip][data-v="${ci}"]`);
    if (i === 0) await p.screenshot({ path: SH1('tpt3-build-sentence') });
    if (i < bs3.length - 1) await p.click_('[data-act=simnext]'); }
  await p.click_('[data-act=simend]'); await p.cf(); await p.enter(); await sleep(120);
  await p.type('#essay', 'Dear manager, I am writing about the event.'); await p.click_('[data-act=simend]'); await p.cf(); await p.enter(); await sleep(120);
  ok(await p.$eval('#app', e => /Dr\. /.test(e.innerText) || /Professor/.test(e.innerText)), 'TPT 3 Discussão: nome do professor');
  await p.screenshot({ path: SH1('tpt3-discussao') });
  await p.click_('[data-act=simend]'); await p.cf(); await sleep(120);
  ok(await p.$eval('#simscore', e => /Build a Sentence\s+10\/10/.test(e.innerText)), 'TPT 3 Build a Sentence 10/10 com a ordem oficial');
  await p.click_('[data-act=simsave]'); await sleep(120);
  await p.$$eval('#simreview details', a => a.forEach(d => d.open = true)); await sleep(40);
  ok(await p.$eval('#simreview', e => /lacuna a mais/.test(e.innerText)), 'revisão avisa do erro do PDF no BaS 1');
  // Listening e Speaking: registros salvos direto; o próximo save precisa marcar o S4 sozinho
  S = JSON.parse(store); ok(!(S.marcos[3] && S.marcos[3].feito), 'S4 ainda não marcado (faltam seções)');
  await p.click_('#simrec .btn.pri'); await p.evaluate(() => { P.simulados.push({ id: 'x-tpt3-l', test: 'tpt3', mode: 'listening', secoes: ['listening'], t: new Date().toISOString(), pontos: {} }); });
  await p.click_('tr[data-test=tpt3] .btn'); await p.click_('[data-act=simgo][data-v=speaking]'); await p.enter(); await sleep(100);
  for (let k = 0; k < 40 && await p.evaluate('!!(P.simuladoAtual && P.simuladoAtual.phase !== "done")'); k++) {
    await p.waitForSelector('[data-act=simspnext], [data-act=simbegin]', { timeout: 30000 }); await p.click_('[data-act=simspnext], [data-act=simbegin]'); await sleep(60);
  }
  await p.click_('[data-act=simsave]'); await sleep(150);
  S = JSON.parse(store); ok(S.marcos[3] && S.marcos[3].feito && S.marcos[3].auto, 'marco S4 (TPT 3 completo) marcado sozinho');
  ok(!(S.marcos[5] && S.marcos[5].feito), 'S6 (TPT 4) continua aberto');
  await p.click_('#simrec .btn.pri'); await sleep(50);
  await p.click_('tr[data-test=flpt2] .btn'); await sleep(50); await p.click_('[data-act=tab][data-v=prog]'); await sleep(50); // volta ao estado do teste seguinte (FLPT 2 aberto)

  // 18g) simulado completo: retomar após reabrir o app, descartar
  await p.click_('[data-act=tab][data-v=sim]'); ok(await p.has('#simdetail'), 'voltar à aba mantém o teste aberto'); await p.click_('#simdetail [data-act=simlist]'); await p.click_('tr[data-test=flpt2] .btn'); await p.click_('[data-act=simgo][data-v=full]'); await sleep(80); ok(!(await p.modal()), 'sem tentativa em andamento: começa direto, sem confirmação');
  A = await simA(p); ok(A.mode === 'full' && A.steps.join() === 'R1,R2,L1,L2,WB,WE,WD,SR,SI', 'simulado completo: 9 etapas na ordem oficial');
  await p.enter(); await sleep(5800); await p.close(); // fecha sem beforeunload (como um fechamento abrupto)
  p = await open('light'); await sleep(100); await p.click_('[data-act=tab][data-v=sim]'); await sleep(80);
  ok(await p.has('#simresume') && await p.$eval('#simresume', e => /Full-Length Practice Test 2/.test(e.innerText) && /Reading · Módulo 1/.test(e.innerText)), 'reabrir o app: aviso de simulado em andamento');
  await onePri(p, 'lista com simulado em andamento'); await p.screenshot({ path: SH('retomar') });
  await p.click_('[data-act=simresume]'); await sleep(100);
  ok(await p.has('input.ctw') && await p.$eval('#tmr', e => e.textContent < '12:00'), 'continuar: volta ao Reading com o tempo que restava');
  await p.click_('[data-act=simexit]'); await p.click_('[data-act=simdiscard]'); await p.cf(); await sleep(100);
  ok(JSON.parse(store).simuladoAtual === null && !(await p.has('#simresume')), 'descartar apaga a tentativa');
  // inglês
  await p.evaluate('P.settings.language = "en"; render()'); await sleep(80);
  ok(await p.$eval('#app', e => /TOEFL iBT practice tests/.test(e.innerText) && !/Official ETS/.test(e.innerText) && /Next in plan/.test(e.innerText)) && await p.$eval('nav', e => /Practice tests/.test(e.innerText)), 'interface em EN');
  await p.screenshot({ path: SH('lista-en'), fullPage: true });
  // v1.4.3: EN do modal, botões em EN sem quebra, e tempo esgotado com o modal aberto
  await p.click_('tr[data-test=flpt1] .btn'); await sleep(80);
  for (const w of [900, 1180]) { await p.setViewport({ width: w, height: 820 }); await sleep(80); const wr = await wrapped(); ok(!wr.length, `v1.4.3: EN, botões sem quebra em ${w}px` + (wr.length ? ': ' + wr.join(' | ') : '')); }
  ok(await p.$$eval('#simdetail ~ .card [data-act=simgo]:not([data-v=full])', a => a.every(e => e.innerText.trim() === 'This section only')), 'EN: "This section only"');
  await p.setViewport({ width: 1180, height: 820 });
  await p.click_('[data-act=simgo][data-v=reading]'); await sleep(60); await p.enter(); await sleep(100);
  await p.evaluate('P.simuladoAtual.page = 999; render()'); await sleep(60); await p.click_('[data-act=simend]'); await sleep(60);
  { const mt = await p.$eval('#modalc', e => e.innerText); ok(/End this module\?/.test(mt) && /You will not be able to return to this module\./.test(mt) && /\d+ blanks and \d+ questions unanswered/.test(mt) && /Keep answering/.test(mt) && /\bEnd\b/.test(mt), 'v1.4.3: modal em EN'); }
  await p.screenshot({ path: '/workspace/treino-app/shots/v143-modal-en.png' });
  await p.evaluate('T.total = (Date.now() - T.t0) / 1000 + 0.3'); await sleep(900);
  ok(!(await p.modal()) && await p.has('#simintro') && await p.evaluate('P.simuladoAtual.si === 1'), 'v1.4.3: tempo esgotado fecha o modal e segue para o módulo 2 ' + JSON.stringify(await p.evaluate(() => ({ m: $('#modal').style.display, si: P.simuladoAtual && P.simuladoAtual.si, ph: P.simuladoAtual && P.simuladoAtual.phase, intro: !!$('#simintro'), tl: T.left, tt: T.total }))));
  await p.click_('[data-act=simexit]'); await p.click_('[data-act=simdiscard]'); await sleep(60);
  ok(await p.$eval('#modalc', e => /Discard the practice test in progress\?/.test(e.innerText)), 'EN: descartar usa o modal');
  await p.click_('#modal [data-act=cfok]'); await sleep(80); ok(JSON.parse(store).simuladoAtual === null, 'descartar (EN) confirma pelo modal');
  await p.click_('[data-act=tab][data-v=sim]'); await sleep(60);
  // exportar e validação da importação
  const txt = await p.evaluate('exportText()'); console.log('   ' + (txt.match(/PRACTICE TESTS \(raw[^\n]*/) || [''])[0]); ok(/\nPRACTICE TESTS \(raw scores\): 9/.test(txt) && /TPT 3/.test(txt) && /TPT 2/.test(txt), 'exportar texto inclui os simulados');
  ok(await p.evaluate(`(() => { try { validateImport({ ...JSON.parse(JSON.stringify(P)), simulados: {} }); return false; } catch (e) { return true; } })()`), 'importar recusa simulados inválido');
  await p.evaluate('P.settings.language = "pt"; persist(true)');
  await p.close();

  // ===================== v1.5.0: gravação, revisão, avaliação =====================
  console.log('30) v1.5.0: gravação do Speaking (microfone falso), revisão, nota automática, IA');
  const SH5 = n => '/workspace/treino-app/shots/v150-' + n + '.png';
  // 30a) migração schema 5 → 6
  { const v14 = JSON.parse(store); v14.schemaVersion = 5; v14.appVersion = '1.4.3'; v14.ultimaVersaoVista = '1.4.3'; delete v14.falaAtual; delete v14.settings.gravar; v14.campoDaV14 = 1;
    store = JSON.stringify(v14); backups = []; }
  p = await open('light'); await sleep(300); S = JSON.parse(store);
  ok(backups.length === 1 && backups[0].old === 5 && S.schemaVersion === 6 && S.falaAtual === null && S.settings.gravar === true && S.campoDaV14 === 1 && S.simulados.length >= 1, 'v1.5.0: schema 5 → 6 com backup, falaAtual, gravar ligado, campos preservados');
  ok(await p.cfOpen() || await p.modal(), 'novidades da v1.5.0 aparecem'); ok(await p.$eval('#modalc', e => /grava/.test(e.innerText) && /whisper/.test(e.innerText)), 'novidades falam da gravação e do whisper');
  await p.screenshot({ path: SH5('novidades') }); await p.enter();
  ok(await p.evaluate('window.isSecureContext && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)'), 'getUserMedia disponível (contexto seguro)');
  // 30b) FLPT 1 com tentativa completa já salva → "Só esta seção" Speaking cria tentativa nova
  await p.evaluate(() => { P.simulados.push({ id: 'old1', t: '2026-10-20T12:00:00.000Z', t0: '2026-10-20T10:00:00.000Z', test: 'flpt1', mode: 'full', secoes: ['reading', 'listening', 'writing', 'speaking'],
    pontos: { reading: { ok: 30, n: 40, mods: [{ ok: 15, n: 20 }, { ok: 15, n: 20 }] }, speaking: { repeat: { nota: '3', ajuste: '3' }, interview: { nota: '3', ajuste: '3' } } }, tempo: {}, respostas: { ans: {}, bas: {}, tr: {} }, redacoes: {},
    gravacoes: { SR1: { item: 'SR1', kind: 'repeat', rel: 'flpt1/old1/SR1.webm', wav: 'flpt1/old1/SR1.wav', transcricao: 'old words', auto: 3, self: '', status: 'salva', t: '2026-10-20T11:00:00.000Z' } } }); persist(true); });
  const old1 = JSON.stringify(JSON.parse(store).simulados.find(r => r.id === 'old1'));
  fs.mkdirSync(path.join(RECDIR, 'flpt1', 'old1'), { recursive: true }); fs.writeFileSync(path.join(RECDIR, 'flpt1', 'old1', 'SR1.webm'), 'x');
  await p.click_('[data-act=tab][data-v=sim]'); await p.click_('tr[data-test=flpt1] .btn'); await sleep(60);
  await p.click_('[data-act=simgo][data-v=speaking]'); await sleep(120); await p.cfIf(300);
  ok(await p.has('#app [data-act=miccheck]'), 'intro do Speaking com teste do microfone');
  const rs0 = recSaved.length; await p.click_('[data-act=miccheck]');
  await p.waitForFunction(() => /✓/.test(($('#micstat') || {}).textContent || '') || /warnline/.test(($('#micstat') || {}).innerHTML || ''), { timeout: 15000 }).catch(() => {});
  ok(await p.$eval('#micstat', e => /✓/.test(e.textContent)), 'teste do microfone grava 3 s e toca (' + await p.$eval('#micstat', e => e.textContent.slice(0, 80)) + ')');
  ok(recSaved.length === rs0, 'teste do microfone não salva arquivo');
  await p.screenshot({ path: SH5('miccheck') });
  const newId = await p.evaluate('P.simuladoAtual.id');
  ok(newId !== 'old1' && await p.evaluate('P.simuladoAtual.mode') !== 'full', 'Só esta seção cria uma tentativa nova');
  let shotRec = false, nResp = 0;
  for (let k = 0; k < 60 && await p.evaluate('!!(P.simuladoAtual && P.simuladoAtual.phase !== "done")'); k++) {
    await p.waitForSelector('[data-act=simspnext], [data-act=simbegin]', { timeout: 60000 });
    if (await p.has('[data-act=simspnext]')) { await p.waitForFunction('REC.mr && REC.mr.state === "recording"', { timeout: 5000 }).catch(() => {}); await sleep(1300); nResp++;
      if (!shotRec) { shotRec = true; ok(await p.$eval('.recind', e => e.classList.contains('on') && /REC/.test(e.innerText)), 'indicador REC na resposta'); await p.screenshot({ path: SH5('rec') }); } }
    await p.click_('[data-act=simspnext], [data-act=simbegin]'); await sleep(80);
  }
  ok(await p.has('#simres'), 'Speaking terminou (' + nResp + ' respostas)');
  await p.waitForFunction(() => { const g = (P.simuladoAtual || {}).gravacoes || {}; const v = Object.values(g); return v.length >= 11 && v.every(e => e.ev && (e.ev.status === 'ok' || e.ev.status === 'erro')); }, { timeout: 30000 }).catch(() => {});
  let G = await p.evaluate('P.simuladoAtual.gravacoes');
  ok(Object.keys(G).sort().join() === 'SI1,SI2,SI3,SI4,SR1,SR2,SR3,SR4,SR5,SR6,SR7', 'gravou os 11 itens (' + Object.keys(G).join() + ')');
  ok(Object.values(G).every(e => e.status === 'salva' && e.rel.startsWith('flpt1/' + newId + '/') && e.wav.endsWith('.wav') && /TreinoTalTech\\gravacoes\\flpt1\\/.test(e.abs)), 'cada item salvo em gravacoes\\flpt1\\<tentativa>\\ (webm + wav, caminho completo)');
  ok(Object.values(G).every(e => e.ev && e.ev.status === 'ok' && typeof e.transcricao === 'string' && e.transcricao && typeof e.auto === 'number'), 'cada item com transcrição e nota automática');
  ok(Object.values(G).filter(e => e.kind === 'interview').every(e => e.metricas && e.metricas.wpm > 0), 'Interview com métricas');
  ok(recSaved.filter(r => r.rel.startsWith('flpt1/' + newId)).every(r => r.webm > 500 && r.wav > 16000) && fs.existsSync(path.join(RECDIR, 'flpt1', newId, 'SR1.wav')), 'arquivos de áudio reais gravados (webm + wav 16 kHz)');
  { const hdr = fs.readFileSync(path.join(RECDIR, 'flpt1', newId, 'SR1.wav')); ok(hdr.toString('ascii', 0, 4) === 'RIFF' && hdr.readUInt32LE(24) === 16000 && hdr.readUInt16LE(22) === 1 && hdr.readUInt16LE(34) === 16, 'WAV 16 kHz mono PCM16'); }
  ok(evalCalls.some(c => c.kind === 'repeat' && c.ref.length > 5) && evalCalls.some(c => c.kind === 'interview'), 'avaliação chamada com o tipo e a frase de referência');
  ok(await p.$$eval('#app .rvi', a => a.length) === 11 && await p.$$eval('#app .rvi audio', a => a.length) === 11, 'revisão com 11 itens e áudio');
  ok(await p.$eval('#app', e => e.querySelector('.diff del.miss') && /Estimativa|estimativa/.test(e.innerText)), 'L&R mostra a comparação palavra a palavra; Interview mostra a estimativa');
  await p.screenshot({ path: SH5('review'), fullPage: true });
  // autoavaliação de um item substitui a automática; e a média aparece
  const autoAvg = await p.evaluate('spScore(P.simuladoAtual, simTest("flpt1"), P.simuladoAtual.self).repeat.media');
  ok(Math.abs(autoAvg - 4) < 0.01, 'média automática do Listen and Repeat (' + autoAvg + ')');
  await p.select('#app .rvi[data-k=SR1] [data-rvself]', '2'); await sleep(80);
  ok(await p.evaluate('P.simuladoAtual.gravacoes.SR1.self') === '2', 'nota própria do item gravada');
  await p.$eval('#app .rvi[data-k=SI1] textarea', e => { e.value = 'faltou exemplo'; e.dispatchEvent(new Event('input', { bubbles: true })); }); await sleep(80);
  // IA na transcrição (sem chave → mensagem; com chave → resultado)
  await p.click_('#app .rvi[data-k=SI1] [data-act=rvia]'); await sleep(300);
  ok(await p.$eval('#app .rvi[data-k=SI1]', e => /chave/i.test(e.innerText)) || await p.$$eval('.toast', a => a.some(e => /Salve uma chave da OpenAI/.test(e.textContent))), 'IA sem chave avisa para configurar');
  aiKeys.openai = 'sk-fake-123456789';
  await p.click_('#app .rvi[data-k=SI1] [data-act=rvia]'); await sleep(200); await p.cfIf(1500); await sleep(1200);
  ok(await p.evaluate('!!(P.simuladoAtual.gravacoes.SI1.ia && P.simuladoAtual.gravacoes.SI1.ia.score === 3)'), 'avaliação por IA guardada no item');
  ok(await p.$eval('#app .rvi[data-k=SI1]', e => !!e.querySelector('.aibox')), 'resultado da IA aparece na revisão');
  await p.screenshot({ path: SH5('review-ai'), fullPage: true });
  await p.select('#self-repeat', ''); await p.click_('[data-act=simsave]'); await sleep(200);
  S = JSON.parse(store);
  ok(JSON.stringify(S.simulados.find(r => r.id === 'old1')) === old1 && fs.existsSync(path.join(RECDIR, 'flpt1', 'old1', 'SR1.webm')) && !recDeleted.some(r => /old1/.test(r)), 'tentativa completa antiga intacta (resultado e gravações)');
  const nr = S.simulados.find(r => r.id === newId);
  ok(nr && nr.mode !== 'full' && nr.secoes.join() === 'speaking' && Object.keys(nr.gravacoes).length === 11, 'tentativa nova salva só com Speaking e as 11 gravações');
  ok(nr && nr.gravacoes.SR1.rel && nr.gravacoes.SR1.transcricao && nr.gravacoes.SI1.metricas && nr.gravacoes.SI1.obs === 'faltou exemplo' && nr.gravacoes.SR1.self === '2', 'progresso.json: por item caminho do áudio, transcrição, métricas, nota própria e observação');
  ok(nr && nr.pontos.speaking && nr.pontos.speaking.repeat.itens === 7, 'pontos do Speaking com a média por item');
  ok(!store.includes('sk-fake-123456789'), 'chave da IA nunca vai para o progresso.json');
  ok(await p.has('#simrec .rvi audio') || await p.has('.rvi audio'), 'resultado salvo mostra a revisão com áudio');
  { await p.close(); p = await open('light'); await sleep(200); await p.evaluate(id => { TAB = 'sim'; SIM.view = { rec: id }; render(); }, newId); await sleep(300);
    const src = await p.$eval('.rvi audio', e => e.src).catch(() => ''); ok(/^https:\/\/rec\.treinotaltech\.example\/flpt1\//.test(src), 'depois de reabrir, o áudio vem da pasta de gravações (' + src.slice(0, 70) + ')');
    const dur = await p.$eval('.rvi audio', a => new Promise(r => { if (a.readyState >= 1) return r(a.duration); a.onloadedmetadata = () => r(a.duration); a.onerror = () => r(-1); setTimeout(() => r(-2), 4000); })).catch(() => -3);
    ok(recFetched.length > 0 && dur !== -1 && dur !== -3, 'áudio salvo carrega (' + dur + ')'); }
  const txt5 = await p.evaluate('exportText()'); ok(/SR1/.test(txt5) && /old words|transcri/i.test(txt5), 'exportar texto inclui as transcrições');
  // descartar não apaga gravações de tentativas salvas
  // 30c) treino livre: aba Speaking grava e registra
  await p.click_('[data-act=tab][data-v=speaking]'); await sleep(80);
  await p.click_('[data-act=sauto]'); await p.waitForFunction('REC.mr && REC.mr.state === "recording"', { timeout: 5000 }).catch(() => {}); await sleep(1500);
  ok(await p.$eval('.recind', e => e.classList.contains('on')), 'treino livre: REC aparece');
  await p.screenshot({ path: SH5('speaking-rec') });
  await p.click_('[data-act=sstop]'); await p.waitForFunction(() => { const F = P.falaAtual; return F && Object.values(F.gravacoes || {}).some(e => e.ev && e.ev.status === 'ok'); }, { timeout: 15000 }).catch(() => {});
  const F = await p.evaluate('P.falaAtual'); const fk = Object.keys((F && F.gravacoes) || {});
  ok(fk.length === 1 && F.gravacoes[fk[0]].rel.startsWith('pratica/' + F.id + '/') && F.gravacoes[fk[0]].transcricao, 'treino livre: gravação salva em pratica\\<sessão>\\ com transcrição');
  await p.screenshot({ path: SH5('speaking-review'), fullPage: true });
  const nf = JSON.parse(store).falas.length; await p.click_('[data-act=slog]'); await sleep(100);
  ok(JSON.parse(store).falas.length === nf + 1 && Object.keys(JSON.parse(store).falas.slice(-1)[0].gravacoes).length === 1 && JSON.parse(store).falaAtual === null, 'Registrar sessão leva as gravações para o histórico');
  // 30d) Configurações: gravações + IA
  aiKeys = {}; await p.click_('[data-act=tab][data-v=settings]'); await sleep(300);
  ok(await p.has('#s-rec') && await p.has('#s-ai'), 'Configurações com Gravações e Avaliação por IA');
  ok(await p.$eval('#recsize', e => /gravações/.test(e.textContent)), 'espaço usado pelas gravações');
  await p.type('#aikey', 'sk-test-abcdefgh1234'); await p.click_('[data-act=aisave]'); await sleep(300);
  ok(aiKeys.openai === 'sk-test-abcdefgh1234' && await p.$eval('#aikey', e => e.value === '') && !store.includes('abcdefgh1234'), 'chave salva pelo Go (DPAPI), campo limpo, fora do progresso');
  await p.click_('[data-act=aitest]'); await sleep(1200);
  ok(await p.$eval('#aimsg', e => /✓/.test(e.textContent)), 'testar chave mostra ✓');
  await p.screenshot({ path: SH5('settings'), fullPage: true });
  await p.click_('[data-act=aidel]'); await p.cf(); await sleep(200); ok(!aiKeys.openai, 'remover chave');
  await p.click_('[data-act=recset][data-v=off]'); await sleep(100); ok(JSON.parse(store).settings.gravar === false, 'desligar gravação');
  await p.click_('[data-act=recset][data-v=on]'); await sleep(100);
  // 30e) EN
  await p.evaluate('P.settings.language = "en"; SIM.view = { rec: "' + newId + '" }; TAB = "sim"; render()'); await sleep(200);
  ok(await p.$eval('#app', e => /Listen and Repeat/.test(e.innerText) && /estimate/i.test(e.innerText) && /Open folder/.test(e.innerText)), 'revisão em EN');
  await p.screenshot({ path: SH5('review-en'), fullPage: true });
  await p.evaluate('P.settings.language = "pt"; persist(true)');
  await p.close();

  // ===================== v1.6.0: pacotes de conteúdo, atualizações, modelo de fala =====================
  console.log('31) v1.6.0: pacotes de conteúdo');
  const SH6 = n => '/workspace/treino-app/shots/v160-' + n + '.png';
  const ETS_PV = { id: 'ets-toefl', name: 'Simulados TOEFL (local)', version: '2026.11', type: 'ets', description: 'Pacote local de simulados', files: 412, bytes: 10321000, tests: ETSJ.tests.map(t => t.id), file: 'simulados-toefl.zip', existing: '' };
  const ARQ_PV = { id: 'meus-arquivos', name: 'Meus materiais', version: '1', type: 'arquivos', files: 4, bytes: 3456789, file: 'meus-arquivos.zip', existing: '',
    list: [{ path: 'Gramática/conectivos.pdf', size: 1200000, ext: 'pdf', open: true }, { path: 'Speaking/modelo-resposta.mp3', size: 2200000, ext: 'mp3', open: true }, { path: 'notas.txt', size: 789, ext: 'txt', open: true }, { path: 'ferramentas/script.bat', size: 56000, ext: 'bat', open: false }] };
  etsMode = 'none'; packs = []; packCalls = []; store = JSON.stringify(Object.assign(JSON.parse(store), { ultimaVersaoVista: '1.6.0' }));
  p = await open('light'); await sleep(100);
  await p.click_('[data-act=tab][data-v=settings]'); await sleep(250);
  ok(await p.has('#s-content') && await p.has('#s-upd'), 'Configurações com Conteúdo (pacotes) e Atualizações');
  ok(await p.$$eval('#app > .card', a => a.map(e => e.id).filter(Boolean).join(',')) === 's-theme,s-lang,s-pron,s-data,s-content,s-rec,s-ai,s-upd,s-about', 'ordem dos cartões: ... Dados, Conteúdo, Gravações, IA, Atualizações, Sobre');
  ok(await p.has('#pknone') && await p.$eval('#pkets', e => e.innerText === 'Nenhum conteúdo de simulado instalado. Importe um pacote (.zip).'), 'sem pacotes: "Nenhum pacote instalado" e "Nenhum conteúdo de simulado instalado. Importe um pacote (.zip)."');
  ok(await p.$eval('#s-content', e => !/ETS|oficial|ETS-pack/i.test(e.innerText)), 'Conteúdo (pacotes): texto genérico, sem citar pacote ETS nem conteúdo oficial');
  await (await p.$('#s-content')).screenshot({ path: SH6('conteudo') });
  // cancelar o diálogo nativo: nada acontece
  packPick = null; await p.click_('[data-act=pkimport]'); await sleep(150);
  ok(!(await p.modal()) && packCalls.join() === 'pick', 'cancelar o diálogo de abrir não importa nada');
  // importar o pacote de simulados
  packPick = Object.assign({}, ETS_PV); await p.click_('[data-act=pkimport]'); await sleep(150);
  ok(await p.cfOpen() && await p.$eval('#cfbox', e => /Importar este pacote\?/.test(e.innerText) && /Tipo\s+Simulados/.test(e.innerText) && !/ETS/.test(e.innerText) && /7 simulados/.test(e.innerText) && /simulados-toefl\.zip/.test(e.innerText)), 'confirmação no modal do app mostra arquivo, tipo e 7 simulados');
  await p.screenshot({ path: SH6('importar-confirmar') });
  await p.click_('#modal [data-act=cfok]'); await sleep(450);
  ok(await p.$eval('#pkjob', e => /Importando/.test(e.innerText) && !!e.querySelector('.bar')), 'barra de progresso durante a importação');
  await sleep(1300);
  ok(packCalls.includes('import') && packs.length === 1, 'goPackImportStart chamado');
  ok(await p.evaluate('ETS_STATE') === 'ok' && await p.$eval('#pkets', e => /7 simulados instalados/.test(e.innerText)), 'depois de importar, simulados carregados (7 simulados instalados) sem reiniciar');
  ok(await p.$eval('#pklist', e => /Simulados TOEFL \(local\)/.test(e.innerText) && /v2026\.11/.test(e.innerText) && !/ETS/.test(e.innerText)), 'pacote aparece na lista');
  await p.click_('[data-act=tab][data-v=sim]'); await sleep(150);
  ok(!(await p.has('#simnone')) && await p.$$eval('tr[data-test]', a => a.length) === 7, 'aba Simulados volta a listar os 7 testes pelo pacote');
  // importar um pacote de arquivos
  await p.click_('[data-act=tab][data-v=settings]'); await sleep(250);
  packPick = Object.assign({}, ARQ_PV); await p.click_('[data-act=pkimport]'); await sleep(150);
  ok(await p.$eval('#cfbox', e => /Arquivos/.test(e.innerText) && /4 arquivos/.test(e.innerText)), 'confirmação do pacote de arquivos');
  await p.click_('#modal [data-act=cfok]'); await sleep(1700);
  ok(await p.$$eval('#pklist .pk', a => a.length) === 2, 'dois pacotes na lista');
  await p.click_('[data-act=pkfiles][data-v=meus-arquivos]'); await sleep(100);
  ok(await p.$$eval('[data-pk=meus-arquivos] .pkfiles li', a => a.length) === 4 && await p.$$eval('[data-pk=meus-arquivos] [data-act=pkopen]', a => a.length) === 3, 'lista de arquivos: 4 itens, 3 abríveis (o .bat não)');
  await (await p.$('#s-content')).screenshot({ path: SH6('pacotes') });
  await p.click_('[data-act=pkopen][data-v="Gramática/conectivos.pdf"]'); await sleep(100);
  ok(packCalls.includes('open:meus-arquivos:Gramática/conectivos.pdf'), 'Abrir chama goPackOpenFile (programa padrão do Windows)');
  await p.click_('[data-act=pkfolder][data-v=ets-toefl]'); await sleep(60); ok(packCalls.includes('folder:ets-toefl'), 'Abrir pasta do pacote');
  await p.click_('[data-act=pkfolder][data-v=""]'); await sleep(60); ok(packCalls.includes('folder:'), 'Abrir pasta dos pacotes chama goPackOpenFolder("")');
  packFolderErr = 'pasta:abrir: explore: ShellExecute 2; open: ShellExecute 2; explorer.exe: exec: not found';
  await p.click_('[data-act=pkfolder][data-v=""]'); await sleep(120);
  { const tt = await p.$$eval('.toast', a => a.map(e => e.textContent).join(' | '));
    ok(/Explorer/.test(tt) && /ShellExecute 2/.test(tt) && !/^Erro: pasta:/.test(tt), 'falha real ao abrir a pasta vira aviso no app: ' + tt.slice(-160)); }
  packFolderErr = 'pac:nao_instalado'; await p.click_('[data-act=pkfolder][data-v=ets-toefl]'); await sleep(120);
  ok(await p.$$eval('.toast', a => a.some(e => /não está mais instalado|no longer installed/.test(e.textContent))), 'pacote sumido: aviso claro');
  packFolderErr = '';
  // reimportar o mesmo id: aviso de substituição
  packPick = Object.assign({}, ETS_PV, { existing: '2026.11', version: '2026.12' }); await p.click_('[data-act=pkimport]'); await sleep(150);
  ok(await p.$eval('#cfbox', e => /Substitui a versão 2026\.11/.test(e.innerText)) && await p.$eval('#modal [data-act=cfok]', e => e.innerText === 'Substituir'), 'reimportar avisa que substitui a versão instalada');
  await p.click_('#modal [data-act=cfno]'); await sleep(100); ok(!(await p.modal()) && packs.find(x => x.id === 'ets-toefl').version === '2026.11', 'Cancelar não importa');
  // erro de validação vindo do Go
  packPick = Object.assign({}, ETS_PV, { fail: 'zip:caminho_invalido: "../x"' }); await p.click_('[data-act=pkimport]'); await sleep(150); await p.cf(); await sleep(1600);
  ok(await p.$eval('#pkjob', e => /caminhos inseguros/.test(e.innerText)), 'erro de pacote traduzido no app');
  await p.click_('[data-act=tab][data-v=prog]'); await p.click_('[data-act=tab][data-v=settings]'); await sleep(200);
  ok(await p.$eval('#pkjob', e => /caminhos inseguros/.test(e.innerText)), 'o erro continua visível ao voltar para Configurações');
  // remover o pacote de simulados
  await p.click_('[data-act=pkdel][data-v=ets-toefl]'); await sleep(150);
  ok(await p.$eval('#cfbox', e => /Remover o pacote/.test(e.innerText) && /Os Simulados voltam a pedir o pacote/.test(e.innerText)) && await p.$eval('#modal [data-act=cfok]', e => e.classList.contains('danger')), 'remover pede confirmação (botão de perigo)');
  await p.click_('#modal [data-act=cfok]'); await sleep(300);
  ok(packCalls.includes('rm:ets-toefl') && packs.length === 1 && await p.evaluate('ETS_STATE') === 'none', 'pacote de simulados removido, Simulados sem conteúdo');
  ok(await p.$$eval('#pklist .pk', a => a.length) === 1, 'lista atualizada depois de remover');
  ok(JSON.parse(store).schemaVersion === 6, 'progresso continua no schema 6');
  // EN
  await p.click_('[data-act=lang][data-v=en]'); await sleep(250);
  ok(await p.$eval('#s-content', e => /Content \(packs\)/.test(e.innerText) && /Import pack \(\.zip\)/.test(e.innerText) && /(Show|Hide) files/.test(e.innerText)) && await p.$eval('#s-upd', e => /Check for updates/.test(e.innerText)), 'Conteúdo e Atualizações em EN');
  ok(await p.$eval('#s-content', e => /No practice-test content installed\. Import a pack \(\.zip\)\./.test(e.innerText) && !/ETS|official/i.test(e.innerText)), 'Conteúdo em EN: "No practice-test content installed. Import a pack (.zip)."');
  // Avaliação por IA: grade alinhada (rótulos e campos) e campo da chave no mesmo estilo/altura dos botões
  const aiGeo = () => p.evaluate(() => { const q = s => document.querySelector(s), r = s => q(s).getBoundingClientRect(), kids = [...q('#aiform').children];
    const L = kids.filter((_, i) => i % 2 === 0).map(e => e.getBoundingClientRect()), V = kids.filter((_, i) => i % 2 === 1).map(e => e.getBoundingClientRect());
    const mk = r('#aimodel'), ky = r('#aikey'), sv = r('[data-act=aisave]'), cm = getComputedStyle(q('#aimodel')), ck = getComputedStyle(q('#aikey')), mid = b => b.top + b.height / 2;
    const spread = a => Math.max(...a) - Math.min(...a);
    return { n: kids.length, lab: spread(L.map(b => b.left)) <= 1, val: spread(V.map(b => b.left)) <= 1, inLeft: Math.abs(mk.left - ky.left) <= 1, inW: Math.abs(mk.width - ky.width) <= 1,
      h: Math.abs(ky.height - sv.height) <= 1 && Math.abs(mk.height - sv.height) <= 1, row: Math.abs(mid(ky) - mid(sv)) <= 1,
      labMid: Math.abs(mid(L[1]) - mid(mk)) <= 2 && Math.abs(mid(L[2]) - mid(ky)) <= 2,
      style: ['backgroundColor', 'borderTopColor', 'borderTopWidth', 'borderRadius', 'paddingLeft', 'fontSize', 'color'].every(k => cm[k] === ck[k]) && ck.borderRadius === getComputedStyle(q('[data-act=aisave]')).borderRadius,
      field: ck.backgroundColor === getComputedStyle(document.documentElement).getPropertyValue('--field').trim() || ck.backgroundColor !== 'rgb(255, 255, 255)' || document.documentElement.dataset.theme !== 'dark' }; });
  for (const th of ['light', 'dark']) for (const lg of ['pt', 'en']) for (const pr of ['openai', 'gemini']) {
    await p.click_(`[data-act=theme][data-v=${th}]`); await sleep(80); await p.click_(`[data-act=lang][data-v=${lg}]`); await sleep(150); await p.click_(`[data-act=aiprov][data-v=${pr}]`); await sleep(150);
    const g = await aiGeo(), tag = `IA ${th}/${lg}/${pr}`;
    ok(g.n === 6 && g.lab && g.val && g.labMid, `${tag}: rótulos (Chave salva, Modelo, Chave da API) e valores alinhados numa grade`);
    ok(g.inLeft && g.inW && g.h && g.row, `${tag}: campos Modelo e Chave com mesma largura/início e mesma altura dos botões, na mesma linha`);
    ok(g.style, `${tag}: campo da chave com o mesmo estilo do campo Modelo (fundo, borda, cantos, padding)`);
    ok(await p.$eval('#aikey', (e, pr) => e.placeholder === (pr === 'openai' ? 'sk-…' : 'AIza…'), pr), `${tag}: placeholder da chave`);
    if (th === 'dark' && lg === 'en' && pr === 'openai') { await p.evaluate(() => document.querySelector('#s-ai').scrollIntoView({ block: 'center' })); await sleep(80); await (await p.$('#s-ai')).screenshot({ path: SH6('ai-settings') }); }
    if (th === 'dark' && lg === 'en' && pr === 'gemini') { await p.evaluate(() => document.querySelector('#s-ai').scrollIntoView({ block: 'center' })); await sleep(80); await (await p.$('#s-ai')).screenshot({ path: SH6('ai-settings-gemini') }); }
    if (th === 'light' && lg === 'pt' && pr === 'openai') { await p.evaluate(() => document.querySelector('#s-ai').scrollIntoView({ block: 'center' })); await sleep(80); await (await p.$('#s-ai')).screenshot({ path: SH6('ai-settings-pt') }); }
  }
  await p.focus('#aikey'); await sleep(50);
  ok(await p.$eval('#aikey', e => getComputedStyle(e).outlineStyle === 'solid' && getComputedStyle(e).outlineWidth === '2px'), 'campo da chave com anel de foco do app');
  await p.click_('[data-act=aiprov][data-v=openai]'); await p.click_('[data-act=theme][data-v=system]'); await sleep(80);
  await p.click_('[data-act=lang][data-v=pt]'); await sleep(150);
  await p.close();

  console.log('32) v1.6.0: atualizações');
  updMock = true; updLatest = '1.7.0'; updErr = ''; updCalls = []; opened = [];
  { const s0 = JSON.parse(store); delete s0.settings.atualizacoes; store = JSON.stringify(s0); }
  p = await open('light'); await sleep(1200);
  ok(updCalls.filter(x => x === 'check').length === 1, 'procura automática ao abrir (padrão ligado)');
  ok(await p.$eval('#updbar', e => !e.hidden && /v1\.7\.0/.test(e.innerText) && /Ver e instalar/.test(e.innerText) && /Depois/.test(e.innerText)), 'aviso de nova versão no topo');
  ok(JSON.parse(store).settings.atualizacoes.ultima && JSON.parse(store).settings.atualizacoes.auto === true && JSON.parse(store).settings.atualizacoes.disponivel === '1.7.0', 'guarda a data da última verificação');
  await p.screenshot({ path: SH6('aviso-atualizacao') });
  await p.click_('[data-act=tab][data-v=sim]'); await sleep(100);
  ok(await p.$eval('#updbar', e => !e.hidden), 'o aviso continua ao trocar de aba (fica fora do #app)');
  await p.click_('[data-act=updlater]'); await sleep(100);
  ok(await p.$eval('#updbar', e => e.hidden) && JSON.parse(store).settings.atualizacoes.ignorada === '1.7.0', 'Depois esconde o aviso desta versão');
  await p.close();
  p = await open('light'); await sleep(800);
  ok(updCalls.filter(x => x === 'check').length === 1 && await p.$eval('#updbar', e => e.hidden), 'reabrir no mesmo dia: não procura de novo e não mostra o aviso ignorado');
  await p.click_('[data-act=tab][data-v=settings]'); await sleep(250);
  await p.click_('[data-act=updcheck]'); await sleep(900);
  ok(await p.has('#updnew') && await p.$eval('#updnew', e => /Nova versão disponível: v1\.7\.0/.test(e.innerText) && /Melhorias nos Simulados/.test(e.innerText) && /SHA-256/.test(e.innerText)), 'Procurar atualizações mostra a versão nova, as notas e o SHA-256');
  await (await p.$('#s-upd')).screenshot({ path: SH6('atualizacoes') });
  await p.click_('#updnew [data-act=simurl]'); await sleep(60); ok(/releases\/tag\/v1\.7\.0$/.test(opened[opened.length - 1] || ''), 'Ver no GitHub abre a página da versão');
  await p.click_('[data-act=updinstall]'); await sleep(150);
  ok(await p.cfOpen() && await p.$eval('#cfbox', e => /Instalar a v1\.7\.0 agora\?/.test(e.innerText) && /progresso/.test(e.innerText)), 'Baixar e instalar pede confirmação no modal do app');
  await p.click_('#modal [data-act=cfok]'); await sleep(500);
  ok(await p.$eval('#updbox', e => /Baixando atualização/.test(e.innerText) && !!e.querySelector('.bar')), 'progresso do download');
  await (await p.$('#s-upd')).screenshot({ path: SH6('baixando') });
  await sleep(1300);
  ok(updCalls.includes('install') && await p.$eval('#updbox', e => /A v1\.7\.0 foi instalada/.test(e.innerText)) && await p.has('[data-act=updrestart]'), 'instalada: botão Reiniciar agora');
  await p.click_('[data-act=updrestart]'); await sleep(200);
  ok(updCalls.some(x => x === 'restart:saved'), 'Reiniciar salva o progresso e chama goUpdateRestart');
  // erros
  updInstallErr = 'dl:sha'; await p.evaluate('UPD.installed = null; updPaint()'); await p.click_('[data-act=updinstall]'); await p.cf(); await sleep(1700);
  ok(await p.$eval('#updbox', e => /não confere com o SHA-256/.test(e.innerText)), 'SHA-256 errado: mensagem no app');
  updErr = 'upd:offline: dial tcp'; await p.click_('[data-act=updcheck]'); await sleep(900);
  ok(await p.$eval('#upderr', e => /Sem conexão com o GitHub/.test(e.innerText)), 'offline: mensagem no app');
  updErr = 'upd:limite'; await p.click_('[data-act=updcheck]'); await sleep(900);
  ok(await p.$eval('#upderr', e => /limitou/.test(e.innerText)), 'limite do GitHub: mensagem no app');
  updErr = ''; updLatest = '1.6.0'; await p.click_('[data-act=updcheck]'); await sleep(900);
  ok(await p.has('#updnone') && await p.$eval('#updbar', e => e.hidden), 'mesma versão: "Você está na versão mais recente"');
  await p.click_('[data-act=updauto][data-v=off]'); await sleep(100);
  ok(JSON.parse(store).settings.atualizacoes.auto === false, 'desligar a procura automática');
  await p.close();
  { const s0 = JSON.parse(store); s0.settings.atualizacoes.ultima = '2026-01-01T00:00:00Z'; store = JSON.stringify(s0); }
  const nc = updCalls.length; p = await open('light'); await sleep(600);
  ok(updCalls.length === nc, 'procura automática desligada: não consulta ao abrir');
  await p.close();
  updMock = false;

  console.log('33) v1.6.0: modelo de fala baixado na primeira vez');
  sttOk = false; mdlCalls = 0; p = await open('light'); await sleep(100);
  await p.click_('[data-act=tab][data-v=settings]'); await sleep(300);
  ok(await p.has('#sttst [data-act=mdl]') && await p.$eval('#sttst', e => /Baixar modelo de fala/.test(e.innerText) && /MB/.test(e.innerText)), 'sem modelo: botão Baixar modelo de fala');
  ok(await p.evaluate('errText("stt:sem_modelo")').then(t => /Configurações → Gravações do Speaking/.test(t)), 'erro de modelo ausente aponta para o botão');
  await p.click_('[data-act=mdl]'); await sleep(500);
  ok(await p.$eval('#sttst', e => /Baixando o modelo/.test(e.innerText) && !!e.querySelector('.bar')), 'progresso do download do modelo');
  await (await p.$('#s-rec')).screenshot({ path: SH6('modelo') });
  await sleep(1300);
  ok(mdlCalls === 1 && sttOk && await p.$eval('#sttst', e => /pronto/.test(e.innerText)), 'depois do download: reconhecimento pronto');
  await p.close();

  await b.close();
  ok(nativeDialogs.length === 0, 'v1.4.3: nenhum diálogo nativo (confirm/alert/prompt) durante os testes');
  console.log(`\nRESULTADO: ${pass} ok, ${fail} falhas | erros JS: ${errors.length ? errors.join(' | ') : 'nenhum'}`);
  process.exit(fail || errors.length ? 1 : 0);
})().catch(e => { console.error('FALHA', e); process.exit(1); });
