// BoraBet — servidor de partidas (autoritativo).
// Sem websockets: cada request "avança" a mesa até o momento atual (jogadas de bot vencidas,
// timeouts, pausas). Concurrency por versão otimista (matches.version).
import crypto from 'crypto';
import { db, q, rpc, ApiError, signal } from './db';
import * as D from '../domino';
import { chooseAction, thinkDelay, readyDelay } from '../botAI';
import { getSettings } from './settings';
import { trackMetrics } from './missions';
import { applyLevelUps, notify } from './progression';
import { creditBonus } from './wallet';

export const DISCONNECT_MS = 9000;
const FORMING_IDLE_MS = 25000;
const iso = (ms) => (ms == null ? null : new Date(ms).toISOString());
const ms = (v) => (v ? new Date(v).getTime() : null);
const round2 = (v) => Math.round(Number(v) * 100) / 100;
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

// ---------------------------------------------------------------- tiers & bots cache
let tierCache = null;
let tierAt = 0;
export async function getTiers(force = false) {
  if (!force && tierCache && Date.now() - tierAt < 20000) return tierCache;
  tierCache = await q(db().from('tiers').select('*').order('sort'));
  tierAt = Date.now();
  return tierCache;
}
export function invalidateTiers() { tierCache = null; }
export async function getTier(id) {
  const t = (await getTiers()).find((x) => x.id === id);
  if (t) return t;
  return (await getTiers(true)).find((x) => x.id === id);
}

let botCache = null;
let botAt = 0;
export function invalidateBots() { botCache = null; }
async function activeBots() {
  if (botCache && Date.now() - botAt < 15000) return botCache;
  botCache = await q(db().from('players').select('id,display_name,avatar_color,level,bot_skill,bot_speed_min_ms,bot_speed_max_ms')
    .eq('is_bot', true).eq('bot_active', true));
  botAt = Date.now();
  return botCache;
}
async function busyBotIds() {
  const rows = await q(db().from('matches').select('seats').in('status', ['forming', 'ready', 'playing']));
  const set = new Set();
  for (const r of rows) for (const s of r.seats || []) if (s && s.bot) set.add(s.pid);
  return set;
}
export function botSeat(b) {
  return {
    pid: b.id, bot: true, name: b.display_name, color: b.avatar_color, level: b.level,
    skill: b.bot_skill, smin: b.bot_speed_min_ms, smax: b.bot_speed_max_ms, ready: false, joinedAt: Date.now(),
  };
}
export async function pickBots(m, count, preferIds = []) {
  if (count <= 0) return [];
  const all = await activeBots();
  const busy = await busyBotIds();
  const inMatch = new Set((m.seats || []).filter(Boolean).map((s) => s.pid));
  const humans = (m.seats || []).filter((s) => s && !s.bot);
  const avg = humans.length ? humans.reduce((a, s) => a + (s.level || 1), 0) / humans.length : 5;
  const free = all.filter((b) => !busy.has(b.id) && !inMatch.has(b.id));
  const pref = free.filter((b) => preferIds.includes(b.id));
  const rest = free.filter((b) => !preferIds.includes(b.id))
    .map((b) => ({ b, k: Math.abs((b.level || 1) - avg) + Math.random() * 10 }))
    .sort((a, b) => a.k - b.k).map((x) => x.b);
  return [...pref, ...rest].slice(0, count);
}

// ---------------------------------------------------------------- helpers
export const nSeats = (mode) => (mode === '1v1' ? 2 : 4);
export function seatOf(m, pid) { return (m.seats || []).findIndex((s) => s && s.pid === pid); }
function humanSeat(p, s) {
  return {
    pid: p.id, bot: false, name: p.display_name, color: p.avatar_color, level: p.level,
    lastSeen: Date.now(), joinedAt: Date.now(), ready: false, timeouts: 0, banks: Number(s.time_bank_count ?? 2),
  };
}
export { humanSeat };

