// ===== 規則引擎 v1.0.2 =====
// 與畫面無關；透過 IO 物件和畫面（或測試程式）溝通。
const CN = { R: '紅', G: '綠', B: '藍', X: '灰' };
const TN = { magic: '魔法', inter: '干擾', instant: '立即' };
const IO = { ask: null, choose: null, render: () => {}, sleep: () => Promise.resolve(), onLog: () => {} };

function parseOp(s) {
  let m;
  if ((m = s.match(/我方單位攻擊力\+(\d+)/))) return { op: 'buff', n: +m[1] };
  if ((m = s.match(/敵方單位攻擊力-(\d+)/))) return { op: 'debuff', n: +m[1] };
  if ((m = s.match(/敵方單位傷害-(\d+)/))) return { op: 'reduce', n: +m[1] };
  if (/抽2張牌，然後棄1張/.test(s)) return { op: 'drawDiscard' };
  if (/抽2張牌，然後放回1張/.test(s)) return { op: 'drawReturn' };
  if (/手牌中的2張牌放回牌庫/.test(s)) return { op: 'return2draw1' };
  if (/對手1張手牌回牌庫/.test(s)) return { op: 'oppMulligan' };
  if (/從棄牌堆隨機抽1張/.test(s)) return { op: 'salvage' };
  if ((m = s.match(/^抽(\d+)張牌/))) return { op: 'draw', n: +m[1] };
  if ((m = s.match(/回復(\d+)點血量/))) return { op: 'heal', n: +m[1] };
  if ((m = s.match(/直接造成(\d+)點傷害\(移至棄牌堆\)/))) return { op: 'burnDiscard', n: +m[1] };
  if ((m = s.match(/直接造成(\d+)點傷害/))) return { op: 'burn', n: +m[1] };
  if ((m = s.match(/對手隨機棄(\d+)張手牌/))) return { op: 'randDiscard', n: +m[1] };
  if (/對手選擇棄1張手牌/.test(s)) return { op: 'oppDiscard' };
  if (/手牌、牌庫頂各棄一張/.test(s)) return { op: 'discardHandTop' };
  if (/消耗費用\+1灰/.test(s)) return { op: 'tax', cost: { X: 1 } };
  if (/多花費1張藍色能量/.test(s)) return { op: 'tax', cost: { B: 1 } };
  if (/無法使用立即效果/.test(s)) return { op: 'noInstant' };
  if (/無效魔法效果/.test(s)) return { op: 'negate', magicOnly: true };
  if (/無效化?對手效果/.test(s)) return { op: 'negate' };
  if (/複製場上任意效果/.test(s)) return { op: 'copy' };
  if (/禁止使用魔法效果/.test(s)) return { op: 'seal' };
  if (/視為任意顏色/.test(s)) return { op: 'wild' };
  return { op: 'unknown', s };
}
function fullCost(c) { return { R: c.R || 0, G: c.G || 0, B: c.B || 0, X: c.X || 0 }; }
function parseFx(raw) {
  const m = raw.match(/^(魔法|干擾|立即)\/([^：:]+)[：:](.*)$/);
  if (!m) return { raw, type: 'magic', cost: fullCost({}), total: 0, body: raw, ops: [{ op: 'unknown' }], supported: false, interferable: true };
  const type = { 魔法: 'magic', 干擾: 'inter', 立即: 'instant' }[m[1]];
  const cost = fullCost({});
  m[2].split('+').forEach(s => { const k = s.match(/(紅|綠|藍|灰)(\d+)/); if (k) cost[{ 紅: 'R', 綠: 'G', 藍: 'B', 灰: 'X' }[k[1]]] += +k[2]; });
  const body = m[3].trim().replace(/[。．]+$/, '');
  let interferable = true;
  if (type === 'inter') interferable = false;
  // 立即效果：卡面寫「可被干擾」才能被干擾，沒寫視為不可被干擾（依設計說明第 5 點）
  if (type === 'instant') interferable = /\(可被干擾\)/.test(body);
  const clean = body.replace(/\(不?可被干擾\)/g, '').replace(/[。]/g, '');
  let ops = clean.split('、').map(s => parseOp(s.trim()));
  if (ops.some(o => o.op === 'unknown')) ops = [parseOp(clean)];
  return { raw, type, cost, total: cost.R + cost.G + cost.B + cost.X, body: clean, ops, supported: ops.every(o => o.op !== 'unknown'), interferable };
}
function costText(c) {
  const parts = ['R', 'G', 'B', 'X'].filter(k => c[k]).map(k => CN[k] + c[k]);
  return parts.length ? parts.join('+') : '免費';
}

let DEFS = {}, LEADERS = [];
function loadData(data) {
  DEFS = {};
  data.cards.forEach(c => { DEFS[c.id] = { ...c, fxP: c.fx.map(parseFx) }; });
  LEADERS = data.leaders;
}
let UID = 0;
function inst(def) { return { ...def, uid: ++UID, wild: false, usedFx: [] }; }
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

