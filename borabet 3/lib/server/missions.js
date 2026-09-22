// BoraBet — Motor de missões
// Escopos:
//  daily       → N missões sorteadas por dia (peso), alvo e prêmio escalam com o nível
//  weekly      → N missões por semana ISO
//  level       → cadeia infinita: ao resgatar, nasce a próxima (alvo × growth^k)
//  achievement → conquistas em cadeia sobre o total da vida (5 → 12 → 31 carroças…)
import { db, q, rpc, ApiError } from './db';
import { dayKey, dayEnd, weekInfo } from './time';
import { creditReward } from './wallet';
import { applyLevelUps } from './progression';

const LIFETIME_COLUMN = {
  matches_played: 'matches_played', matches_won: 'matches_won', carrocas: 'carrocas', laelos: 'laelos',
  fechamentos: 'fechamentos', win_streak: 'best_streak', rounds_won: 'rounds_won',
};

let tplCache = null;
let tplAt = 0;
export async function templates(force = false) {
  if (!force && tplCache && Date.now() - tplAt < 30000) return tplCache;
  tplCache = await q(db().from('mission_templates').select('*').eq('active', true));
  tplAt = Date.now();
  return tplCache;
}
export function invalidateTemplates() { tplCache = null; }

function niceRound(v, step) {
  step = Math.max(1, Number(step) || 1);
  return Math.max(step, Math.round(v / step) * step);
}

// Pure: computes a concrete mission from a template for a player level and chain index
export function instantiate(t, level, k = 0, rand = Math.random) {
  const L = Math.max(1, level) - 1;
  const nominal = (Number(t.base_target) + Number(t.target_per_level) * L) * Math.pow(Number(t.target_growth), k);
  const varied = nominal * (1 + (rand() * 2 - 1) * Number(t.target_variance));
  const target = niceRound(varied, t.target_round);
  const difficulty = nominal > 0 ? target / niceRound(nominal, t.target_round) : 1;
  const g = Math.pow(Number(t.reward_growth), k);
  const bc = Math.round(((Number(t.reward_bc_base) + Number(t.reward_bc_per_level) * L) * g * difficulty) / 5) * 5;
  const xp = Math.round((Number(t.reward_xp_base) + Number(t.reward_xp_per_level) * L) * g * difficulty);
  return {
    target,
    reward_bc: Math.max(0, bc),
    reward_xp: Math.max(0, xp),
    title: String(t.title_pt).replace('{n}', target.toLocaleString('pt-BR')),
  };
}

function weightedPick(list, count, rand = Math.random) {
  const pool = list.slice();
  const out = [];
  while (out.length < count && pool.length) {
    const total = pool.reduce((s, t) => s + Math.max(1, t.weight), 0);
    let r = rand() * total;
    let i = 0;
    for (; i < pool.length; i++) { r -= Math.max(1, pool[i].weight); if (r <= 0) break; }
    out.push(pool.splice(Math.min(i, pool.length - 1), 1)[0]);
  }
  return out;
}

export async function ensureMissions(player, s) {
  const sb = db();
  const tz = s.timezone || 'America/Sao_Paulo';
  const dk = dayKey(tz);
  const wk = weekInfo(tz);
  const now = new Date();
  const level = player.level || 1;

  // expire old
  await sb.from('player_missions').update({ status: 'expired' })
    .eq('player_id', player.id).in('status', ['active', 'completed']).lt('expires_at', now.toISOString());

  const all = await templates();
  const existing = await q(sb.from('player_missions')
    .select('id,template_id,scope,period_key,chain_index,status')
    .eq('player_id', player.id)
    .or(`period_key.eq.${dk},period_key.eq.${wk.key},scope.eq.level,scope.eq.achievement`));

  const rows = [];
  const eligible = (scope) => all.filter((t) => t.scope === scope && level >= t.min_level && level <= t.max_level);

  // daily & weekly
  for (const [scope, key, count, expires] of [
    ['daily', dk, Number(s.missions_daily_count), dayEnd(tz)],
    ['weekly', wk.key, Number(s.missions_weekly_count), wk.end],
  ]) {
    const have = existing.filter((m) => m.scope === scope && m.period_key === key);
    const missing = count - have.length;
    if (missing > 0) {
      const used = new Set(have.map((m) => m.template_id));
      for (const t of weightedPick(eligible(scope).filter((t) => !used.has(t.id)), missing)) {
        const inst = instantiate(t, level, 0);
        rows.push({
          player_id: player.id, template_id: t.id, scope, metric: t.metric, agg: t.agg, icon: t.icon,
          period_key: key, chain_index: 0, expires_at: expires.toISOString(), ...inst,
        });
      }
    }
  }

  // level chain (unlimited)
  const openLevel = existing.filter((m) => m.scope === 'level' && ['active', 'completed'].includes(m.status));
  const slots = Number(s.missions_level_slots) - openLevel.length;
  if (slots > 0) {
    const openTpl = new Set(openLevel.map((m) => m.template_id));
    for (const t of weightedPick(eligible('level').filter((t) => !openTpl.has(t.id)), slots)) {
      const k = existing.filter((m) => m.template_id === t.id).length;
      const inst = instantiate(t, level, k);
      rows.push({
        player_id: player.id, template_id: t.id, scope: 'level', metric: t.metric, agg: t.agg, icon: t.icon,
        period_key: 'L', chain_index: k, expires_at: null, ...inst,
      });
    }
  }

  // achievements: one open step per template, progress seeded from lifetime stats
  for (const t of eligible('achievement')) {
    const mine = existing.filter((m) => m.template_id === t.id);
    if (mine.some((m) => ['active', 'completed'].includes(m.status))) continue;
    const k = mine.length;
    const inst = instantiate(t, level, k);
    const col = LIFETIME_COLUMN[t.metric];
    const progress = col ? Number(player[col] || 0) : 0;
    rows.push({
      player_id: player.id, template_id: t.id, scope: 'achievement', metric: t.metric, agg: t.agg, icon: t.icon,
      period_key: 'A', chain_index: k, expires_at: null, ...inst, progress: Math.min(progress, inst.target),
      status: progress >= inst.target ? 'completed' : 'active',
      completed_at: progress >= inst.target ? now.toISOString() : null,
    });
  }

  if (rows.length) await sb.from('player_missions').upsert(rows, { onConflict: 'player_id,template_id,period_key,chain_index', ignoreDuplicates: true });
}