function rulesFor(tier, s) {
  return {
    mode: tier.mode, target: tier.target, tieRule: tier.tie_rule, saida66: tier.saida66,
    multCarroca: Number(s.mult_carroca ?? 2), multLaelo: Number(s.mult_laelo ?? 3), multCruzada: Number(s.mult_cruzada ?? 4),
  };
}

function scheduleTurn(m, tier, now) {
  const st = m.state;
  if (!st || st.phase !== 'playing') { m.turn_deadline = null; m.bot_due_at = null; return; }
  const seat = m.seats[st.turn];
  if (seat.bot) {
    const opts = D.legalMoves(st, st.turn).length;
    const due = now + thinkDelay({ speed_min_ms: seat.smin, speed_max_ms: seat.smax }, opts);
    m.bot_due_at = iso(due);
    m.turn_deadline = iso(due);
  } else {
    m.bot_due_at = null;
    m.turn_deadline = iso(now + Number(tier.turn_seconds || 20) * 1000);
  }
}

function startRoundServer(m, tier, now) {
  const seed = crypto.randomBytes(16).toString('hex');
  D.startRound(m.state, seed);
  m.state._seed = seed;
  m.meta.seedLog = [...(m.meta.seedLog || []), { round: m.state.round, hash: sha(seed) }];
  m.meta.nextReady = {};
  m.phase_deadline = null;
  scheduleTurn(m, tier, now);
}

function computePot(m) { return round2(Number(m.stake) * m.seats.length); }

export function endMatch(m, winnerTeam, reason, extra = {}) {
  const n = m.seats.length;
  const pct = m.is_free ? 0 : Number(m.commission_pct);
  const pot = Number(m.pot);
  const commission = round2((pot * pct) / 100);
  const winners = m.seats.map((s, i) => i).filter((i) => D.teamOf(i, n) === winnerTeam);
  const perWinner = winners.length ? round2((pot - commission) / winners.length) : 0;
  m.status = 'finished';
  m.finished_at = iso(Date.now());
  m.turn_deadline = null; m.bot_due_at = null; m.phase_deadline = null;
  m.result = {
    type: reason, winnerTeam, pot, commission, perWinner, scores: m.state?.scores || [0, 0],
    seats: m.seats.map((s, i) => ({
      name: s.name, bot: !!s.bot, team: D.teamOf(i, n),
      net: D.teamOf(i, n) === winnerTeam ? round2(perWinner - Number(m.stake)) : -Number(m.stake),
    })),
    history: m.state?.history || [],
    ...extra,
  };
  if (m.state) {
    m.meta.seedLog = (m.meta.seedLog || []).map((x) => (x.round === m.state.round ? { ...x, seed: m.state._seed } : x));
  }
}

export function annulMatch(m, reason, extra = {}) {
  m.status = 'annulled';
  m.finished_at = iso(Date.now());
  m.turn_deadline = null; m.bot_due_at = null; m.phase_deadline = null;
  m.result = {
    type: 'annulled', reason, pot: Number(m.pot), commission: 0, perWinner: 0, scores: m.state?.scores || [0, 0],
    seats: m.seats.map((s, i) => ({ name: s?.name, bot: !!s?.bot, team: D.teamOf(i, m.seats.length), net: 0 })),
    history: m.state?.history || [], ...extra,
  };
}

function afterStateChange(m, tier, s, now) {
  const st = m.state;
  if (st.phase === 'round_end' || st.phase === 'match_end') {
    m.meta.seedLog = (m.meta.seedLog || []).map((x) => (x.round === st.round ? { ...x, seed: st._seed } : x));
    // bots às vezes reagem como gente
    const rr = st.roundResult;
    if (rr && rr.winnerTeam != null) {
      m.seats.forEach((seat, i) => {
        if (seat.bot && Math.random() < 0.28) {
          const won = D.teamOf(i, m.seats.length) === rr.winnerTeam;
          const pool = won ? ['🔥', '👏', '👍'] : ['😮', '😅', '👍'];
          pushReaction(m, i, pool[Math.floor(Math.random() * pool.length)], now + 600 + Math.random() * 1400);
        }
      });
    }
  }
  if (st.phase === 'match_end') {
    endMatch(m, st.winnerTeam, 'normal');
  } else if (st.phase === 'round_end') {
    m.turn_deadline = null; m.bot_due_at = null;
    m.phase_deadline = iso(now + Number(s.round_break_s || 7) * 1000);
  } else {
    scheduleTurn(m, tier, now);
  }
}

