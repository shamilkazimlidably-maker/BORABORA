import { handler, db, q, ApiError } from '../../lib/server/db';
import { authPlayer } from '../../lib/server/auth';
import { getSettings } from '../../lib/server/settings';
import { freshPlayer, playerPublic } from '../../lib/server/me';
import { creditBonus } from '../../lib/server/wallet';
import { notify } from '../../lib/server/progression';

function validCPF(cpf) {
  const c = String(cpf).replace(/\D/g, '');
  if (c.length !== 11 || /^(\d)\1+$/.test(c)) return false;
  const calc = (len) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(c[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(9) === Number(c[9]) && calc(10) === Number(c[10]);
}
function age(dateStr) {
  const d = new Date(dateStr + 'T12:00:00Z');
  if (isNaN(d)) return 0;
  const n = new Date();
  let a = n.getUTCFullYear() - d.getUTCFullYear();
  const m = n.getUTCMonth() - d.getUTCMonth();
  if (m < 0 || (m === 0 && n.getUTCDate() < d.getUTCDate())) a--;
  return a;
}

export default handler(['POST'], async (req) => {
  const p = await authPlayer(req);
  const s = await getSettings();
  const sb = db();
  const b = req.body || {};
  const ob = { ...(p.onboarding || {}) };
  let patch = null;

  switch (b.action) {
    case 'terms':
      if (!b.age18 || !b.terms) throw new ApiError(400, 'terms', 'Confirme idade e termos');
      ob.terms_at = new Date().toISOString();
      patch = { onboarding: ob };
      break;
    case 'tutorial_done':
      ob.tutorial_done = true;
      patch = { onboarding: ob };
      break;
    case 'path':
      ob.path = b.value === 'partner' ? 'partner' : 'solo';
      patch = { onboarding: ob };
      break;
    case 'coach_done':
      ob.coach_done = true;
      patch = { onboarding: ob };
      break;
    case 'skip_estreia': {
      ob.estreia_done = true;
      const upd = await q(sb.from('players').update({ onboarding: ob, welcome_given: true }).eq('id', p.id).eq('welcome_given', false).select('id'));
      if (upd.length && Number(s.welcome_bonus) > 0) {
        await creditBonus(p.id, Number(s.welcome_bonus), 'welcome', 'skip', Number(s.wagering_multiplier));
        await notify(p.id, 'reward', 'Boas-vindas!', `${s.welcome_bonus} BC de bônus para jogar já estão no seu saldo.`);
      }
      patch = { onboarding: ob };
      break;
    }
    case 'name': {
      const name = String(b.name || '').replace(/[<>]/g, '').trim().slice(0, 20);
      if (name.length < 2) throw new ApiError(400, 'name', 'Nome muito curto');
      patch = { display_name: name };
      break;
    }
    case 'prefs':
      patch = { prefs: { ...(p.prefs || {}), ...(b.prefs || {}) } };
      break;
    case 'limits': {
      // Reduzir vale na hora; aumentar só depois de 24 h.
      const limits = { ...(p.limits || {}) };
      const pending = { ...(limits.pending || {}) };
      for (const key of ['deposit_daily', 'loss_daily']) {
        if (b[key] === undefined) continue;
        const v = Math.max(0, Math.round(Number(b[key]) || 0));
        const cur = Number(limits[key] || 0);
        if (cur === 0 || (v !== 0 && v < cur)) { limits[key] = v; delete pending[key]; }
        else if (v === cur) delete pending[key];
        else pending[key] = { value: v, at: new Date(Date.now() + 86400000).toISOString() };
      }
      limits.pending = pending;
      patch = { limits };
      break;
    }
    case 'pause': {
      const days = { '1': 1, '7': 7, '30': 30, '180': 180, '365': 365 }[String(b.days)];
      if (!days) throw new ApiError(400, 'days');
      patch = { paused_until: new Date(Date.now() + days * 86400000).toISOString() };
      break;
    }
    case 'kyc': {
      const name = String(b.name || '').trim();
      if (name.split(/\s+/).length < 2) throw new ApiError(400, 'name', 'Informe nome completo');
      if (age(b.birth) < 18) throw new ApiError(400, 'age', 'É preciso ter 18 anos ou mais');
      if (!validCPF(b.cpf)) throw new ApiError(400, 'cpf', 'CPF inválido');
      const cpf = String(b.cpf).replace(/\D/g, '');
      const dup = await q(sb.from('players').select('id').neq('id', p.id).eq('kyc->>cpf', cpf).limit(1));
      if (dup.length) throw new ApiError(400, 'cpf_used', 'CPF já usado em outra conta');
      patch = { kyc_level: Math.max(1, p.kyc_level), kyc: { ...(p.kyc || {}), name, birth: b.birth, cpf, level1_at: new Date().toISOString() } };
      break;
    }
    case 'read_notifications':
      await sb.from('notifications').update({ read: true }).eq('player_id', p.id).eq('read', false);
      return { ok: true };
    default:
      throw new ApiError(400, 'bad_action');
  }
  await q(sb.from('players').update(patch).eq('id', p.id).select('id'));
  return { me: playerPublic(await freshPlayer(p.id), s) };
});
