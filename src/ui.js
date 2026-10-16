// ===== 畫面 =====
loadData(DATA);
const $ = id => document.getElementById(id);
const RACE_GLYPH = { 人: '人', 妖: '妖', 幻: '幻' };
let pend = null, modal = null, sel = null, showOppHand = false, setup = null, gameId = 0;
const PRESETS = [
  { key: 'R', name: '紅色牌組', sub: '進攻・攻擊力修正', colors: ['R'] },
  { key: 'G', name: '綠色牌組', sub: '防守・回復・棄牌', colors: ['G'] },
  { key: 'B', name: '藍色牌組', sub: '抽牌・反制', colors: ['B'] },
  { key: 'RGB', name: '隨機牌組', sub: '三色隨意配置', colors: ['R', 'G', 'B'] },
];
function loadCustom() { try { const d = JSON.parse(localStorage.getItem('deck-v102') || 'null'); return Array.isArray(d) && d.length === 20 && d.every(id => DEFS[id]) && d.filter(id => DEFS[id].cost === 3).length <= MAX_COST3 ? d : null; } catch (e) { return null; } }
function saveCustom(ids) { try { localStorage.setItem('deck-v102', JSON.stringify(ids)); } catch (e) {} }

IO.sleep = ms => { const id = gameId; return new Promise(r => setTimeout(() => { if (id === gameId) r(); }, ms)); };
IO.render = () => render();
IO.onLog = () => {};
// 生命牌進棄牌堆時，畫面上方跳出小視窗顯示是哪幾張，停留 5 秒（點一下可提早關閉）
let toasts = [], toastSeq = 0;
IO.reveal = ({ who, title, cards }) => {
  const id = ++toastSeq;
  toasts.push({ id, who, title, cards: cards.slice() });
  renderToasts();
  setTimeout(() => { toasts = toasts.filter(t => t.id !== id); renderToasts(); }, 5000);
};
function renderToasts() {
  const box = document.getElementById('toasts'); if (!box) return;
  box.innerHTML = toasts.map(t => `<div class="toast ${t.who === 0 ? 'mine' : ''}" data-act="toastclose" data-id="${t.id}" role="status">
    <div class="toast-t">${esc(t.title)}</div><div class="toast-cards">${t.cards.map(c => cardHTML(c, { size: 's' })).join('')}</div><div class="toast-bar"></div></div>`).join('');
}
IO.ask = (kind, ctx) => new Promise(res => { const id = gameId; pend = { kind, ctx, res, id }; if (kind === 'summon') sel = null; render();
  if (kind === 'next') setTimeout(() => { if (pend && pend.kind === 'next' && pend.id === id && !modal) answer(true); }, 2200); });
IO.choose = opts => new Promise(res => { modal = { type: 'choose', ...opts, picked: opts.pre ? opts.pre.slice() : [], res }; render(); });
function answer(v) { const p = pend; pend = null; sel = null; p.res(v); render(); }

// ---- 小元件 ----
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function costHTML(c) {
  const parts = ['R', 'G', 'B', 'X'].filter(k => c[k]);
  if (!parts.length) return '免費';
  return parts.map(k => `<span class="pip"><i class="dot ${k}"></i>${CN[k]}${c[k]}</span>`).join(' + ');
}
function cardHTML(c, o = {}) {
  if (!c) return '';
  const cls = ['card', 'c' + c.color, o.size || '', o.click ? 'click' : '', o.sel ? 'sel' : '', o.dim ? 'dim' : ''].join(' ');
  const atkCls = o.mod > 0 ? 'up' : o.mod < 0 ? 'down' : '';
  const atk = o.mod !== undefined ? Math.max(0, c.atk + o.mod) : c.atk;
  return `<div class="${cls}" ${o.attrs || ''} title="${esc(c.id + ' ' + c.name)}">
    ${o.flag ? `<span class="flag">${o.flag}</span>` : ''}
    <div class="c-top"><span class="c-cost">${c.cost}</span><span class="c-name">${esc(c.name)}</span></div>
    <div class="c-art"><span>${RACE_GLYPH[c.race] || ''}</span>${c.wild ? '<em class="c-wild">任意色</em>' : ''}</div>
    <div class="c-fx">${c.fxP.map((f, k) => `<div class="fxl" ${c.usedFx && c.usedFx.includes(k) ? 'style="opacity:.45"' : ''}><b class="tag ${f.type}">${TN[f.type]}</b><span>${costText(f.cost)}：${esc(f.body)}</span></div>`).join('')}</div>
    <div class="c-bot"><span class="c-atk ${atkCls}">${atk}</span><span class="c-id">${c.id}</span><span class="c-race">${c.race}</span></div>
  </div>`;
}
const backHTML = (size, attrs = '') => `<div class="card back ${size || ''}" style="background-image:url(${BACK})" ${attrs}></div>`;
function tapHTML(e, undo) {
  if (e.token) return `<div class="tap cW ${e.spent ? 'spent' : ''}" title="回合能量"><b>回合能量</b><span>任意色・本回合</span></div>`;
  return `<div class="tap ${e.wild ? 'cW' : 'c' + e.color} ${e.spent ? 'spent' : ''}" title="${esc(e.card.name)}"><b>${esc(e.card.name)}</b><span>${e.wild ? '任意色' : CN[e.color] + '色'}能量</span>${undo && !e.spent ? `<button class="undo" data-act="unenergy" data-uid="${e.card.uid}" title="返回手牌">↩ 返回</button>` : ''}</div>`; }
function poolText(p) {
  const u = unspent(p); if (!p.consume.length) return '';
  const cnt = { R: 0, G: 0, B: 0, W: 0 }; u.forEach(e => cnt[e.wild ? 'W' : e.color]++);
  const s = Object.entries(cnt).filter(([, n]) => n).map(([k, n]) => `<span class="pip"><i class="dot ${k}"></i>${n}</span>`).join(' ');
  return u.length ? `可用 ${s}` : '能量已用完';
}

