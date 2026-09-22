import { db, q, rpc, ApiError } from './db';
import { getSettings } from './settings';
import { creditBonus } from './wallet';
import { notify } from './progression';
import { trackMetrics } from './missions';
import { tgSend } from './telegram';

export async function confirmDeposit(id, note) {
  const s = await getSettings();
  const sb = db();
  const d = (await q(sb.from('deposits').update({ status: 'credited', credited_at: new Date().toISOString(), updated_at: new Date().toISOString(), admin_note: note || null })
    .eq('id', id).in('status', ['awaiting', 'detected', 'expired']).select('*')))[0];
  if (!d) throw new ApiError(400, 'state', 'Yatırım onaylanabilir durumda değil (zaten onaylı/reddedilmiş olabilir)');
  await rpc('wallet_apply', { p_player: d.player_id, p_real: Number(d.amount_bc), p_bonus: 0, p_type: 'deposit', p_ref: d.id, p_meta: { asset: d.asset, tx: d.tx_hash }, p_wager_add: 0 });
  if (Number(d.bonus_bc) > 0) await creditBonus(d.player_id, Number(d.bonus_bc), 'deposit_bonus', d.id, Number(s.wagering_multiplier));
  await trackMetrics(d.player_id, { deposits_bc: Number(d.amount_bc) });
  const p = (await q(sb.from('players').select('id,referred_by,referral_rewarded,telegram_id').eq('id', d.player_id).limit(1)))[0];
  if (p?.referred_by && !p.referral_rewarded && Number(s.referral_bonus) > 0) {
    const upd = await q(sb.from('players').update({ referral_rewarded: true }).eq('id', p.id).eq('referral_rewarded', false).select('id'));
    if (upd.length) {
      await creditBonus(p.id, Number(s.referral_bonus), 'referral', p.referred_by, Number(s.wagering_multiplier));
      await creditBonus(p.referred_by, Number(s.referral_bonus), 'referral', p.id, Number(s.wagering_multiplier));
      await notify(p.referred_by, 'friend', 'Seu amigo depositou!', `Vocês dois ganharam ${s.referral_bonus} BC de bônus.`);
    }
  }
  await notify(d.player_id, 'deposit', 'Depósito creditado', `${Number(d.amount_bc) + Number(d.bonus_bc)} BC entraram no seu saldo.`);
  if (p?.telegram_id) tgSend(p.telegram_id, `✅ Depósito creditado: <b>${d.amount_bc} BC</b>${Number(d.bonus_bc) ? ` + ${d.bonus_bc} BC de bônus` : ''}.`);
  return d;
}

export async function setWithdrawal(id, action, { tx_hash, note } = {}) {
  const sb = db();
  const w = (await q(sb.from('withdrawals').select('*').eq('id', id).limit(1)))[0];
  if (!w) throw new ApiError(404, 'not_found', 'Çekim bulunamadı');
  const now = new Date().toISOString();
  const flow = {
    review: [['requested'], 'review'],
    sent: [['requested', 'review'], 'sent'],
    complete: [['sent'], 'completed'],
    reject: [['requested', 'review'], 'rejected'],
  }[action];
  if (!flow) throw new ApiError(400, 'bad_action');
  if (!flow[0].includes(w.status)) throw new ApiError(400, 'state', `Bu çekim "${w.status}" durumunda, işlem yapılamaz`);
  if (action === 'sent' && !tx_hash) throw new ApiError(400, 'tx', 'İşlem hash (tx) zorunlu');
  const upd = (await q(sb.from('withdrawals').update({ status: flow[1], tx_hash: tx_hash || w.tx_hash, admin_note: note || w.admin_note, updated_at: now })
    .eq('id', id).eq('status', w.status).select('*')))[0];
  if (!upd) throw new ApiError(409, 'race', 'Tekrar deneyin');
  if (action === 'reject') {
    await rpc('pending_add', { p_player: w.player_id, p_amount: -Number(w.amount_bc) });
    await rpc('wallet_apply', { p_player: w.player_id, p_real: Number(w.amount_bc), p_bonus: 0, p_type: 'withdraw_refund', p_ref: w.id, p_meta: { note }, p_wager_add: 0 });
    await notify(w.player_id, 'withdraw', 'Saque recusado', note || 'O valor voltou para o seu saldo.');
  }
  if (action === 'complete') {
    await rpc('pending_add', { p_player: w.player_id, p_amount: -Number(w.amount_bc) });
    await notify(w.player_id, 'withdraw', 'Saque concluído', `${w.amount_bc} BC confirmados na rede.`);
  }
  if (action === 'sent') await notify(w.player_id, 'withdraw', 'Saque enviado', 'Seu saque saiu. Acompanhe pelo hash na carteira.');
  return upd;
}
