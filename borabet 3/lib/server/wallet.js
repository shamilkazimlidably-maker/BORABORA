import { db, rpc } from './db';

// Credits a reward respecting admin setting reward_balance ('bonus' with wagering, or 'real')
export async function creditReward(playerId, amount, type, ref, meta, s) {
  amount = Math.round(Number(amount) * 100) / 100;
  if (!amount) return null;
  const toBonus = (s.reward_balance || 'bonus') === 'bonus';
  const r = await rpc('wallet_apply', {
    p_player: playerId, p_real: toBonus ? 0 : amount, p_bonus: toBonus ? amount : 0, p_type: type,
    p_ref: ref || null, p_meta: meta || {}, p_wager_add: toBonus ? amount * Number(s.reward_wager_mult || 0) : 0,
  });
  await db().from('house_ledger').insert({ type: 'bonus', amount: -amount, ref: playerId, meta: { kind: type, ...(meta || {}) } });
  return r;
}

export async function creditBonus(playerId, amount, type, ref, wagerMult, meta = {}) {
  amount = Math.round(Number(amount) * 100) / 100;
  if (!amount) return null;
  const r = await rpc('wallet_apply', {
    p_player: playerId, p_real: 0, p_bonus: amount, p_type: type, p_ref: ref || null,
    p_meta: meta, p_wager_add: amount * Number(wagerMult || 0),
  });
  await db().from('house_ledger').insert({ type: 'bonus', amount: -amount, ref: playerId, meta: { kind: type } });
  return r;
}

export function balances(p) {
  return {
    real: Number(p.balance_real), bonus: Number(p.balance_bonus), pending: Number(p.balance_pending),
    wager: Number(p.wager_remaining), total: Number(p.balance_real) + Number(p.balance_bonus),
  };
}
