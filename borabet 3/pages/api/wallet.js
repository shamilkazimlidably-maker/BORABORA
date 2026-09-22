import { handler, db, q, rpc, ApiError } from '../../lib/server/db';
import { authPlayer } from '../../lib/server/auth';
import { getSettings } from '../../lib/server/settings';
import { freshPlayer, playerPublic } from '../../lib/server/me';
import { dayStart } from '../../lib/server/time';

const ASSETS = { usdt_trc20: { asset: 'USDT', network: 'TRON (TRC-20)' }, ton: { asset: 'TON', network: 'TON' } };
const TYPE_FILTERS = {
  partidas: ['stake', 'win', 'refund'], depositos: ['deposit'], saques: ['withdraw', 'withdraw_refund'],
  bonus: ['welcome', 'deposit_bonus', 'daily', 'mission', 'level_up', 'referral', 'rain', 'bonus_release', 'admin'],
};

export default handler(['GET', 'POST'], async (req) => {
  const p = await authPlayer(req);
  const s = await getSettings();
  const sb = db();
  if (req.method === 'GET') {
    let lq = sb.from('ledger').select('id,type,amount_real,amount_bonus,ref,meta,created_at').eq('player_id', p.id)
      .order('created_at', { ascending: false }).limit(60);
    const f = TYPE_FILTERS[req.query.filter];
    if (f) lq = lq.in('type', f);
    const [ledger, deposits, withdrawals, addresses] = await Promise.all([
      q(lq),
      q(sb.from('deposits').select('*').eq('player_id', p.id).order('created_at', { ascending: false }).limit(10)),
      q(sb.from('withdrawals').select('*').eq('player_id', p.id).order('created_at', { ascending: false }).limit(10)),
      q(sb.from('wallet_addresses').select('*').eq('player_id', p.id).order('created_at', { ascending: false })),
    ]);
    return { me: playerPublic(p, s), ledger, deposits, withdrawals, addresses, assets: ASSETS };
  }

  const b = req.body || {};
  if (b.action === 'deposit') {
    if (s.maintenance) throw new ApiError(503, 'maintenance', 'Manutenção');
    if (p.paused_until && new Date(p.paused_until) > new Date()) throw new ApiError(403, 'paused', 'Conta em pausa');
    const key = b.asset;
    if (!ASSETS[key]) throw new ApiError(400, 'asset', 'Moeda inválida');
    const amount = Math.round(Number(b.amount));
    if (!(amount >= Number(s.min_deposit)) || amount > Number(s.max_deposit)) {
      throw new ApiError(400, 'amount', `Valor entre ${s.min_deposit} e ${s.max_deposit} BC`);
    }
    const address = (s.deposit_addresses || {})[key];
    if (!address) throw new ApiError(503, 'no_address', 'Depósito indisponível nessa rede agora');
    const lim = Number(p.limits?.deposit_daily || 0);
    if (lim > 0) {
      const today = await q(sb.from('deposits').select('amount_bc').eq('player_id', p.id).in('status', ['awaiting', 'detected', 'credited'])
        .gte('created_at', dayStart(s.timezone).toISOString()));
      const sum = today.reduce((a, r) => a + Number(r.amount_bc), 0);
      if (sum + amount > lim) throw new ApiError(403, 'limit', 'Limite de depósito diário atingido');
    }
    const bonus = Math.floor((amount * Number(s.deposit_bonus_pct)) / 100);
    const row = (await q(sb.from('deposits').insert({
      player_id: p.id, asset: ASSETS[key].asset, network: key, amount_bc: amount, bonus_bc: bonus, address,
      quote_expires_at: new Date(Date.now() + Number(s.quote_minutes) * 60000).toISOString(),
    }).select('*')))[0];
    return { deposit: row };
  }
  if (b.action === 'deposit_paid') {
    const row = (await q(sb.from('deposits').update({ tx_hash: String(b.tx_hash || '').slice(0, 120) || null, updated_at: new Date().toISOString() })
      .eq('id', b.id).eq('player_id', p.id).eq('status', 'awaiting').select('*')))[0];
    if (!row) throw new ApiError(404, 'not_found');
    return { deposit: row };
  }
  if (b.action === 'deposit_requote') {
    const row = (await q(sb.from('deposits').update({ status: 'awaiting', quote_expires_at: new Date(Date.now() + Number(s.quote_minutes) * 60000).toISOString() })
      .eq('id', b.id).eq('player_id', p.id).in('status', ['awaiting', 'expired']).select('*')))[0];
    if (!row) throw new ApiError(404, 'not_found');
    return { deposit: row };
  }
  if (b.action === 'address') {
    if (!ASSETS[b.asset]) throw new ApiError(400, 'asset');
    const addr = String(b.address || '').trim();
    if (addr.length < 20 || addr.length > 80) throw new ApiError(400, 'address', 'Endereço inválido');
    const available = new Date(Date.now() + Number(s.new_address_delay_h) * 3600000).toISOString();
    const row = (await q(sb.from('wallet_addresses').upsert({
      player_id: p.id, asset: b.asset, address: addr, label: String(b.label || '').slice(0, 30) || null, available_at: available,
    }, { onConflict: 'player_id,asset,address', ignoreDuplicates: true }).select('*')))[0];
    return { address: row };
  }
  if (b.action === 'withdraw') {
    if (p.kyc_level < 1) throw new ApiError(403, 'kyc', 'Verifique sua conta antes de sacar');
    const addr = (await q(sb.from('wallet_addresses').select('*').eq('id', b.address_id).eq('player_id', p.id).limit(1)))[0];
    if (!addr) throw new ApiError(400, 'address', 'Escolha um endereço');
    if (new Date(addr.available_at) > new Date()) throw new ApiError(400, 'address_locked', 'Endereço novo: liberação em 24 h');
    const amount = Math.round(Number(b.amount) * 100) / 100;
    if (!(amount >= Number(s.min_withdraw))) throw new ApiError(400, 'amount', `Saque mínimo ${s.min_withdraw} BC`);
    if (amount > Number(p.balance_real)) throw new ApiError(400, 'insufficient_balance', 'Saldo sacável insuficiente');
    if (amount > Number(s.kyc2_threshold) && p.kyc_level < 2) throw new ApiError(403, 'kyc2', 'Saques acima do limite exigem Nível 2');
    const fee = Number((s.withdraw_fee || {})[addr.asset] || 0);
    if (amount <= fee) throw new ApiError(400, 'amount', 'Valor menor que a taxa');
    await rpc('wallet_apply', { p_player: p.id, p_real: -amount, p_bonus: 0, p_type: 'withdraw', p_ref: null, p_meta: { asset: addr.asset }, p_wager_add: 0 });
    await rpc('pending_add', { p_player: p.id, p_amount: amount });
    const row = (await q(sb.from('withdrawals').insert({
      player_id: p.id, asset: ASSETS[addr.asset].asset, network: addr.asset, address: addr.address, amount_bc: amount, fee_bc: fee,
    }).select('*')))[0];
    return { withdrawal: row, me: playerPublic(await freshPlayer(p.id), s) };
  }
  if (b.action === 'withdraw_cancel') {
    const row = (await q(sb.from('withdrawals').update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', b.id).eq('player_id', p.id).in('status', ['requested', 'review']).select('*')))[0];
    if (!row) throw new ApiError(400, 'not_cancellable', 'Não dá mais para cancelar');
    await rpc('pending_add', { p_player: p.id, p_amount: -Number(row.amount_bc) });
    await rpc('wallet_apply', { p_player: p.id, p_real: Number(row.amount_bc), p_bonus: 0, p_type: 'withdraw_refund', p_ref: row.id, p_meta: {}, p_wager_add: 0 });
    return { withdrawal: row, me: playerPublic(await freshPlayer(p.id), s) };
  }
  throw new ApiError(400, 'bad_action');
});