// ---- 主繪製 ----
function render() {
  if (!G) { renderModal(); return; }
  if (view !== 'battle') { renderModal(); return; }
  const me = P(0), op = P(1);
  const phaseName = { setup: '準備', draw: '抽牌', summon: '召喚', reveal: '翻開', battle: '戰鬥', settle: '結算', end: '回合結束', over: '對局結束' }[G.phase] || '';
  $('turnline').innerHTML = `第<b>${G.turn}</b>回合 · ${phaseName} · 先攻 <b style="font-family:var(--f-body);font-size:13px">${P(G.first).name}</b>`;
  // 敵方手牌
  $('oppHandN').textContent = op.hand.length + ' 張';
  $('oppHand').innerHTML = op.hand.map(c => showOppHand ? cardHTML(c, { size: 's' }) : backHTML('xs')).join('') || '<span class="empty">沒有手牌</span>';
  // 戰場
  const fieldView = (i) => {
    const p = P(i);
    if (G.phase === 'summon') {
      if (p.hiddenPick) {
        if (i === 0 && !p.hiddenPick.forced) return `<div style="position:relative">${cardHTML(p.hiddenPick.unit, { size: 'l', dim: true, flag: '已蓋牌' })}</div>`;
        return `<div style="position:relative">${backHTML('l')}<span class="flag">${i === 0 ? '將執行無法召喚規則' : '已蓋牌'}</span></div>`;
      }
      return `<span class="empty">${i === 0 ? '選擇出戰角色' : '對手選擇中…'}</span>`;
    }
    if (!p.field) return '<span class="empty">—</span>';
    const mod = p.flags.mod;
    const isSel = sel && sel.uid === p.field.uid;
    return `<div style="position:relative">${cardHTML(p.field, { size: 'l', mod, click: true, sel: isSel, attrs: `data-act="sel" data-where="${i === 0 ? 'field' : 'oppfield'}" data-uid="${p.field.uid}" tabindex="0"` })}${mod ? `<span class="modbadge">${mod > 0 ? '+' : ''}${mod}</span>` : ''}</div>`;
  };
  $('oppField').innerHTML = fieldView(1);
  $('meField').innerHTML = fieldView(0);
  $('oppConsume').innerHTML = op.consume.map(e => tapHTML(e, false)).join('') || '<span class="empty">—</span>';
  const canUndo = !!pend && (pend.kind === 'action' || pend.kind === 'response');
  $('meConsume').innerHTML = me.consume.map(e => tapHTML(e, canUndo)).join('') || '<span class="empty">把手牌轉為能量後會橫置在這裡；還沒支付的能量可以按「返回」拿回手牌</span>';
  $('oppPool').innerHTML = poolText(op);
  $('mePool').innerHTML = poolText(me);
  // 我方手牌
  $('meHandN').textContent = me.hand.length + ' 張' + (me.hand.length > 7 ? '（回合結束須棄到 7 張）' : '');
  const pickedUid = me.hiddenPick && !me.hiddenPick.forced && G.phase === 'summon' ? me.hiddenPick.unit.uid : null;
  const payUids = pickedUid ? me.hiddenPick.pay.map(c => c.uid) : [];
  $('meHand').innerHTML = me.hand.map(c => cardHTML(c, { click: true, sel: sel && sel.uid === c.uid, dim: c.uid === pickedUid || payUids.includes(c.uid), attrs: `data-act="sel" data-where="hand" data-uid="${c.uid}" tabindex="0"` })).join('') || '<span class="empty">沒有手牌</span>';
  renderAxis(); renderInspector(); renderInfo(); renderLog(); renderModal();
}

