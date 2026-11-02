// Composes the README hero banner (3200x1600) from the window captures made by readme_shots.js.
// usage: node tools/hero.js <shotsDir> <lang en|pt> <out.png>
const puppeteer = require('puppeteer-core'); const fs = require('fs'); const path = require('path');
const [DIR, LANG, OUTF] = [process.argv[2] || path.join(__dirname, '..', 'shots', 'readme'), process.argv[3] || 'en', process.argv[4]];
const VER = (fs.readFileSync(path.join(__dirname, '..', 'src', 'main.go'), 'utf8').match(/appVersion\s*=\s*"([^"]+)"/) || [])[1];
const T = { en: { name: 'TalTech Prep Trainer', lines: ['TalTech', 'Prep Trainer'], tag: 'Desktop study trainer for<br>GRE and TOEFL iBT preparation' },
            pt: { name: 'Treino TalTech', lines: ['Treino TalTech'], tag: 'Treinador de estudos para<br>GRE e TOEFL iBT' } }[LANG];
const img = f => 'data:image/png;base64,' + fs.readFileSync(f).toString('base64');
const icon = img(path.join(__dirname, '..', 'docs', 'images', 'icon.png'));
const win = (theme, cls) => `<div class="win ${theme} ${cls}"><div class="bar"><span class="ti"><img src="${icon}">${T.name} v${VER} | GRE + TOEFL</span><span class="ctl"><i>&#x2013;</i><i>&#x25A1;</i><i>&#x2715;</i></span></div><img class="shot" src="${img(path.join(DIR, `hero-${LANG}-${theme}.png`))}"></div>`;
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;width:1600px;height:800px;overflow:hidden}
body{background:linear-gradient(180deg,#14213d 0%,#35415a 25%,#7f8899 50%,#c9cfd9 75%,#eaeff5 100%);font-family:"Noto Sans","Segoe UI",sans-serif;position:relative}
.title{position:absolute;left:84px;top:50%;transform:translateY(-50%);color:#fff;width:540px}
.title .ic{width:112px;height:112px;display:block;margin-bottom:26px;filter:drop-shadow(0 8px 18px rgba(0,0,0,.35))}
.title h1{margin:0;font-size:70px;line-height:1.02;font-weight:800;letter-spacing:-1px;text-shadow:0 2px 14px rgba(10,20,40,.35)}
.title p{margin:22px 0 0;font-size:24px;line-height:1.35;color:#eef2f8;text-shadow:0 1px 8px rgba(10,20,40,.35)}
.win{position:absolute;width:774px;border-radius:12px;overflow:hidden;box-shadow:0 24px 60px rgba(8,16,34,.38),0 4px 14px rgba(8,16,34,.22)}
.win .shot{display:block;width:774px}
.bar{height:28px;display:flex;align-items:center;justify-content:space-between;padding-left:12px;font-size:12px}
.bar .ti{display:flex;align-items:center;gap:7px}.bar .ti img{width:15px;height:15px}
.bar .ctl{display:flex}.bar .ctl i{font-style:normal;width:40px;text-align:center;font-size:11px}
.light .bar{background:#f3f4f7;color:#2b3445;border-bottom:1px solid #e1e5ec}
.dark .bar{background:#0b1220;color:#c5cbd6;border-bottom:1px solid #1c2638}
.back{left:800px;top:22px}.front{left:630px;top:164px}
</style></head><body>
<div class="title"><img class="ic" src="${icon}"><h1>${T.lines.join('<br>')}</h1><p>${T.tag}</p></div>
${win('dark', 'back')}${win('light', 'front')}
</body></html>`;
(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--font-render-hinting=none'] });
  const p = await b.newPage(); await p.setViewport({ width: 1600, height: 800, deviceScaleFactor: 2 });
  await p.setContent(html, { waitUntil: 'load' }); await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: OUTF }); await b.close(); console.log('wrote', OUTF);
})();