function pushReaction(m, seat, emoji, at = Date.now()) {
  const list = (m.meta.reactions || []).filter((r) => at - r.at < 8000);
  list.push({ seat, emoji, at });
  m.meta.reactions = list.slice(-8);
}

// ---------------------------------------------------------------- advance
async function advance(m, tier, s, now) {
  let changed = false;
  let start = false;
  m.meta = m.meta || {};
  const n = m.seats.length;

  if (m.status === 'forming') {
    for (let i = 0; i < n; i++) {
      const seat = m.seats[i];
      if (!seat) continue;
      if (seat.reserved && now > seat.until) { m.seats[i] = null; changed = true; continue; }
      if (!seat.bot && !seat.reserved && now - (seat.lastSeen || 0) > FORMING_IDLE_MS) { m.seats[i] = null; changed = true; }
    }
    const humans = m.seats.filter((x) => x && !x.bot && !x.reserved).length;
    if (humans === 0 && !m.meta.adminRoom) {
      if (now - ms(m.created_at) > 60000) { m.status = 'cancelled'; changed = true; }
      return { changed, start };
    }
    if (humans > 0 && tier.bot_allowed) {
      const p = Number(s.bot_fill_probability) / 100;
      const lo = Number(s.bot_fill_delay_min_s) * 1000;
      const hi = Math.max(lo, Number(s.bot_fill_delay_max_s) * 1000);
      m.meta.fill = m.meta.fill || {};
      const need = [];
      for (let i = 0; i < n; i++) {
        if (m.seats[i]) continue;
        let f = m.meta.fill[i];
        if (!f) {
          f = { at: now + lo + Math.random() * (hi - lo), roll: Math.random() };
          m.meta.fill[i] = f;
          changed = true;
        }
        if (now >= f.at && (f.forced || f.roll < p)) need.push(i);
      }
      if (need.length) {
        const bots = await pickBots(m, need.length);
        bots.forEach((b, k) => { m.seats[need[k]] = botSeat(b); delete m.meta.fill[need[k]]; changed = true; });
      }
    }
    if (m.seats.every((x) => x && !x.reserved)) {
      m.status = 'ready';
      m.phase_deadline = iso(now + Number(s.ready_check_s || 12) * 1000);
      m.seats.forEach((x) => { x.ready = false; if (x.bot) x.readyAt = now + readyDelay(); });
      changed = true;
    }
    return { changed, start };
  }

  if (m.status === 'ready') {
    for (let i = 0; i < n; i++) {
      const seat = m.seats[i];
      if (!seat) continue;
      if (seat.bot && !seat.ready && now >= (seat.readyAt || 0)) { seat.ready = true; changed = true; }
      if (!seat.bot && now - (seat.lastSeen || 0) > FORMING_IDLE_MS) { m.seats[i] = null; changed = true; }
    }
    if (m.seats.some((x) => !x)) {
      m.status = 'forming'; m.phase_deadline = null; m.meta.fill = {};
      m.seats.forEach((x) => { if (x) x.ready = false; });
      return { changed: true, start };
    }
    if (m.seats.every((x) => x.ready)) return { changed, start: true };
    if (now > ms(m.phase_deadline)) {
      for (let i = 0; i < n; i++) if (!m.seats[i].ready && !m.seats[i].bot) m.seats[i] = null;
      m.status = 'forming'; m.phase_deadline = null; m.meta.fill = {};
      m.seats.forEach((x) => { if (x) x.ready = false; });
      changed = true;
    }
    return { changed, start };
  }

  if (m.status !== 'playing' || !m.state) return { changed, start };
  const st = m.state;

  for (let guard = 0; guard < 16; guard++) {
    if (m.status !== 'playing') break;
    if (st.phase === 'round_end') {
      const humansIdx = m.seats.map((x, i) => (!x.bot ? i : -1)).filter((i) => i >= 0);
      const allNext = humansIdx.every((i) => m.meta.nextReady?.[i] || now - (m.seats[i].lastSeen || 0) > DISCONNECT_MS);
      if (now >= ms(m.phase_deadline) || (allNext && humansIdx.length)) {
        startRoundServer(m, tier, now);
        changed = true;
        continue;
      }
      break;
    }
    if (st.phase === 'match_end') { if (m.status === 'playing') { endMatch(m, st.winnerTeam, 'normal'); changed = true; } break; }
    if (st.phase !== 'playing') break;

    const i = st.turn;
    const seat = m.seats[i];
    if (!m.turn_deadline) { scheduleTurn(m, tier, now); changed = true; }
    if (seat.bot) {
      if (now < ms(m.bot_due_at)) break;
      const act = chooseAction(st, i, seat.skill || 3);
      const r = D.applyAction(st, i, act);
      if (!r.ok) { const fb = D.canPass(st, i) ? { type: 'pass' } : D.canDraw(st, i) ? { type: 'draw' } : null; if (fb) D.applyAction(st, i, fb); }
      afterStateChange(m, tier, s, now);
      changed = true;
      continue;
    }
    // humano
    if (now < ms(m.turn_deadline)) break;
    const disconnected = now - (seat.lastSeen || 0) > DISCONNECT_MS;
    if (disconnected) {
      seat.dropped = true;
      const myTeam = D.teamOf(i, n);
      const otherDropped = m.seats.some((x, j) => !x.bot && D.teamOf(j, n) !== myTeam && (x.dropped || now - (x.lastSeen || 0) > DISCONNECT_MS));
      if (otherDropped) annulMatch(m, 'queda_dos_dois_lados', { round: st.round });
      else endMatch(m, 1 - myTeam, 'queda', { loserSeat: i, loserName: seat.name });
      changed = true;
      break;
    }
    seat.timeouts = (seat.timeouts || 0) + 1;
    if (seat.timeouts >= Number(s.max_timeouts || 3)) {
      endMatch(m, 1 - D.teamOf(i, n), 'abandono', { loserSeat: i, loserName: seat.name });
      changed = true;
      break;
    }
    const act = chooseAction(st, i, 2);
    if (act) D.applyAction(st, i, act);
    afterStateChange(m, tier, s, now);
    changed = true;
  }
  return { changed, start };
}