function renderAxis() {
  const steps = [['draw', '抽牌'], ['summon', '召喚'], ['reveal', '翻開'], ['a1', '先攻行動'], ['a2', '後攻行動'], ['settle', '結算']];
  let cur = G.phase;
  if (G.phase === 'battle') cur = G.step && G.step.who === G.first ? 'a1' : G.step && G.step.type === 'response' && G.step.target.owner === G.first ? 'a1' : 'a2';
  if (G.phase === 'end') cur = 'settle';
  const idx = steps.findIndex(s => s[0] === cur);
  const stepHTML = steps.map((s, k) => `<span class="step ${k === idx ? 'on' : k < idx ? 'done' : ''}">${s[1]}</span>`).join('');
  const showPw = G.pl.every(p => p.field) && ['battle', 'settle', 'end', 'over', 'reveal'].includes(G.phase);
  const pw = showPw ? (G.result ? G.result.pw : powers()) : null;
  const d = showPw ? (G.result ? G.result.d : projected()) : null;
  const pwBox = (i, label) => {
    if (!pw) return `<div class="pw"><div class="n" style="color:var(--rule2)">–</div><div class="who">${label}</div></div>`;
    const cls = pw[i] > pw[1 - i] ? 'win' : pw[i] < pw[1 - i] ? 'lose' : '';
    const mod = P(i).flags.mod, red = P(i).flags.reduce;
    return `<div class="pw ${cls}"><div class="n">${pw[i]}</div><div class="who">${label}</div><div class="mod">${mod ? `攻擊力${mod > 0 ? '+' : ''}${mod}` : '&nbsp;'}${red ? ` · 減傷${red}` : ''}</div></div>`;
  };
  const dmgLine = d ? `<div style="font-family:var(--f-body);font-size:11.5px;color:var(--mute);text-align:center">${G.result ? '本回合' : '預估'}：你受 ${d[0]}・對手受 ${d[1]}</div>` : '';
  $('axis').innerHTML = `
    <div><div class="steps">${stepHTML}</div><div class="firstline">本回合先攻：<b>${P(G.first).name}</b>　後攻：${P(opp(G.first)).name}</div></div>
    <div><div class="duel">${pwBox(0, '你')}<span class="vs">VS</span>${pwBox(1, '對手')}</div>${dmgLine}</div>
    <div class="prompt">${promptHTML()}</div>`;
}
function promptHTML() {
  if (G.over) {
    const t = G.over.draw ? '平手' : G.over.winner === 0 ? '你獲勝了' : '對手獲勝';
    return `<div class="tt">${t}</div><div>${G.over.draw ? '雙方生命牌同時歸 0。' : G.over.winner === 0 ? '敵方生命牌歸 0。' : '我方生命牌歸 0。'}</div><div class="acts"><button class="btn primary" data-act="newgame">再來一局</button></div>`;
  }
  if (!pend) {
    if (G.step && G.step.who === 1) return `<div class="tt">對手${G.step.type === 'response' ? '考慮是否干擾' : '行動中'}…</div>`;
    if (G.phase === 'summon') return `<div class="tt">等待對手蓋牌…</div>`;
    return `<div class="tt">${{ reveal: '同時翻開', draw: '抽牌', settle: '結算中', end: '回合結束' }[G.phase] || '處理中'}</div>`;
  }
  const me = P(0);
  if (pend.kind === 'summon') {
    if (!anySummon(me)) return `<div class="tt">召喚階段</div><div>手牌中沒有付得起費用的角色。</div><div class="acts"><button class="btn primary" data-act="forced">執行【無法召喚規則】</button></div>`;
    return `<div class="tt">召喚階段</div><div>點一張手牌，在右方操作面板選「蓋牌出戰」。召喚費用要用與角色同色的手牌支付，付完進入棄牌堆。</div>`;
  }
  if (pend.kind === 'action') {
    const f = me.flags;
    return `<div class="tt">你的行動（${G.first === 0 ? '先攻' : '後攻'}）</div>
      <div>魔法 ${f.magic ? '已用' : '可用 1 次'}・立即 ${f.instant ? '已用' : f.noInstant ? '被禁止' : '可用 1 次'}。先把手牌轉為能量，再按效果的「發動」。</div>
      <div class="acts"><button class="btn primary" data-act="end">結束行動</button></div>`;
  }
  if (pend.kind === 'response') {
    const E = pend.ctx.target;
    return `<div class="tt">對手發動了效果</div>
      <div class="target-fx"><b class="tag ${E.fx.type}">${TN[E.fx.type]}</b> 【${esc(E.card.name)}】${esc(E.fx.body)}</div>
      <div style="margin-top:4px">你可以發動 1 次干擾效果回應（干擾後對手不能再回應），也可以使用立即效果。</div>
      <div class="acts"><button class="btn primary" data-act="end">不干擾</button></div>`;
  }
  if (pend.kind === 'next') {
    const r = G.result;
    const txt = r.pw[0] === r.pw[1] ? '戰鬥力相同，平手' : r.pw[0] > r.pw[1] ? `你贏了這場戰鬥，差值 ${r.pw[0] - r.pw[1]}` : `你輸了這場戰鬥，差值 ${r.pw[1] - r.pw[0]}`;
    return `<div class="tt">戰鬥結算</div><div>${txt}。你受到 ${r.d[0]} 點、對手受到 ${r.d[1]} 點傷害，扣除的生命牌加入手牌。</div><div class="acts"><button class="btn primary" data-act="next">回合結束</button><span class="hint" style="align-self:center">2 秒後自動進入下一回合</span></div>`;
  }
  return '';
}