let G = null;
function freshFlags() { return { magic: false, instant: false, noInstant: false, sealed: false, mod: 0, reduce: 0 }; }
function mkPlayer(name, leader, ids, ai) {
  const deck = shuffle(ids.map(id => inst(DEFS[id])));
  const p = { name, ai, leader, hpMax: leader.hp, deck, life: [], hand: [], discard: [], field: null, consume: [], flags: freshFlags(), hiddenPick: false };
  p.life = deck.splice(deck.length - leader.hp);
  p.hand = deck.splice(deck.length - 5);
  return p;
}
function newGame(cfg) {
  UID = 0;
  G = { pl: [mkPlayer(cfg.names[0], cfg.leaders[0], cfg.decks[0], cfg.ai[0]), mkPlayer(cfg.names[1], cfg.leaders[1], cfg.decks[1], cfg.ai[1])],
        turn: 1, first: cfg.first, phase: 'setup', step: null, over: null, log: [], result: null, startedAt: Date.now(), turnStarts: [] };
  log(`對局開始：${G.pl[0].name}（${cfg.leaders[0].name}）對 ${G.pl[1].name}（${cfg.leaders[1].name}）`, 'sys');
  log(`雙方各抽 ${cfg.leaders[0].hp} 張作為生命牌堆、5 張起始手牌。猜拳由 ${G.pl[cfg.first].name} 第 1 回合先攻。`, 'sys');
  return G;
}
function log(text, who = 'sys') { const e = { t: G ? G.turn : 0, ms: G && G.startedAt ? Date.now() - G.startedAt : 0, text, who }; G.log.push(e); IO.onLog(e); }
// 毫秒轉成「分:秒」
function clock(ms) { const sec = Math.floor(ms / 1000); return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`; }
function durText(ms) { const sec = Math.round(ms / 1000); return sec >= 60 ? `${Math.floor(sec / 60)} 分 ${sec % 60} 秒` : `${sec} 秒`; }
const opp = i => 1 - i;
const P = i => G.pl[i];

// ---- 牌堆操作 ----
function draw(i, n) {
  const p = P(i);
  for (let k = 0; k < n; k++) {
    if (p.deck.length) p.hand.push(p.deck.pop());
    else if (p.life.length) { p.hand.push(p.life.pop()); log(`${p.name} 的牌庫已空，改從生命牌堆抽 1 張（生命剩 ${p.life.length}）`, i); }
  }
}
function damage(i, n, toHand) {
  const p = P(i); const k = Math.min(n, p.life.length);
  for (let a = 0; a < k; a++) { const c = p.life.pop(); (toHand ? p.hand : p.discard).push(c); }
  if (k) log(`${p.name} 失去 ${k} 張生命牌${toHand ? '，加入手牌' : '，移至棄牌堆'}（生命剩 ${p.life.length}）`, i);
}
function heal(i, n) {
  const p = P(i); const k = Math.min(n, p.hpMax - p.life.length, p.discard.length);
  for (let a = 0; a < k; a++) p.life.push(p.discard.pop());
  log(k ? `${p.name} 從棄牌堆頂回復 ${k} 張到生命牌堆（生命 ${p.life.length}）` : `${p.name} 的回復沒有效果（生命已滿或棄牌堆為空）`, i);
}
function removeFrom(arr, card) { const k = arr.indexOf(card); if (k >= 0) arr.splice(k, 1); return k >= 0; }
function undoEnergy(i, entry) {
  const p = P(i);
  if (entry.spent || !removeFrom(p.consume, entry)) return false;
  p.hand.push(entry.card);
  log(`${p.name} 將【${entry.card.name}】從消耗區返回手牌`, i);
  return true;
}
function toEnergy(i, card) {
  const p = P(i); removeFrom(p.hand, card);
  p.consume.push({ card, color: card.color, wild: card.wild, spent: false });
  log(`${p.name} 將【${card.name}】轉為${card.wild ? '任意色' : CN[card.color] + '色'}能量（橫置於消耗區）`, i);
}
function checkOver() {
  if (G.over) return true;
  const d = G.pl.map(p => p.life.length === 0);
  if (d[0] && d[1]) G.over = { draw: true };
  else if (d[0]) G.over = { winner: 1 };
  else if (d[1]) G.over = { winner: 0 };
  if (G.over) log(G.over.draw ? '雙方生命牌同時歸 0，平手！' : `${P(G.over.winner).name} 獲勝！${P(opp(G.over.winner)).name} 的生命牌歸 0。`, 'sys');
  return !!G.over;
}

// ---- 能量 ----
const unspent = p => p.consume.filter(e => !e.spent);
// 從可用來源中找出支付方式；來源依陣列順序優先使用
function planFrom(src, cost) {
  const avail = [...src], use = [];
  for (const col of ['R', 'G', 'B']) {
    for (let k = 0; k < cost[col]; k++) {
      let idx = avail.findIndex(a => !a.wild && a.color === col);
      if (idx < 0) idx = avail.findIndex(a => a.wild);
      if (idx < 0) return null;
      use.push(avail.splice(idx, 1)[0]);
    }
  }
  for (let k = 0; k < cost.X; k++) {
    let idx = avail.findIndex(a => !a.wild);
    if (idx < 0) idx = 0;
    if (!avail.length) return null;
    use.push(avail.splice(idx, 1)[0]);
  }
  return use;
}
function shortfall(p, cost) {
  const avail = unspent(p).slice(); const miss = { R: 0, G: 0, B: 0, X: 0 };
  for (const col of ['R', 'G', 'B']) for (let k = 0; k < cost[col]; k++) {
    let idx = avail.findIndex(a => !a.wild && a.color === col); if (idx < 0) idx = avail.findIndex(a => a.wild);
    if (idx < 0) miss[col]++; else avail.splice(idx, 1);
  }
  miss.X = Math.max(0, cost.X - avail.length);
  return ['R', 'G', 'B', 'X'].filter(k => miss[k]).map(k => (k === 'X' ? '任意' : CN[k] + '色') + '能量' + miss[k]).join('、');
}
function payFromPool(i, cost) {
  const plan = planFrom(unspent(P(i)), cost);
  if (!plan) return false;
  plan.forEach(e => (e.spent = true));
  return true;
}

// ---- 可否召喚 ----
// RULES.summon：'same' = 召喚費用全部要同色（現行規則）；'oneSame' = 至少 1 張同色，其餘任意色（測試用）
// freeEnergy：戰鬥階段開始時雙方各得幾點任意色能量（v1.0.3 起為 1，用來提高效果使用率）
const RULES = { summon: 'same', fieldDiscount: 0, freeEnergy: 1, modBonus: 0 };
// 實際要付的效果費用：戰場角色發動時可依 RULES.fieldDiscount 減免（先減灰，再減有色）
function effCost(fx, where) {
  const c = fullCost(fx.cost); let d = where === 'field' ? RULES.fieldDiscount : 0;
  for (const k of ['X', 'R', 'G', 'B']) { const t = Math.min(d, c[k]); c[k] -= t; d -= t; }
  return c;
}
const modN = op => op.n + RULES.modBonus;
// 把整個手牌都轉成能量的話，付不付得起（用來判斷要不要停下來問玩家）
function canEverPay(i, cost, exclude) {
  const p = P(i);
  return !!planFrom([...unspent(p), ...p.hand.filter(c => c !== exclude).map(c => ({ color: c.color, wild: c.wild }))], cost);
}
function actionCandidates(i) {
  const p = P(i), out = [];
  const consider = (where, card) => card.fxP.forEach((fx, idx) => {
    if (!fx.supported || fx.type === 'inter') return;
    if (where === 'field' && (card.usedFx.includes(idx) || (fx.type === 'magic' && p.flags.sealed))) return;
    if (fx.type === 'magic' && p.flags.magic) return;
    if (fx.type === 'instant' && (p.flags.instant || p.flags.noInstant)) return;
    if (fx.ops.some(o => o.op === 'copy') && !copyOptions().length) return;
    if (!canEverPay(i, effCost(fx, where), where === 'hand' ? card : null)) return;
    out.push({ where, card, idx });
  });
  p.hand.forEach(c => consider('hand', c));
  if (p.field) consider('field', p.field);
  return out;
}
const sameColor = (c, card) => c.color === card.color || c.wild;
function canSummon(p, card) {
  const others = p.hand.filter(c => c !== card);
  if (RULES.summon === 'oneSame') return others.length >= card.cost && others.some(c => sameColor(c, card));
  return others.filter(c => sameColor(c, card)).length >= card.cost;
}
function summonPayOptions(p, unit) { return RULES.summon === 'oneSame' ? p.hand.filter(c => c !== unit) : p.hand.filter(c => c !== unit && sameColor(c, unit)); }
function anySummon(p) { return p.hand.some(c => canSummon(p, c)); }

// ---- 效果可否發動 ----
function fieldCards() { return G.pl.map(p => p.field).filter(Boolean); }
function copyOptions() {
  const out = [];
  G.pl.forEach((p, pi) => { if (p.field) p.field.fxP.forEach((f, idx) => { if (f.type !== 'inter' && f.total <= 2 && f.supported && !f.ops.some(o => o.op === 'copy')) out.push({ card: p.field, fx: f, idx, pi }); }); });
  return out;
}
// 回傳 '' 代表可發動，否則回傳原因
function whyNot(i, where, card, idx, win) {
  const p = P(i), fx = card.fxP[idx];
  if (G.over) return '對局已結束';
  if (!fx.supported) return '此效果尚未支援';
  if (!win || win.who !== i) return '現在不是你的操作時機';
  if (win.type === 'summon') return '戰鬥階段才能發動';
  if (where === 'field') {
    if (p.field !== card) return '不在戰場上';
    if (card.usedFx.includes(idx)) return '本回合已發動過此效果';
    if (fx.type === 'magic' && p.flags.sealed) return '戰場角色的魔法效果已被封印';
  }
  if (win.type === 'action') {
    if (fx.type === 'inter') return '干擾效果只能用來回應對手';
    if (fx.type === 'magic' && p.flags.magic) return '本回合已發動過魔法效果';
    if (fx.type === 'instant' && p.flags.instant) return '本回合已發動過立即效果';
    if (fx.type === 'instant' && p.flags.noInstant) return '本回合被禁止使用立即效果';
  } else if (win.type === 'response') {
    if (fx.type !== 'inter') return '回應時只能發動干擾效果';
    if (fx.ops.some(o => o.op === 'negate' && o.magicOnly) && win.target.fx.type !== 'magic') return '只能無效魔法效果';
  } else return '現在不能發動';
  if (fx.ops.some(o => o.op === 'copy') && !copyOptions().length) return '場上沒有可複製的效果';
  const cost = effCost(fx, where);
  if (!planFrom(unspent(p), cost)) return '需要 ' + shortfall(p, cost);
  return '';
}

// ---- 選擇（真人或 AI） ----
const val = c => c.atk * 0.6 + c.cost * 0.5 + c.fxP.length * 0.5;
async function pick(i, cards, n, title, desc) {
  n = Math.min(n, cards.length);
  if (n <= 0) return [];
  if (P(i).ai) return cards.slice().sort((a, b) => val(a) - val(b)).slice(0, n);
  return IO.choose({ title, desc, items: cards.map(c => ({ card: c })), min: n, max: n }).then(r => r.map(x => x.card));
}

// ---- 發動與結算 ----
async function activate(i, where, card, idx) {
  const p = P(i), fx = card.fxP[idx];
  payFromPool(i, effCost(fx, where));
  if (where === 'hand') { removeFrom(p.hand, card); p.discard.push(card); } else card.usedFx.push(idx);
  if (fx.type === 'magic') p.flags.magic = true;
  if (fx.type === 'instant') p.flags.instant = true;
  log(`${p.name} 從${where === 'hand' ? '手牌' : '戰場'}發動【${card.name}】${TN[fx.type]}效果（${costText(effCost(fx, where))}）：${fx.body}`, i);
  IO.render();
  return { owner: i, card, fx, where, negated: false };
}
function responseCandidates(o, E) {
  const p = P(o), out = [];
  const consider = (where, card) => card.fxP.forEach((f, idx) => {
    if (f.type !== 'inter' || !f.supported) return;
    if (where === 'field' && card.usedFx.includes(idx)) return;
    if (f.ops.some(x => x.op === 'negate' && x.magicOnly) && E.fx.type !== 'magic') return;
    out.push({ where, card, idx, fx: f });
  });
  p.hand.forEach(c => consider('hand', c));
  if (p.field) consider('field', p.field);
  return out;
}
async function runEffect(E) {
  const o = opp(E.owner);
  if (E.fx.interferable) {
    const prev = G.step;
    G.step = { type: 'response', who: o, target: E };
    const cands = responseCandidates(o, E).filter(c => P(o).ai || canEverPay(o, effCost(c.fx, c.where), c.where === 'hand' ? c.card : null));
    if (cands.length) {
      const d = P(o).ai ? await aiResponse(o, E) : await IO.ask('response', { target: E });
      if (d && !G.over) {
        const I = await activate(o, d.where, d.card, d.idx);
        await resolve(I, E);
      } else if (!P(o).ai) log(`${P(o).name} 不干擾`, o);
    }
    G.step = prev;
  }
  if (G.over) return;
  if (E.negated) log(`【${E.card.name}】的效果被無效化`, 'sys');
  else await resolve(E, null);
  checkOver(); IO.render();
}
async function resolve(E, target) {
  for (const op of E.fx.ops) { if (G.over) return; await doOp(E, op, target); IO.render(); }
}
async function payExtra(i, cost) {
  const p = P(i);
  if (payFromPool(i, cost)) { log(`${p.name} 用能量池追加支付 ${costText(cost)}`, i); return true; }
  if (p.ai) {
    const plan = aiPlan(i, cost, null);
    if (!plan) return false;
    plan.cards.forEach(c => toEnergy(i, c)); payFromPool(i, cost);
    log(`${p.name} 追加支付 ${costText(cost)}`, i); return true;
  }
  const r = await IO.choose({
    title: '對手要求追加費用', desc: `需額外支付 ${costText(cost)}。能量池不夠，請選擇要轉為能量的手牌；放棄則這次效果無效。`,
    items: p.hand.map(c => ({ card: c })), min: 1, max: p.hand.length, cancelText: '放棄支付',
    validate: picked => !!planFrom([...unspent(p), ...picked.map(x => ({ color: x.card.color, wild: x.card.wild }))], cost),
  });
  if (!r) { log(`${p.name} 放棄追加支付`, i); return false; }
  r.forEach(x => toEnergy(i, x.card)); payFromPool(i, cost);
  log(`${p.name} 追加支付 ${costText(cost)}`, i); return true;
}
async function doOp(E, op, target) {
  const i = E.owner, me = P(i), o = opp(i), them = P(o);
  switch (op.op) {
    case 'buff': me.flags.mod += modN(op); log(`${me.name} 的戰場角色攻擊力 +${modN(op)}`, i); break;
    case 'debuff': them.flags.mod -= modN(op); log(`${them.name} 的戰場角色攻擊力 -${modN(op)}`, i); break;
    case 'reduce': me.flags.reduce += modN(op); log(`本回合 ${them.name} 的角色對 ${me.name} 造成的傷害 -${modN(op)}`, i); break;
    case 'draw': draw(i, op.n); log(`${me.name} 抽 ${op.n} 張牌`, i); break;
    case 'drawDiscard': { draw(i, 2); const c = await pick(i, me.hand, 1, '選擇要棄掉的 1 張牌', '抽 2 張後棄 1 張'); c.forEach(x => { removeFrom(me.hand, x); me.discard.push(x); }); log(`${me.name} 抽 2 張，棄掉 1 張`, i); break; }
    case 'drawReturn': { draw(i, 2); const c = await pick(i, me.hand, 1, '選擇放回牌庫頂的 1 張牌', '抽 2 張後放回 1 張'); c.forEach(x => { removeFrom(me.hand, x); me.deck.push(x); }); log(`${me.name} 抽 2 張，放回 1 張到牌庫頂`, i); break; }
    case 'heal': heal(i, op.n); break;
    case 'burn': damage(o, op.n, true); break;
    case 'burnDiscard': damage(o, op.n, false); break;
    case 'salvage': if (me.discard.length) { const c = me.discard.splice(Math.floor(Math.random() * me.discard.length), 1)[0]; me.hand.push(c); log(`${me.name} 從棄牌堆隨機取回【${c.name}】`, i); } else log('棄牌堆為空，沒有效果', i); break;
    case 'randDiscard': { const k = Math.min(op.n, them.hand.length); for (let a = 0; a < k; a++) them.discard.push(them.hand.splice(Math.floor(Math.random() * them.hand.length), 1)[0]); log(`${them.name} 隨機棄掉 ${k} 張手牌`, i); break; }
    case 'oppMulligan': { const c = await pick(o, them.hand, 1, '選擇 1 張手牌放回牌庫底', '對手效果：放回 1 張，再從牌庫頂抽 1 張'); c.forEach(x => { removeFrom(them.hand, x); them.deck.unshift(x); }); if (c.length) draw(o, 1); log(`${them.name} 將 1 張手牌放回牌庫底並抽 1 張`, i); break; }
    case 'seal': them.flags.sealed = true; log(`${them.name} 戰場角色的魔法效果本回合被封印`, i); break;
    case 'wild': { const c = await pick(i, me.hand, 1, '選擇 1 張手牌視為任意顏色', '本回合這張牌當能量時可當任意顏色'); c.forEach(x => (x.wild = true)); if (c[0]) log(`${me.name} 將【${c[0].name}】視為任意顏色`, i); break; }
    case 'copy': {
      const opts = copyOptions(); if (!opts.length) { log('沒有可複製的效果', i); break; }
      let ch;
      if (me.ai) ch = opts.slice().sort((a, b) => aiFxValue(i, b.fx) - aiFxValue(i, a.fx))[0];
      else { const r = await IO.choose({ title: '選擇要複製的效果', desc: '場上費用 2 以下的效果，不需另付費用', items: opts.map(x => ({ card: x.card, label: `${TN[x.fx.type]}（${costText(x.fx.cost)}）：${x.fx.body}`, ref: x })), min: 1, max: 1 }); ch = r[0].ref; }
      log(`${me.name} 複製【${ch.card.name}】的效果：${ch.fx.body}`, i);
      await resolve({ owner: i, card: E.card, fx: ch.fx, negated: false }, null); break;
    }
    // ---- 干擾 ----
    case 'negate': if (!op.magicOnly || target.fx.type === 'magic') target.negated = true; break;
    case 'oppDiscard': { const t = target.owner; const c = await pick(t, P(t).hand, 1, '選擇棄掉 1 張手牌', '對手的干擾效果'); c.forEach(x => { removeFrom(P(t).hand, x); P(t).discard.push(x); }); log(`${P(t).name} 棄掉 1 張手牌${c[0] ? '【' + c[0].name + '】' : ''}`, i); break; }
    case 'discardHandTop': { const t = target.owner, tp = P(t); const c = await pick(t, tp.hand, 1, '選擇棄掉 1 張手牌', '對手的干擾效果：手牌和牌庫頂各棄 1 張'); c.forEach(x => { removeFrom(tp.hand, x); tp.discard.push(x); }); if (tp.deck.length) tp.discard.push(tp.deck.pop()); log(`${tp.name} 從手牌和牌庫頂各棄 1 張`, i); break; }
    case 'return2draw1': { const t = target.owner, tp = P(t); const c = await pick(t, tp.hand, 2, '選擇 2 張手牌放回牌庫', '對手的干擾效果：放回後洗牌，再抽 1 張'); c.forEach(x => { removeFrom(tp.hand, x); tp.deck.push(x); }); shuffle(tp.deck); draw(t, 1); log(`${tp.name} 將 ${c.length} 張手牌放回牌庫洗勻，再抽 1 張`, i); break; }
    case 'tax': { const t = target.owner; log(`${P(t).name} 的效果需追加 ${costText(fullCost(op.cost))}`, i); const ok = await payExtra(t, fullCost(op.cost)); if (!ok) target.negated = true; break; }
    case 'noInstant': them.flags.noInstant = true; log(`${them.name} 本回合無法使用立即效果`, i); break;
  }
}

// ---- 回合流程 ----
async function summonPhase() {
  G.phase = 'summon'; G.pl.forEach(p => (p.hiddenPick = false));
  const decide = async i => {
    G.step = null;
    let ch;
    if (P(i).ai) { ch = aiSummon(i); } else ch = await IO.ask('summon', { who: i });
    P(i).hiddenPick = ch; IO.render(); return ch;
  };
  const choices = await Promise.all([decide(0), decide(1)]);
  G.phase = 'reveal';
  for (let i = 0; i < 2; i++) await doSummon(i, choices[i]);
  IO.render(); await IO.sleep(350);
}
async function doSummon(i, ch) {
  const p = P(i);
  if (ch.forced) return forcedSummon(i);
  removeFrom(p.hand, ch.unit); ch.pay.forEach(c => { removeFrom(p.hand, c); p.discard.push(c); });
  ch.unit.usedFx = []; p.field = ch.unit;
  log(`${p.name} 翻開【${ch.unit.name}】（攻擊力 ${ch.unit.atk}），支付 ${ch.pay.map(c => c.name).join('、')}`, i);
}
async function forcedSummon(i) {
  const p = P(i);
  const card = p.deck.length ? p.deck.pop() : p.life.pop();
  if (!card) return;
  card.usedFx = []; p.field = card;
  let need = card.cost; const paid = [];
  while (need > 0 && p.deck.length) { const c = p.deck.pop(); p.discard.push(c); paid.push('牌庫頂'); need--; }
  if (need > 0 && p.hand.length) {
    const c = await pick(i, p.hand, need, `無法召喚規則：從手牌棄 ${Math.min(need, p.hand.length)} 張`, '牌庫不足，改從手牌支付不足的能量');
    c.forEach(x => { removeFrom(p.hand, x); p.discard.push(x); paid.push('手牌'); need--; });
  }
  while (need > 0 && p.life.length) { p.discard.push(p.life.pop()); paid.push('生命牌'); need--; }
  log(`${p.name} 執行【無法召喚規則】：翻開牌庫頂【${card.name}】強制出戰（攻擊力 ${card.atk}），支付 ${paid.join('、') || '無'}`, i);
}
async function actionWindow(i) {
  G.step = { type: 'action', who: i };
  IO.render();
  while (!G.over) {
    if (!P(i).ai && !actionCandidates(i).length) { log(`${P(i).name} 沒有可發動的效果`, i); IO.render(); await IO.sleep(400); break; }
    const d = P(i).ai ? await aiAction(i) : await IO.ask('action', { who: i });
    if (!d) break;
    const E = await activate(i, d.where, d.card, d.idx);
    await runEffect(E);
    G.step = { type: 'action', who: i };
  }
  if (!G.over) log(`${P(i).name} 結束行動`, i);
  G.step = null;
}
function powers() { return G.pl.map(p => (p.field ? Math.max(0, p.field.atk + p.flags.mod) : 0)); }
function projected(pw = powers()) {
  const d = [0, 0];
  if (pw[0] === pw[1]) { d[0] = 1; d[1] = 1; } else if (pw[0] < pw[1]) d[0] = pw[1] - pw[0]; else d[1] = pw[0] - pw[1];
  return d.map((x, k) => Math.max(0, x - P(k).flags.reduce));
}
async function settle() {
  G.phase = 'settle';
  const pw = powers(), d = projected(pw);
  G.result = { pw, d };
  log(`戰鬥結算：${P(0).name} ${pw[0]} 對 ${P(1).name} ${pw[1]}${pw[0] === pw[1] ? '，平手' : ''}`, 'sys');
  d.forEach((n, k) => n && damage(k, n, true));
  if (!d[0] && !d[1]) log('雙方都沒有受到傷害', 'sys');
  checkOver(); IO.render();
}
async function endPhase() {
  G.phase = 'end';
  for (let i = 0; i < 2; i++) {
    const p = P(i);
    if (p.hand.length > 7) {
      const n = p.hand.length - 7;
      const c = await pick(i, p.hand, n, `手牌超過 7 張：棄掉 ${n} 張`, '回合結束時手牌上限為 7 張');
      c.forEach(x => { removeFrom(p.hand, x); p.discard.push(x); });
      log(`${p.name} 手牌超過上限，棄掉 ${n} 張`, i);
    }
    if (p.field) p.discard.push(p.field);
    p.consume.forEach(e => e.card && p.discard.push(e.card));
    p.field = null; p.consume = []; p.flags = freshFlags();
    p.hand.forEach(c => (c.wild = false));
  }
  G.result = null;
  log('回合結束：戰場和消耗區的牌進入棄牌堆', 'sys');
}
async function gameLoop() {
  while (!G.over) {
    G.turnStarts.push(Date.now());
    log(`── 第 ${G.turn} 回合，先攻：${P(G.first).name} ──`, 'turn');
    if (G.turn > 1) { G.phase = 'draw'; draw(0, 2); draw(1, 2); log('雙方各抽 2 張', 'sys'); IO.render(); if (checkOver()) break; await IO.sleep(150); }
    await summonPhase(); if (checkOver()) break;
    G.phase = 'battle';
    if (RULES.freeEnergy) { G.pl.forEach(p => { for (let k = 0; k < RULES.freeEnergy; k++) p.consume.push({ card: null, color: 'X', wild: true, spent: false, token: true }); }); log(`雙方各獲得 ${RULES.freeEnergy} 點任意色能量`, 'sys'); }
    await actionWindow(G.first); if (G.over) break;
    await actionWindow(opp(G.first)); if (G.over) break;
    await settle(); if (G.over) break;
    if (G.pl.some(p => !p.ai)) await IO.ask('next', {}); else await IO.sleep(0);
    await endPhase();
    G.first = opp(G.first); G.turn++;
    if (G.turn > 60) { G.over = { draw: true }; log('超過 60 回合，判定平手', 'sys'); }
  }
  G.phase = 'over';
  const total = Date.now() - G.startedAt, turns = G.turnStarts.length;
  const lens = G.turnStarts.map((t, k) => (G.turnStarts[k + 1] || Date.now()) - t);
  G.duration = total;
  log(`對局時間 ${durText(total)}，共 ${turns} 回合，平均每回合 ${durText(total / Math.max(1, turns))}（最長第 ${lens.indexOf(Math.max(...lens)) + 1} 回合 ${durText(Math.max(...lens))}）`, 'sys');
  IO.render();
}

// ===== 電腦 AI =====
function aiPlan(i, cost, exclude) {
  const p = P(i);
  const src = [...unspent(p).map(e => ({ e, color: e.color, wild: e.wild })),
    ...p.hand.filter(c => c !== exclude).sort((a, b) => val(a) - val(b)).map(c => ({ c, color: c.color, wild: c.wild }))];
  const use = planFrom(src, cost);
  if (!use) return null;
  return { cards: use.filter(u => u.c).map(u => u.c) };
}
function aiSummon(i) {
  const p = P(i);
  const cands = p.hand.filter(c => canSummon(p, c));
  if (!cands.length) return { forced: true };
  cands.sort((a, b) => (b.atk * 1.2 - b.cost * 0.5) - (a.atk * 1.2 - a.cost * 0.5));
  const unit = cands[0];
  const opts = summonPayOptions(p, unit).sort((a, b) => val(a) - val(b));
  let pay = opts.slice(0, unit.cost);
  if (!pay.some(c => sameColor(c, unit))) pay = [opts.find(c => sameColor(c, unit)), ...opts.filter(c => !sameColor(c, unit)).slice(0, unit.cost - 1)];
  return { unit, pay };
}
function dmgWith(i, modMe, modOpp, redMe) {
  const me = P(i), o = P(opp(i));
  const pm = me.field ? Math.max(0, me.field.atk + me.flags.mod + modMe) : 0;
  const po = o.field ? Math.max(0, o.field.atk + o.flags.mod + modOpp) : 0;
  let dm = 0, dop = 0;
  if (pm === po) { dm = 1; dop = 1; } else if (pm < po) dm = po - pm; else dop = pm - po;
  return { me: Math.max(0, dm - me.flags.reduce - redMe), opp: Math.max(0, dop - o.flags.reduce) };
}
function aiOpValue(i, op) {
  const me = P(i), o = P(opp(i)), base = dmgWith(i, 0, 0, 0);
  switch (op.op) {
    case 'buff': { const a = dmgWith(i, modN(op), 0, 0); return (a.opp - base.opp) + (base.me - a.me) + 0.3 * modN(op); }
    case 'debuff': { const a = dmgWith(i, 0, -modN(op), 0); return (a.opp - base.opp) + (base.me - a.me) + 0.3 * modN(op); }
    case 'reduce': return Math.min(modN(op), base.me) + 0.15;
    case 'draw': return 0.8 * op.n;
    case 'drawDiscard': return 0.7;
    case 'drawReturn': return 0.5;
    case 'heal': return 1.1 * Math.min(op.n, me.hpMax - me.life.length, me.discard.length);
    case 'burn': return 1.2 * Math.min(op.n, o.life.length);
    case 'burnDiscard': return 1.6 * Math.min(op.n, o.life.length);
    case 'salvage': return me.discard.length ? 0.7 : 0;
    case 'randDiscard': return 0.8 * Math.min(op.n, o.hand.length);
    case 'oppMulligan': return 0.3;
    case 'seal': return o.field && o.field.fxP.some((f, k) => f.type === 'magic' && !o.field.usedFx.includes(k)) && !o.flags.magic ? 0.9 : 0.05;
    case 'wild': return 0.05;
    case 'copy': { const opts = copyOptions(); return opts.length ? Math.max(...opts.map(x => aiFxValue(i, x.fx))) : 0; }
    default: return 0;
  }
}
function aiFxValue(i, fx) { return fx.ops.reduce((s, op) => s + aiOpValue(i, op), 0); }
async function aiAction(i) {
  await IO.sleep(350);
  const p = P(i), win = { type: 'action', who: i };
  const w = p.hand.length >= 7 ? 0.3 : 0.6;
  let best = null;
  const consider = (where, card) => card.fxP.forEach((fx, idx) => {
    if (!fx.supported || fx.type === 'inter') return;
    if (where === 'field' && (card.usedFx.includes(idx) || (fx.type === 'magic' && p.flags.sealed))) return;
    if (fx.type === 'magic' && p.flags.magic) return;
    if (fx.type === 'instant' && (p.flags.instant || p.flags.noInstant)) return;
    if (fx.ops.some(o => o.op === 'copy') && !copyOptions().length) return;
    const plan = aiPlan(i, effCost(fx, where), where === 'hand' ? card : null);
    if (!plan) return;
    const net = aiFxValue(i, fx) - (plan.cards.length + (where === 'hand' ? 1 : 0)) * w;
    if (net > 0.2 && (!best || net > best.net)) best = { where, card, idx, plan, net };
  });
  p.hand.forEach(c => consider('hand', c));
  if (p.field) consider('field', p.field);
  if (!best) return null;
  best.plan.cards.forEach(c => toEnergy(i, c));
  if (whyNot(i, best.where, best.card, best.idx, win)) return null;
  return best;
}
async function aiResponse(o, E) {
  await IO.sleep(250);
  const p = P(o), harm = aiFxValue(E.owner, E.fx), t = P(E.owner);
  const w = p.hand.length >= 7 ? 0.3 : 0.6;
  let best = null;
  for (const c of responseCandidates(o, E)) {
    const plan = aiPlan(o, effCost(c.fx, c.where), c.where === 'hand' ? c.card : null);
    if (!plan) continue;
    let v = 0;
    for (const op of c.fx.ops) {
      if (op.op === 'negate') v += harm;
      else if (op.op === 'tax') v += planFrom(unspent(t), fullCost(op.cost)) ? 0.1 : (t.hand.length ? harm * 0.4 : harm);
      else if (op.op === 'oppDiscard') v += 0.6;
      else if (op.op === 'discardHandTop') v += 1.0;
      else if (op.op === 'return2draw1') v += 0.6;
      else if (op.op === 'noInstant') v += 0.2;
    }
    const net = v - (plan.cards.length + (c.where === 'hand' ? 1 : 0)) * w;
    if (net > 0.25 && (!best || net > best.net)) best = { ...c, plan, net };
  }
  if (!best) return null;
  best.plan.cards.forEach(c => toEnergy(o, c));
  if (whyNot(o, best.where, best.card, best.idx, { type: 'response', who: o, target: E })) return null;
  return best;
}

// ===== 牌組 =====
// 每套牌固定 3 張費用 3。
// 單色牌組：該色費用 1、2 全放（8+6），加 3 張該色費用 3，共 17 張；不足的 3 張從其他顏色的費用 1 隨機補。
// 隨機牌組：三色隨意，費用 1／2／3 = 9／8／3。
const MAX_COST3 = 3;
function buildDeck(colors) {
  const all = Object.values(DEFS);
  if (colors.length === 1) {
    const col = colors[0];
    const mine = all.filter(c => c.color === col);
    const out = [...mine.filter(c => c.cost < 3), ...shuffle(mine.filter(c => c.cost === 3)).slice(0, MAX_COST3)];
    const extra = shuffle(all.filter(c => c.color !== col && c.cost === 1));
    while (out.length < 20 && extra.length) out.push(extra.pop());
    return out.map(c => c.id);
  }
  const out = [];
  for (const [cost, n] of [[1, 9], [2, 8], [3, MAX_COST3]]) out.push(...shuffle(all.filter(c => colors.includes(c.color) && c.cost === cost)).slice(0, n));
  return out.map(c => c.id);
}
if (typeof module !== 'undefined') module.exports = { IO, RULES, loadData, effCost, newGame, gameLoop, buildDeck, get G() { return G; }, get LEADERS() { return LEADERS; }, DEFS: () => DEFS, parseFx };
