// 電腦對電腦自動對戰，用來找錯和看平衡。用法：node tools/simulate.js [局數]
const E = require('../src/engine.js');
E.loadData(require('../data/cards.json'));
const decks = [['R'], ['G'], ['B'], ['R', 'G', 'B']], names = ['紅', '綠', '藍', '隨機'];
const N = +process.argv[2] || 400;
(async () => {
  const unsupported = [];
  for (const d of Object.values(E.DEFS())) d.fxP.forEach(f => { if (!f.supported) unsupported.push(`${d.id} ${f.raw}`); });
  if (unsupported.length) console.log('尚未支援的效果：', unsupported);
  const res = { A勝: 0, B勝: 0, 平手: 0 }, turns = [], byDeck = {};
  for (let g = 0; g < N; g++) {
    const a = g % 4, b = (g >> 2) % 4;
    E.newGame({ names: ['A', 'B'], leaders: [E.LEADERS[0], E.LEADERS[1]], decks: [E.buildDeck(decks[a]), E.buildDeck(decks[b])], ai: [true, true], first: g % 2 });
    await E.gameLoop();
    const o = E.G.over;
    res[o.draw ? '平手' : o.winner === 0 ? 'A勝' : 'B勝']++;
    turns.push(E.G.turn);
    const k = names[a]; byDeck[k] = byDeck[k] || { 勝: 0, 局: 0 }; byDeck[k].局++; if (!o.draw && o.winner === 0) byDeck[k].勝++;
    for (const p of E.G.pl) {
      const n = p.deck.length + p.life.length + p.hand.length + p.discard.length + (p.field ? 1 : 0) + p.consume.filter(e => e.card).length;
      if (n !== 20) console.log(`第 ${g} 局張數錯誤：${n}`);
    }
  }
  turns.sort((x, y) => x - y);
  console.log(res, '回合中位數', turns[N >> 1], 'A 方各牌組勝場', byDeck);
})();