function findCard(uid) {
  uid = +uid;
  const me = P(0), op = P(1);
  let c = me.hand.find(x => x.uid === uid); if (c) return { card: c, where: 'hand' };
  if (me.field && me.field.uid === uid) return { card: me.field, where: 'field' };
  if (op.field && op.field.uid === uid) return { card: op.field, where: 'oppfield' };
  return null;
}
function renderInspector() {
  const box = $('inspector');
  const f = sel && findCard(sel.uid);
  if (!f) {
    box.innerHTML = `<h3>操作面板</h3><div class="hint">點選手牌或戰場上的角色，這裡會顯示卡牌詳情和可以進行的操作：蓋牌出戰、轉為能量、發動效果。</div>
      <div class="hint">按鈕會標示「可發動」，或說明還缺什麼，例如「需要 藍色能量1」。</div>`;
    return;
  }
  const { card, where } = f, me = P(0);
  const whereTxt = { hand: '我方手牌', field: '我方戰場', oppfield: '敵方戰場' }[where];
  let acts = '';
  const canWin = pend && (pend.kind === 'action' || pend.kind === 'response');
  if (where === 'hand' && pend && pend.kind === 'summon') {
    const ok = canSummon(me, card);
    acts += `<div class="act"><div class="go"><span class="state ${ok ? 'ok' : 'no'}">${ok ? `支付 ${card.cost} 張${CN[card.color]}色手牌` : `同色手牌不足：需要 ${card.cost} 張${CN[card.color]}色`}</span><button data-act="summon" data-uid="${card.uid}" ${ok ? '' : 'disabled'}>蓋牌出戰</button></div></div>`;
  }
  if (where === 'hand') {
    acts += `<div class="act"><div class="go"><span class="state ${canWin ? 'ok' : ''}">${canWin ? `轉為${card.wild ? '任意' : CN[card.color]}色能量，橫置到消耗區` : '戰鬥階段輪到你時才能轉為能量'}</span><button data-act="energy" data-uid="${card.uid}" ${canWin ? '' : 'disabled'}>轉為能量</button></div></div>`;
  }
  card.fxP.forEach((fx, idx) => {
    let why = where === 'oppfield' ? '對手的卡' : whyNot(0, where, card, idx, G.step);
    if (where === 'field' && card.usedFx.includes(idx)) why = '本回合已發動過此效果';
    const ok = !why;
    acts += `<div class="act"><div class="line"><b class="tag ${fx.type}">${TN[fx.type]}</b><span>${costHTML(where === 'oppfield' ? fx.cost : effCost(fx, where))}：${esc(fx.body)}${fx.type === 'instant' ? `<span class="hint">（${fx.interferable ? '可被干擾' : '不可被干擾'}）</span>` : ''}</span></div>
      <div class="go"><span class="state ${ok ? 'ok' : 'no'}">${ok ? '可發動' : '無法發動：' + why}</span>${where === 'oppfield' ? '' : `<button data-act="fx" data-uid="${card.uid}" data-where="${where}" data-idx="${idx}" ${ok ? '' : 'disabled'}>發動</button>`}</div></div>`;
  });
  box.innerHTML = `<div class="insp-top">${cardHTML(card, { size: 's' })}<div class="insp-meta"><h3>${esc(card.name)}</h3><span>${whereTxt}</span><span>編號 <b>${card.id}</b>・${card.race}</span><span>召喚 <b>${CN[card.color]} ${card.cost}</b>・攻擊力 <b>${card.atk}</b></span>${where === 'hand' ? '<span>從手牌發動效果只能擇一，用完進棄牌堆</span>' : ''}${where === 'field' ? '<span>戰場角色的效果都可發動，能量從手牌支付</span>' : ''}</div></div>${acts}`;
}
function infoHTML(i) {
  const p = P(i), f = p.flags;
  const life = Array.from({ length: p.hpMax }, (_, k) => `<i class="${k < p.life.length ? 'on' : ''}"></i>`).join('');
  const chips = [];
  chips.push(`<span class="chip ${f.magic ? 'used' : ''}">魔法 ${f.magic ? '已用' : '未用'}</span>`);
  chips.push(`<span class="chip ${f.instant ? 'used' : ''}">立即 ${f.instant ? '已用' : '未用'}</span>`);
  if (f.noInstant) chips.push('<span class="chip warn">禁止立即</span>');
  if (f.sealed) chips.push('<span class="chip warn">戰場魔法封印</span>');
  if (f.mod) chips.push(`<span class="chip ${f.mod > 0 ? 'good' : 'warn'}">攻擊力${f.mod > 0 ? '+' : ''}${f.mod}</span>`);
  if (f.reduce) chips.push(`<span class="chip good">受傷-${f.reduce}</span>`);
  return `<h4>${i === 0 ? '我方' : '敵方'}・${esc(p.name)}<small>主角 ${esc(p.leader.name)}（${p.leader.race}）</small></h4>
    <div class="stats">
      <div class="stat life"><div class="n">${p.life.length}</div><div class="k">生命牌</div></div>
      <div class="stat"><div class="n">${p.deck.length}</div><div class="k">牌庫</div></div>
      <div class="stat"><button data-act="viewdiscard" data-p="${i}" title="查看棄牌堆"><div class="n">${p.discard.length}</div><div class="k">棄牌堆 ▸</div></button></div>
      <div class="stat"><div class="n">${p.hand.length}</div><div class="k">手牌</div></div>
    </div>
    <div class="lifebar">${life}</div>
    <div class="statusline">${chips.join('')}</div>`;
}
function renderInfo() { $('infoOpp').innerHTML = infoHTML(1); $('infoMe').innerHTML = infoHTML(0); }
let lastLogLen = -1;
function renderLog() {
  if (G.log.length === lastLogLen) return; lastLogLen = G.log.length;
  const el = $('log');
  el.innerHTML = G.log.map(l => `<div class="w${l.who}"><span class="t">T${l.t}<br>${clock(l.ms)}</span><span>${esc(l.text)}</span></div>`).join('');
  el.scrollTop = el.scrollHeight;
}

// ---- 對話框 ----
function renderModal() {
  const m = $('modal');
  if (!modal) { m.innerHTML = ''; return; }
  if (modal.type === 'choose') {
    const ok = modal.picked.length >= modal.min && modal.picked.length <= modal.max && (!modal.validate || modal.validate(modal.picked.map(k => modal.items[k])));
    m.innerHTML = `<div class="veil"><div class="dlg" role="dialog" aria-modal="true">
      <h2>${esc(modal.title)}</h2><p class="d">${esc(modal.desc || '')}</p>
      <div class="pickgrid">${modal.items.map((it, k) => `<button class="pickitem ${modal.picked.includes(k) ? 'on' : ''}" data-act="pick" data-k="${k}" style="background:none;border:0;padding:0">${cardHTML(it.card, { size: 's' })}${it.label ? `<span class="lbl">${esc(it.label)}</span>` : ''}</button>`).join('')}</div>
      <div class="row"><span class="sp">已選 ${modal.picked.length}／${modal.min === modal.max ? modal.min : `${modal.min}～${modal.max}`}</span>
      ${modal.cancelText ? `<button class="btn" data-act="pickcancel">${esc(modal.cancelText)}</button>` : ''}
      <button class="btn primary" data-act="pickok" ${ok ? '' : 'disabled'}>確定</button></div></div></div>`;
  } else if (modal.type === 'view') {
    m.innerHTML = `<div class="veil" data-act="close"><div class="dlg" role="dialog" ${modal.size ? 'style="max-width:420px"' : ''}><h2>${esc(modal.title)}</h2><p class="d">${modal.note ? esc(modal.note) : modal.cards.length ? '由舊到新排列，最右邊是棄牌堆頂。' : '目前是空的。'}</p>
      <div class="pickgrid" ${modal.size ? 'style="justify-content:center"' : ''}>${modal.cards.map(c => cardHTML(c, { size: modal.size || 's' })).join('')}</div><div class="row"><button class="btn primary" data-act="close">關閉</button></div></div></div>`;
  } else if (modal.type === 'setup') m.innerHTML = setupHTML();
  else if (modal.type === 'builder') m.innerHTML = builderHTML();
  else if (modal.type === 'rules') m.innerHTML = `<div class="veil" data-act="close"><div class="dlg" role="dialog" style="max-width:1000px">${rulesHTML()}<div class="row"><button class="btn primary" data-act="close">關閉</button></div></div></div>`;
}