async function tryStart(m, tier, s, now) {
  const n = m.seats.length;
  m.state = D.createMatch(rulesFor(tier, s));
  m.meta.seedLog = [];
  m.pot = computePot(m);
  startRoundServer(m, tier, now);
  m.seats.forEach((x) => { x.lastSeen = x.bot ? undefined : Math.max(x.lastSeen || 0, now - 2000); });
  const entries = m.is_free ? [] : m.seats.filter((x) => !x.bot).map((x) => ({ pid: x.pid, amount: Number(m.stake) }));
  const res = await rpc('start_match', {
    p_match: m.id, p_version: m.version, p_entries: entries, p_seats: m.seats, p_state: m.state,
    p_meta: m.meta, p_turn_deadline: m.turn_deadline, p_bot_due: m.bot_due_at, p_pot: m.pot,
  });
  if (res?.ok) {
    m.status = 'playing';
    m.version += 1;
    m.meta.paid = res.parts || [];
    return 'started';
  }
  if (res?.conflict) return 'conflict';
  // alguém ficou sem saldo: sai da mesa, volta a formar
  const idx = seatOf(m, res?.pid);
  if (idx >= 0) {
    await notify(m.seats[idx].pid, 'match', 'Saldo insuficiente', 'Você saiu da mesa porque o saldo não cobria a aposta.');
    m.seats[idx] = null;
  }
  m.state = null; m.status = 'forming'; m.meta.fill = {}; m.turn_deadline = null; m.bot_due_at = null;
  m.seats.forEach((x) => { if (x) x.ready = false; });
  return 'failed';
}

