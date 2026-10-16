// 把遊戲內的規則說明輸出成 A4 PDF。用法：node tools/rules_pdf.js（需要 playwright）
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const root = path.resolve(__dirname, '..');
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
  const pg = await b.newPage();
  await pg.goto('file://' + path.join(root, 'index.html'));
  const body = await pg.evaluate(() => rulesHTML());
  await pg.setContent(`<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><title>TriAspect Cards 規則說明</title><style>
    @page{size:A4;margin:16mm 15mm 16mm}
    body{font-family:"Noto Sans CJK TC","Noto Sans TC","PingFang TC","Microsoft JhengHei",sans-serif;color:#1d1a16;font-size:10.5pt;line-height:1.6;margin:0}
    .brand{display:flex;justify-content:space-between;align-items:baseline;border-bottom:2px solid #a8823c;padding-bottom:6px;margin-bottom:10px}
    .brand b{font-family:"Noto Serif CJK TC",serif;font-size:20pt;color:#8a6420;letter-spacing:.02em}.brand span{color:#777;font-size:9pt}
    h2{display:none}
    h3{font-family:"Noto Serif CJK TC",serif;color:#7a5718;font-size:13pt;margin:14px 0 6px;break-after:avoid}
    .r-lead{font-size:11.5pt;background:#f6efe0;border-left:4px solid #a8823c;padding:8px 12px;margin:0 0 6px}
    .r-lead b{color:#8a3a20}
    .r-keys{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
    .r-key{border:1px solid #d9cdb4;border-radius:6px;padding:8px 10px;break-inside:avoid}
    .r-k{font-weight:700;color:#7a5718;margin-bottom:3px}.r-key p{margin:0;font-size:9.5pt}
    ol.r-steps{margin:0;padding-left:20px}ol.r-steps li{margin-bottom:3px}
    table.r-fx{border-collapse:collapse;width:100%;font-size:10pt}table.r-fx th,table.r-fx td{border-bottom:1px solid #ddd;padding:5px 8px;text-align:left}table.r-fx th{color:#777;font-weight:500}
    .tag{color:#fff;padding:1px 6px;border-radius:3px;font-size:9pt}.tag.magic{background:#6d3fb0}.tag.inter{background:#a24a23}.tag.instant{background:#1d7f7a}
    .r-note{color:#555;font-size:9.5pt}
    details{margin-top:12px;break-inside:auto}details:first-of-type{break-before:page;margin-top:0}summary{font-family:"Noto Serif CJK TC",serif;color:#7a5718;font-size:13pt;font-weight:700;list-style:none;margin-bottom:4px}summary::-webkit-details-marker{display:none}
    .rules ul{margin:0;padding-left:18px}.rules li{margin-bottom:3px}
    .foot{margin-top:16px;border-top:1px solid #ddd;padding-top:6px;color:#888;font-size:8.5pt}
  </style></head><body>
  <div class="brand"><b>TriAspect Cards 規則說明</b><span>規則 v${await pg.evaluate(() => VERSION)}・測試版</span></div>
  ${body}
  <div class="foot">線上遊玩：https://xianyi117.github.io/TriAspect-Cards/</div>
  </body></html>`, { waitUntil: 'load' });
  await pg.evaluate(() => document.querySelectorAll('details').forEach(d => (d.open = true)));
  const out = path.join(root, 'docs', 'TriAspect-Cards-規則說明.pdf');
  await pg.pdf({ path: out, format: 'A4', printBackground: true, margin: { top: '16mm', bottom: '16mm', left: '15mm', right: '15mm' } });
  console.log(out);
  await b.close();
})();