// ---- 開局設定 ----
function setupHTML() {
  const s = modal, custom = loadCustom();
  const deckOpts = PRESETS.map(p => `<button class="opt ${s.deck === p.key ? 'on' : ''}" data-act="setdeck" data-k="${p.key}"><b>${p.name}</b><small>${p.sub}</small></button>`).join('')
    + `<button class="opt ${s.deck === 'custom' ? 'on' : ''}" data-act="setdeck" data-k="custom" ${custom ? '' : 'disabled style="opacity:.45"'}><b>我的牌組</b><small>${custom ? '20 張已儲存' : '先到「自組牌組」建立'}</small></button>`;
  const lead = LEADERS.map((l, k) => `<button class="opt ${s.leader === k ? 'on' : ''}" data-act="setleader" data-k="${k}"><b>${esc(l.name)}</b><small>${l.race}・生命 ${l.hp}・能力：暫無</small></button>`).join('');
  const randOpt = (act, on, sub) => `<button class="opt ${on ? 'on' : ''}" data-act="${act}" data-k="rand"><b>完全隨機</b><small>${sub}</small></button>`;
  const aiLead = randOpt('setaileader', s.aiLeader === 'rand', '每局隨機一位') + LEADERS.map((l, k) => `<button class="opt ${s.aiLeader === k ? 'on' : ''}" data-act="setaileader" data-k="${k}"><b>${esc(l.name)}</b><small>${l.race}・生命 ${l.hp}</small></button>`).join('');
  const aiDeck = randOpt('setaideck', s.aiDeck === 'rand', '從紅／綠／藍／隨機牌組中抽一種') + PRESETS.map(p => `<button class="opt ${s.aiDeck === p.key ? 'on' : ''}" data-act="setaideck" data-k="${p.key}"><b>${p.name}</b><small>${p.sub}</small></button>`).join('')
    + `<button class="opt ${s.aiDeck === 'custom' ? 'on' : ''}" data-act="setaideck" data-k="custom" ${custom ? '' : 'disabled style="opacity:.45"'}><b>我的牌組</b><small>${custom ? '電腦用你自組的牌組' : '先到「自組牌組」建立'}</small></button>`;
  const hands = ['剪刀', '石頭', '布'];
  return `<div class="veil"><div class="dlg" role="dialog" aria-modal="true">
    <h2>新對局：對戰電腦</h2><p class="d">選好主角和牌組後猜拳，贏的人第 1 回合先攻，之後每回合交換。</p>
    <div class="sec">你的主角</div><div class="opts">${lead}</div>
    <div class="sec">你的牌組（20 張，費用 3 的角色固定 3 張）</div><div class="opts">${deckOpts}</div>
    <div class="sec">電腦的主角</div><div class="opts">${aiLead}</div>
    <div class="sec">電腦的牌組</div><div class="opts">${aiDeck}</div>
    <div class="sec">猜拳決定先攻</div>
    <div class="rps">${hands.map((h, k) => `<button data-act="rps" data-k="${k}">${h}</button>`).join('')}</div>
    <div class="rpsres">${s.rps || ''}</div>
    <div class="row"><span class="sp">單色牌組 17 張同色，另外 3 張從其他顏色的費用 1 隨機補</span><button class="btn" data-act="setupcancel">取消</button><button class="btn primary" data-act="start" ${s.first === undefined ? 'disabled' : ''}>開始對戰</button></div>
  </div></div>`;
}
function startGame() {
  const s = modal;
  const myDeck = s.deck === 'custom' ? loadCustom() : buildDeck(PRESETS.find(p => p.key === s.deck).colors);
  lastSetup = { leader: s.leader, deck: s.deck, aiLeader: s.aiLeader, aiDeck: s.aiDeck };
  const aiLeader = s.aiLeader === 'rand' ? Math.floor(Math.random() * LEADERS.length) : s.aiLeader;
  let aiDeckName, aiDeckIds;
  if (s.aiDeck === 'custom' && loadCustom()) { aiDeckName = '我的牌組'; aiDeckIds = loadCustom(); }
  else { const pr = s.aiDeck === 'rand' || s.aiDeck === 'custom' ? PRESETS[Math.floor(Math.random() * PRESETS.length)] : PRESETS.find(p => p.key === s.aiDeck); aiDeckName = pr.name; aiDeckIds = buildDeck(pr.colors); }
  modal = null; sel = null; pend = null; lastLogLen = -1; gameId++;
  const myId = gameId;
  newGame({ names: ['你', '電腦'], leaders: [LEADERS[s.leader], LEADERS[aiLeader]], decks: [myDeck, aiDeckIds], ai: [false, true], first: s.first });
  log(`電腦使用「${aiDeckName}」（${s.aiDeck === 'rand' ? '完全隨機' : '指定'}）`, 'sys');
  render();
  gameLoop().catch(e => { if (myId === gameId) { log('程式錯誤：' + e.message, 'sys'); render(); console.error(e); } });
}