// ---------------------------------------------------------------- persistence
export async function loadMatch(id) {
  return (await q(db().from('matches').select('*').eq('id', id).limit(1)))[0] || null;
}
async function saveMatch(m) {
  const patch = {
    status: m.status, seats: m.seats, state: m.state, meta: m.meta, result: m.result, pot: m.pot,
    turn_deadline: m.turn_deadline, bot_due_at: m.bot_due_at, phase_deadline: m.phase_deadline,
    finished_at: m.finished_at, version: m.version + 1, updated_at: new Date().toISOString(),
  };
  const { data, error } = await db().from('matches').update(patch).eq('id', m.id).eq('version', m.version).select('id');
  if (error) throw new ApiError(500, 'db', error.message);
  if (!data?.length) return false;
  m.version += 1;
  return true;
}

// fn(m, tier, s, now) → may mutate m, return {changed?:bool, out?:any}
export async function mutateMatch(id, fn = null, pid = null) {
  const s = await getSettings();
  for (let attempt = 0; attempt < 6; attempt++) {
    const m = await loadMatch(id);
    if (!m) throw new ApiError(404, 'match_not_found', 'Mesa não encontrada');
    const tier = await getTier(m.tier_id);
    const now = Date.now();
    let changed = false;
    // presença
    if (pid) {
      const i = seatOf(m, pid);
      if (i >= 0 && !m.seats[i].bot && now - (m.seats[i].lastSeen || 0) > 4000 &&
          ['forming', 'ready', 'playing'].includes(m.status)) {
        m.seats[i].lastSeen = now;
        if (m.seats[i].dropped) m.seats[i].dropped = false;
        changed = true;
      }
    }
    const adv = await advance(m, tier, s, now);
    changed = changed || adv.changed;
    if (adv.start) {
      const r = await tryStart(m, tier, s, now);
      if (r === 'conflict') continue;
      if (r === 'failed') changed = true;
    }
    let out = null;
    if (fn) {
      const r = await fn(m, tier, s, now);
      if (r?.changed) changed = true;
      out = r?.out ?? null;
    }
    if (changed) {
      const ok = await saveMatch(m);
      if (!ok) { await new Promise((r) => setTimeout(r, 40 + Math.random() * 120)); continue; }
      signal('match:' + m.id);
    }
    if ((m.status === 'finished' || m.status === 'annulled') && !m.settled) {
      await finalize(m, tier, s);
      m.settled = true;
    }
    return { m, tier, s, out };
  }
  throw new ApiError(409, 'busy', 'Mesa ocupada, tente de novo');
}

