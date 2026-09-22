import { db, q, ApiError, rid } from './db';
import { verifyInitData } from './telegram';

const COLORS = [
  'linear-gradient(140deg,#3B7BFF,#8B4DFF)', 'linear-gradient(140deg,#F2B705,#F0424B)',
  'linear-gradient(140deg,#3DDB5F,#0E7A4B)', 'linear-gradient(140deg,#8B4DFF,#3B7BFF)',
  'linear-gradient(140deg,#FF7A59,#F2B705)', 'linear-gradient(140deg,#12925B,#3B7BFF)',
  'linear-gradient(140deg,#FF6FB5,#8B4DFF)',
];

function identify(req) {
  const init = req.headers['x-tg-init'];
  if (init) {
    const v = verifyInitData(init, process.env.TELEGRAM_BOT_TOKEN);
    if (v) return v;
    if (process.env.DEV_AUTH !== '1') throw new ApiError(401, 'bad_init_data', 'Sessão inválida. Abra pelo Telegram.');
  }
  const dev = req.headers['x-dev-user'];
  if (process.env.DEV_AUTH === '1' && dev) {
    const id = Number(String(dev).replace(/\D/g, '')) || 1;
    return { user: { id, first_name: `Dev ${id}`, username: `dev${id}` }, startParam: req.headers['x-dev-start'] || null };
  }
  throw new ApiError(401, 'unauthorized', 'Abra o BoraBet pelo Telegram.');
}

export async function authPlayer(req) {
  const { user, startParam } = identify(req);
  const sb = db();
  let p = (await q(sb.from('players').select('*').eq('telegram_id', user.id).limit(1)))[0];
  if (!p) {
    let referred_by = null;
    if (startParam && startParam.startsWith('ref_')) {
      const ref = (await q(sb.from('players').select('id').eq('referral_code', startParam.slice(4)).limit(1)))[0];
      referred_by = ref?.id || null;
    }
    const name = [user.first_name, user.last_name].filter(Boolean).join(' ').slice(0, 24) || user.username || 'Jogador';
    const ins = await sb.from('players').insert({
      telegram_id: user.id,
      username: user.username || null,
      first_name: user.first_name || null,
      display_name: name,
      photo_url: user.photo_url || null,
      avatar_color: COLORS[Math.abs(user.id) % COLORS.length],
      referral_code: rid(7),
      referred_by,
    }).select('*').single();
    if (ins.error) {
      // corrida: outro request criou primeiro
      p = (await q(sb.from('players').select('*').eq('telegram_id', user.id).limit(1)))[0];
      if (!p) throw new ApiError(500, 'db', ins.error.message);
    } else p = ins.data;
  } else if (!p.last_seen || Date.now() - new Date(p.last_seen).getTime() > 30000) {
    sb.from('players').update({ last_seen: new Date().toISOString(), username: user.username || p.username })
      .eq('id', p.id).then(() => {});
  }
  // limites: aumentos agendados (24 h) entram em vigor
  const pend = p.limits?.pending;
  if (pend && Object.values(pend).some((x) => new Date(x.at) <= new Date())) {
    const limits = { ...p.limits, pending: { ...pend } };
    for (const [k, x] of Object.entries(pend)) if (new Date(x.at) <= new Date()) { limits[k] = x.value; delete limits.pending[k]; }
    await sb.from('players').update({ limits }).eq('id', p.id);
    p.limits = limits;
  }
  if (p.banned) throw new ApiError(403, 'banned', 'Conta bloqueada. Fale com o suporte.');
  p._startParam = startParam;
  return p;
}