// ---- 自組牌組 ----
function builderHTML() {
  const picked = modal.picked;
  const byCol = ['R', 'G', 'B'].map(col => Object.values(DEFS).filter(c => c.color === col));
  const cnt = [1, 2, 3].map(k => picked.filter(id => DEFS[id].cost === k).length);
  return `<div class="veil"><div class="dlg" role="dialog" aria-modal="true" style="max-width:1100px">
    <h2>自組牌組</h2><p class="d">點選卡牌加入或移出，固定 20 張，同編號不能重複，費用 3 的角色最多 3 張。</p>
    ${byCol.map((list, k) => `<div class="sec">${CN[['R', 'G', 'B'][k]]}色</div><div class="builder">${list.map(c => `<button class="brow ${picked.includes(c.id) ? 'on' : ''}" data-act="btoggle" data-id="${c.id}">
      <span class="bcost" style="background:var(--${c.color})">${c.cost}</span><span><span class="bname">${esc(c.name)}</span> <span class="hint">${c.id}・${c.race}・攻 ${c.atk}</span><br><span class="bfx">${c.fxP.map(f => `${TN[f.type]}/${costText(f.cost)}：${esc(f.body)}`).join('<br>')}</span></span></button>`).join('')}</div>`).join('')}
    <div class="row" style="position:sticky;bottom:-18px;background:var(--slab);padding:10px 0"><span class="sp">已選 <b style="color:var(--fg)">${picked.length}</b>／20・費用1：${cnt[0]}・費用2：${cnt[1]}・費用3：${cnt[2]}／${MAX_COST3}</span>
      <button class="btn" data-act="bclear">清空</button><button class="btn" data-act="bfill">隨機補滿</button><button class="btn" data-act="close">取消</button>
      <button class="btn primary" data-act="bsave" ${picked.length === 20 ? '' : 'disabled'}>儲存牌組</button></div>
  </div></div>`;
}
function rulesHTML() {
  const tag = t => `<b class="tag ${t}">${TN[t]}</b>`;
  return `<h2>規則說明 v${VERSION}</h2>
  <p class="r-lead">每回合雙方各派一個角色比攻擊力，輸的人扣生命牌。扣掉的生命牌會回到手上，變成下一回合反擊的資源。<b>生命牌歸 0 就輸</b>，雙方同時歸 0 是平手。</p>

  <h3>核心概念</h3>
  <div class="r-keys">
    <div class="r-key"><div class="r-k">每張牌三種用途</div><p><b>召喚</b>：派上戰場當這回合的角色。<br><b>能量</b>：1 張牌＝1 點該色能量，用來付費用。<br><b>效果</b>：發動卡上寫的效果。<br>從手牌打出時只能選一種用法；已召喚的角色還能發動自己的效果。</p></div>
    <div class="r-key"><div class="r-k">生命牌也是你的牌</div><p>開局從牌庫抽 6 張當生命牌。被打時扣生命牌，扣掉的牌<b>加入手牌</b>。所以落後的人手牌反而比較多，還有機會翻盤。</p></div>
    <div class="r-key"><div class="r-k">顏色就是能量</div><p>召喚費用要用<b>同色</b>手牌支付。效果費用照卡面寫的付，<b>灰色＝任意色</b>。</p></div>
  </div>

  <h3>準備</h3>
  <ol class="r-steps">
    <li>牌組 20 張，選 1 位主角（生命 6）。</li>
    <li>洗牌，抽 6 張當生命牌，再抽 5 張當手牌。</li>
    <li>猜拳，贏的人第 1 回合先攻，之後每回合交換。</li>
  </ol>

  <h3>每回合流程</h3>
  <ol class="r-steps">
    <li><b>抽牌</b>：雙方各抽 2 張（第 1 回合不抽）。牌庫抽完後改從生命牌抽。</li>
    <li><b>召喚</b>：雙方同時蓋 1 張角色，再同時翻開，用同色手牌付召喚費用。<b>每回合一定要召喚。</b></li>
    <li><b>戰鬥</b>：雙方各得 1 點回合能量（任意色，回合結束消失）。先攻方行動，後攻方可干擾；接著換後攻方行動，先攻方可干擾。</li>
    <li><b>結算</b>：攻擊力（含效果加減）低的一方，扣「差值」張生命牌；平手時雙方各扣 1 張。</li>
    <li><b>收尾</b>：場上的牌全部進棄牌堆，手牌超過 7 張要棄到 7 張。</li>
  </ol>

  <h3>效果的三種類型</h3>
  <table class="r-fx"><thead><tr><th>種類</th><th>什麼時候用</th><th>每回合</th></tr></thead><tbody>
    <tr><td>${tag('magic')}</td><td>自己的行動時</td><td>1 次</td></tr>
    <tr><td>${tag('instant')}</td><td>任何時間：自己的行動時，或對手發動效果時；和魔法分開計算次數</td><td>1 次</td></tr>
    <tr><td>${tag('inter')}</td><td>對手發動效果時，拿來回應</td><td>對手每個效果 1 次</td></tr>
  </tbody></table>
  <p class="r-note">發動方式：能量不夠時，先點手牌「轉為能量」放到消耗區，再按效果的「發動」。從手牌發動的卡，發動後進入棄牌堆。</p>

  <details class="r-more"><summary>補充規則（需要時再查）</summary>
  <div class="rules">
    <ul>
      <li><b>無法召喚</b>：手牌付不出任何角色的召喚費用時，翻開牌庫頂那張強制出戰（不看顏色），費用依序由牌庫頂、手牌、生命牌支付。</li>
      <li><b>從手牌發動效果</b>：只能選其中一個效果，發動後那張牌進棄牌堆；戰場上的角色，兩個效果都能用。</li>
      <li><b>干擾</b>：每個效果最多被干擾 1 次，干擾本身不能再被干擾，效果不能連鎖。追加費用的干擾，付不出來時被干擾的效果就無效。</li>
      <li><b>能量</b>：還沒支付的能量牌，輪到你操作時可以按「返回」拿回手牌；沒用到的能量牌，回合結束一樣進棄牌堆。</li>
      <li><b>牌組</b>：同編號不重複，費用 3 的角色最多 3 張。</li>
      <li><b>攻擊力</b>：最低為 0。</li>
    </ul>
  </div></details>

  <details class="r-more"><summary>卡牌裁定</summary>
  <div class="rules">
    <ul>
      <li>回復：棄牌堆最上面的牌移回生命牌堆，不超過主角生命上限。</li>
      <li>直接傷害：寫「移至棄牌堆」的（R15），生命牌進棄牌堆；沒寫的（R12），生命牌照常加入手牌。</li>
      <li>敵方單位傷害-N：本回合自己受到的戰鬥傷害減少 N。</li>
      <li>抽 2 放回 1：放回牌庫頂。B06：對手選 1 張放回牌庫底，再從牌庫頂抽 1 張。</li>
      <li>複製：場上費用 2 以下的魔法或立即效果，不另外付費。</li>
      <li>B18 禁止魔法：封印對手戰場角色的魔法效果，限本回合。</li>
      <li>立即效果：卡面寫「可被干擾」的才能被干擾。</li>
    </ul>
  </div></details>`;
}