// ---------------------------------------------------------------- player actions
export function playerAction(pid, body) {
  return async (m, tier, s, now) => {
    const i = seatOf(m, pid);
    const type = body?.type;
    if (i < 0) throw new ApiError(403, 'not_seated', 'Você não está nesta mesa');
    const seat = m.seats[i];
    const n = m.seats.length;

    if (type === 'heartbeat') return {};
    if (type === 'react') {
      const allowed = ['👍', '😅', '🔥', '😮', '🎲', '👏'];
      if (!allowed.includes(body.emoji)) throw new ApiError(400, 'bad_emoji');
      const last = (m.meta.reactions || []).filter((r) => r.seat === i).pop();
      if (last && now - last.at < 1500) return {};
      pushReaction(m, i, body.emoji, now);
      return { changed: true };
    }
    if (type === 'leave') {
      if (m.status === 'forming' || m.status === 'ready') {
        m.seats[i] = null;
        if (m.status === 'ready') { m.status = 'forming'; m.phase_deadline = null; m.meta.fill = {}; m.seats.forEach((x) => { if (x) x.ready = false; }); }
        if (!m.seats.some((x) => x && !x.bot && !x.reserved) && !m.meta.adminRoom) m.status = 'cancelled';
        return { changed: true };
      }
      if (m.status === 'playing') throw new ApiError(400, 'use_forfeit', 'Use desistir');
      return {};
    }
    if (type === 'ready') {
      if (m.status !== 'ready') return {};
      seat.ready = true;
      return { changed: true };
    }
    if (type === 'fill_bots') {
      if (m.status !== 'forming') return {};
      if (!s.allow_manual_bot_fill || !tier.bot_allowed) throw new ApiError(400, 'no_bots', 'Bots desativados nesta mesa');
      if (now - ms(m.created_at) < Number(s.matchmaking_max_wait_s) * 1000 && now - (seat.joinedAt || 0) < Number(s.matchmaking_max_wait_s) * 1000) {
        throw new ApiError(400, 'too_soon', 'Aguarde mais um pouco');
      }
      m.meta.fill = m.meta.fill || {};
      let k = 0;
      for (let j = 0; j < n; j++) if (!m.seats[j] || (m.seats[j].reserved)) {
        if (m.seats[j]?.reserved) m.seats[j] = null;
        m.meta.fill[j] = { at: now + 600 + k * (700 + Math.random() * 1200), roll: 0, forced: true };
        k++;
      }
      return { changed: true };
    }
    if (m.status !== 'playing' || !m.state) throw new ApiError(400, 'not_playing', 'A partida não está em andamento');
    const st = m.state;

    if (type === 'forfeit') {
      endMatch(m, 1 - D.teamOf(i, n), 'desistencia', { loserSeat: i, loserName: seat.name });
      return { changed: true };
    }
    if (type === 'next') {
      if (st.phase !== 'round_end') return {};
      m.meta.nextReady = { ...(m.meta.nextReady || {}), [i]: true };
      return { changed: true };
    }
    if (type === 'bank') {
      if (st.turn !== i || st.phase !== 'playing' || !(seat.banks > 0)) throw new ApiError(400, 'no_bank', 'Sem tempo extra');
      seat.banks -= 1;
      m.turn_deadline = iso(ms(m.turn_deadline) + Number(s.time_bank_s || 10) * 1000);
      return { changed: true };
    }
    if (type === 'play' || type === 'pass' || type === 'draw') {
      if (st.turn !== i) throw new ApiError(400, 'not_your_turn', 'Não é a sua vez');
      const r = D.applyAction(st, i, { type, tile: body.tile, side: body.side });
      if (!r.ok) throw new ApiError(400, r.error, 'Jogada inválida');
      seat.timeouts = 0;
      if (type === 'draw') { m.turn_deadline = iso(Math.max(ms(m.turn_deadline), now + 6000)); return { changed: true }; }
      afterStateChange(m, tier, s, now);
      return { changed: true };
    }
    throw new ApiError(400, 'bad_action');
  };
}

