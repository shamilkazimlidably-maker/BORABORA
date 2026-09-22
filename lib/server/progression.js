import { db, q, rpc } from './db';

export function xpForLevel(level, s) {
  if (level <= 1) return 0;
  return Math.round(Number(s.xp_base) * Math.pow(level - 1, Number(s.xp_exp)));
}
export function levelFromXp(xp, s) {
  let L = 1;
  while (L < 200 && xpForLevel(L + 1, s) <= xp) L++;
  return L;
}
export function tierFor(level, s) {
  const tiers = [...(s.level_tiers || [])].sort((a, b) => a.min - b.min);
  let cur = tiers[0] || { name: 'Novato', min: 1 };
  let next = null;
  for (const t of tiers) { if (level >= t.min) cur = t; else { next = next || t; } }
  return { name: cur.name, next: next ? next.name : null, nextLevel: next ? next.min : null };
}
export function levelInfo(xp, s) {
  const level = levelFromXp(Number(xp), s);
  const from = xpForLevel(level, s);
  const to = xpForLevel(level + 1, s);
  return { level, xp: Number(xp), from, to, tier: tierFor(level, s) };
}

export async function notify(playerId, kind, title, body) {
  try { await db().from('notifications').insert({ player_id: playerId, kind, title, body }); } catch (e) { /* noop */ }
}

// Applies level ups (bonus + notification). Returns {from, to} or null.
export async function applyLevelUps(playerId, s) {
  const p = (await q(db().from('players').select('id,xp,level').eq('id', playerId).limit(1)))[0];
  if (!p) return null;
  const newLevel = levelFromXp(Number(p.xp), s);
  if (newLevel <= p.level) return null;
  const upd = await db().from('players').update({ level: newLevel }).eq('id', playerId).eq('level', p.level).select('id');
  if (!upd.data?.length) return null;
  let bonus = 0;
  for (let L = p.level + 1; L <= newLevel; L++) bonus += Number(s.level_up_bonus) * L;
  if (bonus > 0) {
    const toBonus = (s.reward_balance || 'bonus') === 'bonus';
    await rpc('wallet_apply', {
      p_player: playerId, p_real: toBonus ? 0 : bonus, p_bonus: toBonus ? bonus : 0, p_type: 'level_up',
      p_ref: `lvl${newLevel}`, p_meta: { level: newLevel }, p_wager_add: toBonus ? bonus * Number(s.reward_wager_mult || 0) : 0,
    });
    await db().from('house_ledger').insert({ type: 'bonus', amount: -bonus, ref: playerId, meta: { kind: 'level_up', level: newLevel } });
  }
  const t = tierFor(newLevel, s);
  await notify(playerId, 'level', `Nível ${newLevel}!`, `Você subiu para o nível ${newLevel} (${t.name}) e ganhou ${bonus} BC.`);
  return { from: p.level, to: newLevel, bonus };
}