// ---- 事件 ----
document.addEventListener('click', async ev => {
  const t = ev.target.closest('[data-act]'); if (!t) return;
  const a = t.dataset.act;
  if (a === 'toastclose') { toasts = toasts.filter(x => x.id !== +t.dataset.id); renderToasts(); return; }
  if (a === 'close') { if (t.classList.contains('veil') && ev.target !== t) return; modal = null; render(); return; }
  if (a === 'dbg') { showOppHand = t.checked; render(); return; }
  if (a === 'copylog') {
    const txt = G ? [`開局時間：${new Date(G.startedAt).toLocaleString('zh-TW', { hour12: false })}`, ...G.log.map(l => `[T${l.t} ${clock(l.ms)}] ${l.text}`)].join('\n') : '';
    try { await navigator.clipboard.writeText(txt); t.textContent = '已複製'; } catch (e) { const r = document.createRange(); r.selectNodeContents($('log')); const s = getSelection(); s.removeAllRanges(); s.addRange(r); t.textContent = '已選取，請按複製'; }
    setTimeout(() => (t.textContent = '複製紀錄'), 1600); return;
  }
  if (a === 'home') { resetBattle(); go('home'); return; }
  if (a === 'battle') { go('battle'); return; }
  if (a === 'go-rules') { homeTab = homeTab === 'rules' ? 'cover' : 'rules'; renderHome(); return; }
  if (a === 'go-dex') { homeTab = homeTab === 'dex' ? 'cover' : 'dex'; renderHome(); return; }
  if (a === 'dexcol') { dexColor = t.dataset.k; renderHome(); return; }
  if (a === 'rules') { modal = { type: 'rules' }; render(); return; }
  if (a === 'home-play') { go('battle'); modal = newSetup(); render(); return; }
  if (a === 'setupcancel') { modal = null; if (!G) go('home'); else render(); return; }
  if (a === 'dexcard') { const c = DEFS[t.dataset.id]; modal = { type: 'view', title: `${c.id} ${c.name}`, cards: [{ ...c, usedFx: [] }], size: 'xl', note: `${CN[c.color]}色・費用 ${c.cost}・${c.race}・攻擊力 ${c.atk}` }; render(); return; }
  if (a === 'newgame') { go('battle'); modal = newSetup(); render(); return; }
  if (a === 'builder') { modal = { type: 'builder', picked: (loadCustom() || []).slice() }; render(); return; }
  if (a === 'setdeck') { modal.deck = t.dataset.k; render(); return; }
  if (a === 'setleader') { modal.leader = +t.dataset.k; render(); return; }
  if (a === 'setaileader') { modal.aiLeader = t.dataset.k === 'rand' ? 'rand' : +t.dataset.k; render(); return; }
  if (a === 'setaideck') { modal.aiDeck = t.dataset.k; render(); return; }
  if (a === 'rps') {
    const hands = ['剪刀', '石頭', '布'], me = +t.dataset.k, ai = Math.floor(Math.random() * 3);
    const res = (me - ai + 3) % 3; // 1 = 我贏
    if (res === 0) { modal.rps = `玩家出${hands[me]}，電腦也出${hands[ai]}：平手，請再猜一次。`; modal.first = undefined; }
    else { modal.first = res === 1 ? 0 : 1; modal.rps = `玩家出${hands[me]}，電腦出${hands[ai]}，${res === 1 ? '玩家' : '電腦'}獲勝：【${res === 1 ? '玩家先攻' : '玩家後攻'}】`; }
    render(); return;
  }
  if (a === 'start') { startGame(); return; }
  if (a === 'btoggle') { const id = t.dataset.id, p = modal.picked; const k = p.indexOf(id); if (k >= 0) p.splice(k, 1); else if (p.length < 20 && !(DEFS[id].cost === 3 && p.filter(x => DEFS[x].cost === 3).length >= MAX_COST3)) p.push(id); render(); return; }
  if (a === 'bclear') { modal.picked = []; render(); return; }
  if (a === 'bfill') { const rest = shuffle(Object.keys(DEFS).filter(id => !modal.picked.includes(id))); while (modal.picked.length < 20 && rest.length) { const id = rest.pop(); if (DEFS[id].cost === 3 && modal.picked.filter(x => DEFS[x].cost === 3).length >= MAX_COST3) continue; modal.picked.push(id); } render(); return; }
  if (a === 'bsave') { saveCustom(modal.picked); modal = { ...newSetup(), deck: 'custom' }; render(); return; }
  if (a === 'viewdiscard') { const p = P(+t.dataset.p); modal = { type: 'view', title: `${p.name}的棄牌堆（${p.discard.length} 張）`, cards: p.discard.slice() }; render(); return; }
  if (a === 'pick') {
    const k = +t.dataset.k, p = modal.picked, i = p.indexOf(k);
    if (i >= 0) p.splice(i, 1); else { if (modal.max === 1) p.length = 0; if (p.length < modal.max) p.push(k); }
    render(); return;
  }
  if (a === 'pickok') { const m = modal; modal = null; m.res(m.picked.map(k => m.items[k])); render(); return; }
  if (a === 'pickcancel') { const m = modal; modal = null; m.res(null); render(); return; }
  if (!G || G.over) return;
  if (a === 'sel') { sel = { uid: +t.dataset.uid }; render(); return; }
  if (!pend) return;
  if (a === 'end' && (pend.kind === 'action' || pend.kind === 'response')) { answer(null); return; }
  if (a === 'next' && pend.kind === 'next') { answer(true); return; }
  if (a === 'forced' && pend.kind === 'summon') { answer({ forced: true }); return; }
  if (a === 'unenergy' && (pend.kind === 'action' || pend.kind === 'response')) { const e = P(0).consume.find(x => x.card && x.card.uid === +t.dataset.uid); if (e && undoEnergy(0, e)) render(); return; }
  if (a === 'energy' && (pend.kind === 'action' || pend.kind === 'response')) { const f = findCard(t.dataset.uid); if (f && f.where === 'hand') { toEnergy(0, f.card); sel = null; render(); } return; }
  if (a === 'summon' && pend.kind === 'summon') {
    const f = findCard(t.dataset.uid); if (!f) return; const unit = f.card, me = P(0);
    const match = me.hand.filter(c => c !== unit && (c.color === unit.color || c.wild));
    const pre = match.map((c, k) => k).sort((x, y) => val(match[x]) - val(match[y])).slice(0, unit.cost);
    const r = await IO.choose({ title: `支付【${unit.name}】的召喚費用`, desc: `選 ${unit.cost} 張${CN[unit.color]}色手牌，翻開時進入棄牌堆。已先幫你選價值最低的牌，可以點選更換。`, items: match.map(c => ({ card: c })), min: unit.cost, max: unit.cost, pre, cancelText: '取消' });
    if (r && pend && pend.kind === 'summon') answer({ unit, pay: r.map(x => x.card) });
    return;
  }
  if (a === 'fx') {
    const f = findCard(t.dataset.uid); if (!f) return;
    const idx = +t.dataset.idx;
    if (whyNot(0, f.where, f.card, idx, G.step)) return;
    answer({ where: f.where, card: f.card, idx });
  }
});
document.addEventListener('keydown', ev => {
  if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.matches('.card[data-act]')) { ev.preventDefault(); ev.target.click(); }
  if (ev.key === 'Escape' && modal && ['view', 'rules'].includes(modal.type)) { modal = null; render(); }
});