// ---------------------------------------------------------------- client view
export function clientView(m, tier, pid, s, now = Date.now()) {
  const me = seatOf(m, pid);
  const n = m.seats.length;
  const pct = m.is_free ? 0 : Number(m.commission_pct);
  const pot = Number(m.pot) || round2(Number(m.stake) * n);
  const winnersPerTeam = n === 4 ? 2 : 1;
  const ticks = [m.bot_due_at, m.turn_deadline, m.phase_deadline].map(ms).filter((x) => x && x > now);
  for (const f of Object.values(m.meta?.fill || {})) if (f.at > now) ticks.push(f.at);
  for (const x of m.seats) if (x?.bot && !x.ready && x.readyAt > now && m.status === 'ready') ticks.push(x.readyAt);
  const waitedMs = me >= 0 ? now - (m.seats[me]?.joinedAt || now) : 0;
  return {
    id: m.id,
    status: m.status,
    mode: m.mode,
    tier: tier && { id: tier.id, name: tier.name, target: tier.target, tie_rule: tier.tie_rule, saida66: tier.saida66, turn_seconds: tier.turn_seconds, bot_allowed: tier.bot_allowed },
    stake: Number(m.stake),
    pot,
    commissionPct: pct,
    netPerWinner: round2((pot - (pot * pct) / 100) / winnersPerTeam),
    isFree: m.is_free,
    isPrivate: m.is_private,
    inviteCode: me >= 0 ? m.invite_code : null,
    seats: m.seats.map((x, i) => x && {
      name: x.reserved ? null : x.name, color: x.color, level: x.level, bot: !!x.bot, ready: !!x.ready, reserved: !!x.reserved,
      reservedUntil: x.reserved ? x.until : null,
      me: i === me, team: D.teamOf(i, n),
      connected: x.bot || x.reserved ? true : now - (x.lastSeen || 0) < DISCONNECT_MS,
      dropped: !!x.dropped, banks: i === me ? x.banks : undefined,
    }),
    mySeat: me,
    myTeam: me >= 0 ? D.teamOf(me, n) : null,
    state: m.state ? D.viewFor(m.state, me >= 0 ? me : null) : null,
    reactions: (m.meta?.reactions || []).filter((r) => r.at <= now + 3000 && now - r.at < 3000),
    nextReady: m.meta?.nextReady || {},
    seedLog: (m.meta?.seedLog || []).map((x) => ({ round: x.round, hash: x.hash, seed: x.seed || null })),
    turnDeadline: m.turn_deadline,
    phaseDeadline: m.phase_deadline,
    nextTickAt: ticks.length ? Math.min(...ticks) : null,
    serverNow: now,
    createdAt: m.created_at,
    canFillBots: m.status === 'forming' && !!s.allow_manual_bot_fill && !!tier?.bot_allowed &&
      waitedMs >= Number(s.matchmaking_max_wait_s) * 1000,
    maxWaitS: Number(s.matchmaking_max_wait_s),
    result: m.result,
  };
}

