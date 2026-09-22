import { handler, db, q, rpc, ApiError, signal } from '../../lib/server/db';
import { authPlayer } from '../../lib/server/auth';
import { getSettings } from '../../lib/server/settings';
import { trackMetrics } from '../../lib/server/missions';
import { creditReward } from '../../lib/server/wallet';

async function activeRain() {
  const now = new Date().toISOString();
  return (await q(db().from('coin_rains').select('*').lte('starts_at', now).gte('ends_at', now).gt('remaining', 0).order('id', { ascending: false }).limit(1)))[0] || null;
}

export default handler(['GET', 'POST'], async (req) => {
  const p = await authPlayer(req);
  const s = await getSettings();
  const sb = db();
  if (req.method === 'GET') {
    const after = Number(req.query.after || 0);
    let mq = sb.from('chat_messages').select('id,name,role,text,created_at,player_id').eq('deleted', false);
    mq = after ? mq.gt('id', after).order('id', { ascending: true }).limit(50) : mq.order('id', { ascending: false }).limit(50);
    const rows = await q(mq);
    const msgs = (after ? rows : rows.reverse()).map((m) => ({ ...m, me: m.player_id === p.id, player_id: undefined }));
    const rain = await activeRain();
    let claimed = false;
    if (rain) claimed = !!(await q(sb.from('rain_claims').select('rain_id').eq('rain_id', rain.id).eq('player_id', p.id).limit(1)))[0];
    const deleted = after ? await q(sb.from('chat_messages').select('id').eq('deleted', true).gt('id', Math.max(0, after - 200))) : [];
    return { messages: msgs, deleted: deleted.map((d) => d.id), rain: rain && { id: rain.id, endsAt: rain.ends_at, claimed } };
  }
  const b = req.body || {};
  if (b.action === 'rain') {
    const rain = await activeRain();
    if (!rain) throw new ApiError(400, 'no_rain', 'A chuva acabou');
    const share = Math.min(Number(rain.max_per_user), Math.max(1, Math.round(Number(rain.max_per_user) * (0.35 + Math.random() * 0.65))));
    const ins = await sb.from('rain_claims').insert({ rain_id: rain.id, player_id: p.id, amount: share });
    if (ins.error) throw new ApiError(400, 'claimed', 'Você já pegou nesta chuva');
    const got = Number(await rpc('rain_take', { p_rain: rain.id, p_amount: share }));
    if (got <= 0) { await sb.from('rain_claims').delete().eq('rain_id', rain.id).eq('player_id', p.id); throw new ApiError(400, 'empty', 'A chuva acabou'); }
    await sb.from('rain_claims').update({ amount: got }).eq('rain_id', rain.id).eq('player_id', p.id);
    await creditReward(p.id, got, 'rain', String(rain.id), {}, s);
    return { amount: got };
  }
  if (p.chat_muted_until && new Date(p.chat_muted_until) > new Date()) throw new ApiError(403, 'muted', 'Você está silenciado no chat');
  const text = String(b.text || '').replace(/\s+/g, ' ').trim().slice(0, 200);
  if (!text) throw new ApiError(400, 'empty');
  const last = (await q(sb.from('chat_messages').select('created_at').eq('player_id', p.id).order('id', { ascending: false }).limit(1)))[0];
  if (last && Date.now() - new Date(last.created_at).getTime() < Number(s.chat_slow_mode_s) * 1000) {
    throw new ApiError(429, 'slow', `Modo lento: aguarde ${s.chat_slow_mode_s} s`);
  }
  const role = p.prefs?.hide_name ? null : p.level >= 12 ? 'VIP' : null;
  const name = p.prefs?.hide_name ? 'Anônimo' : p.display_name;
  const row = (await q(sb.from('chat_messages').insert({ player_id: p.id, name, role, text }).select('id,name,role,text,created_at')))[0];
  trackMetrics(p.id, { chat_messages: 1 }).catch(() => {});
  signal('chat');
  return { message: { ...row, me: true } };
});
