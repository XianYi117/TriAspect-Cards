// 平衡測試：各牌組互打勝率矩陣，可套用規則變體比較。用法：node tools/balance.js [每組局數]
const E = require('../src/engine.js');
const DATA = require('../data/cards.json');
const N = +process.argv[2] || 300;
const DECKS = { 紅: ['R'], 綠: ['G'], 藍: ['B'], 隨機: ['R', 'G', 'B'] };
const VARIANTS = {
  '現況': () => {},
  '他色效果費用→本色': d => d.fxP.forEach(f => { for (const k of ['R', 'G', 'B']) if (k !== d.color && f.cost[k]) { f.cost[d.color] += f.cost[k]; f.cost[k] = 0; } }),
  '他色效果費用→灰': d => d.fxP.forEach(f => { for (const k of ['R', 'G', 'B']) if (k !== d.color && f.cost[k]) { f.cost.X += f.cost[k]; f.cost[k] = 0; } }),
  '藍色角色攻擊力+1': d => { if (d.color === 'B') d.atk += 1; },
};
if (process.env.SUMMON === 'oneSame') E.RULES.summon = 'oneSame';
console.log('召喚規則：', E.RULES.summon === 'oneSame' ? '至少 1 張同色，其餘任意' : '全部同色（現行）');
async function run(name) {
  E.loadData(JSON.parse(JSON.stringify(DATA)));
  Object.values(E.DEFS()).forEach(VARIANTS[name]);
  const keys = Object.keys(DECKS), win = {}, games = {};
  let firstWins = 0, decided = 0, draws = 0, fx = 0, turns = 0, total = 0, combats = 0, atkDecides = 0;
  for (const a of keys) for (const b of keys) {
    for (let g = 0; g < N; g++) {
      E.newGame({ names: ['A', 'B'], leaders: [E.LEADERS[0], E.LEADERS[1]], decks: [E.buildDeck(DECKS[a]), E.buildDeck(DECKS[b])], ai: [true, true], first: g % 2 });
      await E.gameLoop();
      const o = E.G.over; total++; turns += E.G.turn;
      games[a] = (games[a] || 0) + 1; games[b] = (games[b] || 0) + 1;
      if (o.draw) draws++; else { decided++; win[[a, b][o.winner]] = (win[[a, b][o.winner]] || 0) + 1; if (o.winner === g % 2) firstWins++; }
      for (const l of E.G.log) {
        if (/發動【/.test(l.text)) fx++;
        const m = l.text.match(/^戰鬥結算：A (\d+) 對 B (\d+)/);
        if (m) combats++;
      }
    }
  }
  const pair = {};
  for (const a of keys) { pair[a] = {}; }
  console.log(`\n=== ${name} ===`);
  console.log('各牌組勝率（含平手局在分母）：', Object.fromEntries(keys.map(k => [k, Math.round(100 * (win[k] || 0) / games[k]) + '%'])));
  console.log(`平手率 ${Math.round(100 * draws / total)}%｜第1回合先攻方勝率（不含平手）${Math.round(100 * firstWins / decided)}%｜平均回合 ${(turns / total).toFixed(1)}｜每局發動效果 ${(fx / total).toFixed(1)} 次`);
}
(async () => { for (const v of (process.env.ONLY ? process.env.ONLY.split(',') : Object.keys(VARIANTS))) await run(v); })();