export async function listMissions(player, s) {
  await ensureMissions(player, s);
  const tz = s.timezone || 'America/Sao_Paulo';
  const dk = dayKey(tz);
  const wk = weekInfo(tz).key;
  const rows = await q(db().from('player_missions').select('*').eq('player_id', player.id)
    .or(`period_key.eq.${dk},period_key.eq.${wk},status.eq.active,status.eq.completed`)
    .neq('status', 'expired').order('created_at', { ascending: true }));
  const order = { completed: 0, active: 1, claimed: 2 };
  return rows
    .filter((m) => m.scope === 'daily' || m.scope === 'weekly' || m.status !== 'claimed')
    .map((m) => ({
      id: m.id, scope: m.scope, title: m.title, icon: m.icon, target: Number(m.target),
      progress: Math.min(Number(m.progress), Number(m.target)), reward_bc: Number(m.reward_bc),
      reward_xp: Number(m.reward_xp), status: m.status, expires_at: m.expires_at, chain: m.chain_index,
    }))
    .sort((a, b) => order[a.status] - order[b.status]);
}

// metrics: { matches_played: 1, carrocas: 2, win_streak: 3, ... }
export async function trackMetrics(playerId, metrics) {
  const keys = Object.keys(metrics).filter((k) => metrics[k] != null && metrics[k] !== 0);
  if (!keys.length) return [];
  const sb = db();
  const now = new Date().toISOString();
  const rows = await q(sb.from('player_missions').select('id,metric,agg,progress,target,expires_at')
    .eq('player_id', playerId).eq('status', 'active').in('metric', keys));
  const completed = [];
  await Promise.all(rows.map(async (m) => {
    if (m.expires_at && m.expires_at < now) return;
    const v = Number(metrics[m.metric]);
    const progress = m.agg === 'max' ? Math.max(Number(m.progress), v) : Number(m.progress) + v;
    if (progress === Number(m.progress)) return;
    const done = progress >= Number(m.target);
    await sb.from('player_missions').update({
      progress: Math.min(progress, Number(m.target)),
      ...(done ? { status: 'completed', completed_at: now } : {}),
    }).eq('id', m.id).eq('status', 'active');
    if (done) completed.push(m.id);
  }));
  if (completed.length) {
    await sb.from('notifications').insert({
      player_id: playerId, kind: 'mission', title: 'Missão concluída!',
      body: completed.length > 1 ? `${completed.length} missões prontas para resgatar.` : 'Uma missão está pronta para resgatar.',
    });
  }
  return completed;
}

export async function claimMission(player, missionId, s) {
  const sb = db();
  const upd = await q(sb.from('player_missions').update({ status: 'claimed', claimed_at: new Date().toISOString() })
    .eq('id', missionId).eq('player_id', player.id).eq('status', 'completed').select('*'));
  const m = upd[0];
  if (!m) throw new ApiError(400, 'not_claimable', 'Missão ainda não concluída');
  if (Number(m.reward_bc) > 0) await creditReward(player.id, m.reward_bc, 'mission', m.id, { title: m.title }, s);
  if (Number(m.reward_xp) > 0) await rpc('player_progress', { p_player: player.id, p: { xp: Math.round(m.reward_xp), counted: false } });
  const lvl = await applyLevelUps(player.id, s);
  if (m.scope === 'level' || m.scope === 'achievement') {
    const fresh = (await q(sb.from('players').select('*').eq('id', player.id).limit(1)))[0];
    await ensureMissions(fresh, s);
  }
  return { reward_bc: Number(m.reward_bc), reward_xp: Number(m.reward_xp), levelUp: lvl };
}