// ---------------------------------------------------------------- settlement & progress
async function finalize(m, tier, s) {
  const n = m.seats.length;
  const res = m.result || {};
  const paid = m.meta?.paid || [];
  const payouts = [];
  const house = [];
  const annulled = m.status === 'annulled';
  const started = !!m.state;

  if (annulled) {
    for (const p of paid) {
      if (Number(p.real) || Number(p.bonus)) {
        payouts.push({ pid: p.pid, real: Number(p.real), bonus: Number(p.bonus), type: 'refund', meta: { match: m.id, reason: res.reason } });
      }
    }
  } else if (started && !m.is_free) {
    m.seats.forEach((x, i) => {
      const won = D.teamOf(i, n) === res.winnerTeam;
      if (x.bot) {
        house.push({ type: 'bot_stake', amount: -Number(m.stake), meta: { bot: x.pid } });
        if (won) house.push({ type: 'bot_win', amount: Number(res.perWinner), meta: { bot: x.pid } });
      } else if (won) {
        payouts.push({ pid: x.pid, real: Number(res.perWinner), bonus: 0, type: 'win', meta: { match: m.id, tier: tier?.name } });
      }
    });
    if (Number(res.commission) > 0) house.push({ type: 'commission', amount: Number(res.commission), meta: {} });
  }

  const ok = await rpc('settle_match', { p_match: m.id, p_payouts: payouts, p_house: house });
  if (!ok || !started) return;

  const st = m.state;
  const finishedAt = m.finished_at || new Date().toISOString();
  const rows = m.seats.map((x, i) => {
    const team = D.teamOf(i, n);
    const won = !annulled && team === res.winnerTeam;
    const forfeited = !annulled && res.loserSeat === i && ['desistencia', 'abandono', 'queda'].includes(res.type);
    const partner = n === 4 ? m.seats[(i + 2) % 4] : null;
    return {
      match_id: m.id, player_id: x.pid, seat: i, team, is_bot: !!x.bot, partner_id: partner?.pid || null,
      result: annulled ? 'annulled' : forfeited ? 'forfeit' : won ? 'win' : 'loss',
      net: annulled || m.is_free ? 0 : won ? round2(Number(res.perWinner) - Number(m.stake)) : -Number(m.stake),
      score_us: st.scores[team] || 0, score_them: st.scores[1 - team] || 0, tier_name: tier?.name, finished_at: finishedAt,
    };
  });
  await db().from('match_players').upsert(rows, { onConflict: 'match_id,player_id', ignoreDuplicates: true });

  await Promise.all(m.seats.map(async (x, i) => {
    if (x.bot) {
      if (!annulled) {
        const won = D.teamOf(i, n) === res.winnerTeam;
        await rpc('player_progress', { p_player: x.pid, p: { won, counted: true, xp: won ? 50 : 20 } }).catch(() => {});
      }
      return;
    }
    const team = D.teamOf(i, n);
    const won = !annulled && team === res.winnerTeam;
    const stt = st.stats[i] || {};
    const row = rows[i];
    const points = (st.history || []).filter((h) => h.team === team).reduce((a, h) => a + h.points, 0);
    const xp = annulled || row.result === 'forfeit' ? 0
      : Number(s.xp_match) + (won ? Number(s.xp_win) : 0) + Number(s.xp_round_won) * (stt.roundsWon || 0);
    const prog = await rpc('player_progress', {
      p_player: x.pid,
      p: {
        xp, won, counted: !annulled, rounds_won: stt.roundsWon || 0, carrocas: stt.carrocas || 0, laelos: stt.laelos || 0,
        fechamentos: stt.fechWins || 0, forfeit: row.result === 'forfeit' ? 1 : 0, net: row.net,
        pot: won ? Number(res.perWinner) : 0,
      },
    });
    if (!annulled) {
      await trackMetrics(x.pid, {
        matches_played: 1, matches_won: won ? 1 : 0, tiles_played: stt.tiles || 0, rounds_won: stt.roundsWon || 0,
        batidas: stt.batidas || 0, carrocas: stt.carrocas || 0, laelos: stt.laelos || 0, fechamentos: stt.fechWins || 0,
        opp_passes: stt.oppPassesCaused || 0, points_scored: points, bc_won: row.net > 0 ? row.net : 0,
        win_streak: prog?.win_streak || 0,
      });
    }
    await applyLevelUps(x.pid, s);
    if (m.is_free) {
      const p = (await q(db().from('players').select('id,onboarding,welcome_given').eq('id', x.pid).limit(1)))[0];
      const ob = { ...(p?.onboarding || {}), estreia_done: true };
      await db().from('players').update({ onboarding: ob, welcome_given: true }).eq('id', x.pid);
      if (p && !p.welcome_given && Number(s.welcome_bonus) > 0) {
        await creditBonus(x.pid, Number(s.welcome_bonus), 'welcome', m.id, Number(s.wagering_multiplier));
        await notify(x.pid, 'reward', 'Boas-vindas!', `${s.welcome_bonus} BC de bônus para jogar já estão no seu saldo.`);
      }
    } else if (!annulled) {
      await notify(x.pid, 'match', won ? 'Vitória!' : 'Fim de partida',
        won ? `Sua dupla venceu na ${tier?.name}: +${res.perWinner} BC.` : `A partida na ${tier?.name} terminou ${st.scores[team]} × ${st.scores[1 - team]}.`);
    } else {
      await notify(x.pid, 'match', 'Partida anulada', 'A aposta voltou para o seu saldo, sem comissão.');
    }
  }));
  signal('lobby');
}

// ---------------------------------------------------------------- sweeper
export async function sweepStale(limit = 6) {
  const cutoff = new Date(Date.now() - 45000).toISOString();
  const rows = await q(db().from('matches').select('id').in('status', ['forming', 'ready', 'playing'])
    .lt('updated_at', cutoff).order('updated_at').limit(limit));
  let n = 0;
  for (const r of rows) {
    try { await mutateMatch(r.id); n++; } catch (e) { /* ignore */ }
  }
  // settle anything that finished but was not settled (crash safety)
  const uns = await q(db().from('matches').select('id').in('status', ['finished', 'annulled']).eq('settled', false).limit(limit));
  for (const r of uns) { try { await mutateMatch(r.id); } catch (e) { /* ignore */ } }
  return n;
}
