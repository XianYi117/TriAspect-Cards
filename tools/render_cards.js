// 依卡表 data/cards.json 產生 54 張卡圖 PNG（750×1050，沿用原卡面版型）。
// 用法：node tools/render_cards.js <輸出資料夾>（需要 playwright）
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const OUT = path.resolve(process.argv[2] || 'cards');
const data = require('../data/cards.json');
const COL = { R: { main: '#9c181b', ink: '#9c181b', gem: '#ffd3a4', dot: '#ff5a3c' }, G: { main: '#16583a', ink: '#17603d', gem: '#d3ecb3', dot: '#3fbf6a' }, B: { main: '#1d4f9a', ink: '#163f86', gem: '#d6edff', dot: '#4aa8f0' } };
const GEM = {
  R: '<svg viewBox="0 0 60 60"><path d="M30 6 L54 30 L30 54 L6 30 Z" fill="currentColor"/></svg>',
  B: '<svg viewBox="0 0 60 60"><circle cx="30" cy="30" r="24" fill="currentColor"/></svg>',
  G: '<svg viewBox="0 0 60 60"><path d="M30 5 C46 16 52 32 30 55 C8 32 14 16 30 5 Z" fill="currentColor"/><path d="M30 14 V50" stroke="#16583a" stroke-width="3"/></svg>',
};
const TYPE = { 魔法: '魔法', 干擾: '干擾', 立即: '立即' };
function rng(seed) { let s = 0; for (const ch of seed) s = (s * 31 + ch.charCodeAt(0)) >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
function dots(c) {
  const r = rng(c.id), out = [];
  for (let k = 0; k < 46; k++) {
    // 只灑在羊皮紙外框（內框以外的區域）
    let x, y; const side = Math.floor(r() * 4);
    if (side === 0) { x = 6 + r() * 648; y = 4 + r() * 26; } else if (side === 1) { x = 6 + r() * 648; y = 496 + r() * 30; }
    else if (side === 2) { x = 2 + r() * 28; y = 20 + r() * 490; } else { x = 632 + r() * 26; y = 20 + r() * 490; }
    const gold = r() < 0.35, size = 4 + r() * (gold ? 12 : 14);
    out.push(`<i style="left:${x.toFixed(0)}px;top:${y.toFixed(0)}px;width:${size.toFixed(0)}px;height:${size.toFixed(0)}px;background:${gold ? '#e4c99a' : COL[c.color].dot};opacity:${(0.55 + r() * 0.4).toFixed(2)}"></i>`);
  }
  return out.join('');
}
const full = s => s.replace(/\(/g, '（').replace(/\)/g, '）');
function cardHTML(c) {
  const k = COL[c.color];
  const fx = c.fx.map(f => { const [t, rest] = [f.slice(0, 2), f.slice(3)]; return `<div class="fx"><b>${TYPE[t] || t}</b><span>${full(rest)}</span></div>`; }).join('<hr>');
  return `<div class="card" style="--c:${k.main};--ink:${k.ink};--gem:${k.gem}">
    <div class="frame"></div><div class="inner"></div>
    <div class="banner"><span>${c.name}</span></div>
    <div class="cost">${c.cost}</div>
    <div class="gem">${GEM[c.color]}</div>
    <div class="art">${dots(c)}<div class="box"><div class="nm">${c.name}</div><div class="sub">CHARACTER ・ ${c.id}</div></div></div>
    <div class="fxbox">${fx}</div>
    <div class="foot"><span>◇ ${c.id} ◇</span></div>
    <div class="atk">${c.atk}</div>
    <div class="race">${c.race}</div>
  </div>`;
}
const CSS = `*{box-sizing:border-box;margin:0;padding:0}
body{background:transparent;font-family:"Noto Sans CJK TC","Noto Sans TC",sans-serif}
.card{position:relative;width:750px;height:1050px;background:#090e17;border-radius:34px;overflow:hidden}
.frame{position:absolute;inset:14px;border-radius:28px;border:8px solid #f5c86c;background:var(--c)}
.inner{position:absolute;inset:34px 30px;border-radius:16px;background:#1a110b;box-shadow:0 0 0 3px #0e0a07}
.banner{position:absolute;left:96px;right:96px;top:32px;height:104px;border-radius:16px;background:#111419;border:4px solid #f5c86c;display:grid;place-items:center}
.banner span{font-weight:900;font-size:52px;color:#fff3d8;letter-spacing:.04em}
.cost,.atk,.race,.gem{position:absolute;border-radius:50%;border:7px solid #f5c86c;display:grid;place-items:center;color:#fff;font-weight:900}
.cost{left:20px;top:22px;width:120px;height:120px;background:#0d2a52;font-size:66px}
.gem{right:22px;top:26px;width:110px;height:110px;background:var(--c);color:var(--gem)}
.gem svg{width:58px;height:58px}
.art{position:absolute;left:46px;top:146px;width:660px;height:530px;border-radius:14px;background:#f4e6c6;border:4px solid #e7c98a}
.art i{position:absolute;border-radius:50%}
.box{position:absolute;left:28px;top:28px;right:28px;bottom:36px;border-radius:16px;background:#fff4dc;border:5px solid var(--ink);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px}
.box::before,.box::after{content:"";position:absolute;left:18px;right:18px;height:3px;background:#dcc08a}
.box::before{top:14px}.box::after{bottom:14px}
.nm{font-weight:900;font-size:80px;color:var(--ink);letter-spacing:.02em}
.sub{font-weight:700;font-size:23px;color:#9e8764;letter-spacing:.06em}
.fxbox{position:absolute;left:50px;right:50px;top:682px;height:228px;border-radius:16px;background:#fff3d8;border:7px solid #f5c86c;padding:8px 10px;display:flex;flex-direction:column;gap:6px}
.fxbox hr{border:0;height:2px;background:#e3c993;margin:0 6px}
.fx{display:flex;gap:12px;align-items:flex-start}
.fx b{flex:none;background:#14171d;color:#fff;font-size:24px;font-weight:900;width:106px;height:44px;border-radius:10px;display:grid;place-items:center}
.fx span{font-size:24px;font-weight:800;color:#24201b;line-height:1.38;padding-top:4px}
.foot{position:absolute;left:112px;right:112px;top:918px;height:94px;border-radius:14px;background:#11151b;border:4px solid #f5c86c;display:grid;place-items:center}
.foot::before{content:"";position:absolute;left:48px;right:48px;top:50%;height:3px;background:#d4a747}
.foot span{position:relative;background:#11151b;padding:0 14px;color:#e1b657;font-weight:800;font-size:30px;letter-spacing:.06em}
.atk{left:22px;top:902px;width:126px;height:126px;background:var(--c);font-size:68px}
.race{right:22px;top:902px;width:126px;height:126px;background:#11151b;font-size:62px}`;
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
  const pg = await b.newPage({ viewport: { width: 750, height: 1050 } });
  for (const c of data.cards) {
    await pg.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body>${cardHTML(c)}</body></html>`);
    await pg.locator('.card').screenshot({ path: path.join(OUT, `${c.id}_${c.name}.png`), omitBackground: true });
  }
  await b.close();
  console.log(data.cards.length, 'cards →', OUT);
})();