let lastSetup = null;
function newSetup() { const l = lastSetup || { leader: 0, deck: loadCustom() ? 'custom' : 'R', aiLeader: 'rand', aiDeck: 'rand' }; if (l.deck === 'custom' && !loadCustom()) l.deck = 'R'; return { type: 'setup', ...l }; }
// ---- 頁面切換：home 首頁（右側展示區：cover 卡背／rules 規則／dex 圖鑑）、battle 對戰 ----
const VERSION = '1.0.3';
let view = 'home', homeTab = 'cover', dexColor = 'R';
function go(v) {
  view = v;
  $('home').hidden = v !== 'home';
  $('topbar').hidden = v !== 'battle';
  $('battleView').hidden = v !== 'battle';
  if (v === 'home') renderHome();
  else if (G) render(); else renderEmptyBoard();
  window.scrollTo(0, 0);
}
function renderHome() {
  $('mRules').classList.toggle('on', homeTab === 'rules');
  $('mDex').classList.toggle('on', homeTab === 'dex');
  const st = $('homeStage');
  if (homeTab === 'rules') st.innerHTML = `<div class="stage-pane">${rulesHTML()}</div>`;
  else if (homeTab === 'dex') st.innerHTML = `<div class="stage-pane">${dexHTML()}</div>`;
  else st.innerHTML = `<div class="stage-cover"><img src="${BACK_LG}" alt="TriAspect Cards 卡背"></div>`;
}
function dexHTML() {
  const tabs = [['R', '紅'], ['B', '藍'], ['G', '綠']];
  const list = Object.values(DEFS).filter(c => c.color === dexColor).sort((x, y) => x.cost - y.cost || x.id.localeCompare(y.id));
  return `<h2>卡牌圖鑑</h2><p class="d">資料來自卡表 v1.0.2，點卡牌可放大。</p>
    <div class="dextabs">${tabs.map(([k, n]) => `<button class="dextab ${dexColor === k ? 'on' : ''}" data-act="dexcol" data-k="${k}"><i class="dot ${k}"></i>${n}色（${Object.values(DEFS).filter(c => c.color === k).length}）</button>`).join('')}</div>
    ${[1, 2, 3].map(cost => `<div class="dexsec">費用 ${cost}</div><div class="dexgrid">${list.filter(c => c.cost === cost).map(c => `<button data-act="dexcard" data-id="${c.id}" style="background:none;border:0;padding:0">${cardHTML({ ...c, usedFx: [] }, { click: true })}</button>`).join('')}</div>`).join('')}
    <div class="dexsec">主角</div><div class="leaders">${LEADERS.map(l => `<div class="leader"><b>${esc(l.name)}</b><small>${l.id}・${l.race}・生命 ${l.hp}・能力：暫無</small></div>`).join('')}</div>`;
}
go('home');
// 回首頁時放棄目前的對局，對戰畫面回到初始狀態
function resetBattle() {
  gameId++;            // 讓進行中的對局流程停止（等待中的步驟不會再繼續）
  G = null; pend = null; modal = null; sel = null; lastLogLen = -1;
  toasts = []; renderToasts();
  $('log').innerHTML = ''; $('infoOpp').innerHTML = ''; $('infoMe').innerHTML = '';
  ['oppConsume', 'meConsume', 'meHand', 'oppPool', 'mePool', 'oppHandN', 'meHandN'].forEach(id => ($(id).innerHTML = ''));
  renderEmptyBoard();
}
function renderEmptyBoard() {
  $('turnline').textContent = '選好主角與牌組後開始對戰';
  $('oppHand').innerHTML = Array.from({ length: 5 }, () => backHTML('xs')).join('');
  ['oppField', 'meField'].forEach(id => ($(id).innerHTML = backHTML('l')));
  $('axis').innerHTML = '<div class="steps"><span class="step">抽牌</span><span class="step">召喚</span><span class="step">翻開</span><span class="step">先攻行動</span><span class="step">後攻行動</span><span class="step">結算</span></div><div></div><div class="prompt"><div class="tt">準備開局</div></div>';
  $('inspector').innerHTML = '<h3>操作面板</h3><div class="hint">開始對戰後，點選卡牌會在這裡顯示可以進行的操作。</div>';
  renderModal();
}
