import { db, q, ApiError, signal, rid } from './db';
import { getTier, nSeats, humanSeat, seatOf, mutateMatch, pickBots, botSeat } from './game';
import { dayStart } from './time';

export async function activeMatchFor(pid) {
  const rows = await q(db().from('matches').select('id,status')
    .in('status', ['forming', 'ready', 'playing'])
    .filter('seats', 'cs', JSON.stringify([{ pid }]))
    .order('created_at', { ascending: false }).limit(1));
  return rows[0] ? { id: rows[0].id, status: rows[0].status } : null;
}

async function dailyLoss(pid, tz) {
  const since = dayStart(tz).toISOString();
  const rows = await q(db().from('ledger').select('type,amount_real,amount_bonus')
    .eq('player_id', pid).in('type', ['stake', 'win', 'refund']).gte('created_at', since));
  let net = 0;
  for (const r of rows) net += Number(r.amount_real) + Number(r.amount_bonus);
  return Math.max(0, -net);
}

export async function assertCanPlay(p, tier, stake, s) {
  if (s.maintenance) throw new ApiError(503, 'maintenance', 'Voltamos em instantes');
  if (!p.onboarding?.terms_at) throw new ApiError(403, 'terms', 'Aceite os termos para jogar');
  if (p.paused_until && new Date(p.paused_until) > new Date()) throw new ApiError(403, 'paused', 'Sua conta está em pausa');
  if (!tier || !tier.active) throw new ApiError(400, 'tier_unavailable', 'Mesa indisponível');
  if ((p.level || 1) < tier.vip_min_level) throw new ApiError(403, 'vip', `Mesa VIP a partir do nível ${tier.vip_min_level}`);
  if (tier.is_free) {
    if (p.onboarding?.estreia_done) throw new ApiError(400, 'estreia_done', 'Você já jogou sua mesa de estreia');
    return;
  }
  const stakes = (tier.stakes || []).map(Number);
  if (!stakes.includes(Number(stake))) throw new ApiError(400, 'bad_stake', 'Aposta inválida');
  const bal = Number(p.balance_real) + Number(p.balance_bonus);
  if (bal < Number(stake)) throw new ApiError(400, 'insufficient_balance', 'Saldo insuficiente', );
  const lossLimit = Number(p.limits?.loss_daily || 0);
  if (lossLimit > 0) {
    const lost = await dailyLoss(p.id, s.timezone);
    if (lost + Number(stake) > lossLimit) throw new ApiError(403, 'limit', 'Limite de perda diário atingido');
  }
}

function newSeats(mode) { return Array.from({ length: nSeats(mode) }, () => null); }

// Seat order preference for 2v2: fill so strangers land in opposite teams naturally
function pickSeat(seats) {
  const order = seats.length === 4 ? [0, 1, 2, 3] : [0, 1];
  return order.find((i) => !seats[i]);
}

export async function joinMatch(p, { tierId, stake, invite }, s) {
  const existing = await activeMatchFor(p.id);
  if (existing) return existing.id;
  const sb = db();

  if (invite) {
    const m0 = (await q(sb.from('matches').select('id,tier_id,stake').eq('invite_code', invite).limit(1)))[0];
    if (!m0) throw new ApiError(404, 'invite_not_found', 'Convite expirado');
    const tier = await getTier(m0.tier_id);
    await assertCanPlay(p, tier, m0.stake, s);
    let joined = false;
    await mutateMatch(m0.id, async (m) => {
      if (m.status !== 'forming') throw new ApiError(400, 'invite_closed', 'Essa mesa já começou');
      if (seatOf(m, p.id) >= 0) { joined = true; return {}; }
      let i = m.seats.findIndex((x) => x && x.reserved && x.code === invite);
      if (i < 0) i = pickSeat(m.seats);
      if (i == null || i < 0) throw new ApiError(400, 'full', 'Mesa cheia');
      m.seats[i] = humanSeat(p, s);
      joined = true;
      return { changed: true };
    }, p.id);
    if (joined) return m0.id;
  }

  const tier = await getTier(Number(tierId));
  const st = tier?.is_free ? 0 : Number(stake);
  await assertCanPlay(p, tier, st, s);

  const candidates = await q(sb.from('matches').select('id,seats,created_at')
    .eq('status', 'forming').eq('tier_id', tier.id).eq('stake', st).eq('is_private', false)
    .order('created_at', { ascending: true }).limit(20));
  const scored = candidates
    .map((c) => ({ id: c.id, filled: (c.seats || []).filter((x) => x && !x.reserved).length, free: (c.seats || []).filter((x) => !x).length }))
    .filter((c) => c.free > 0)
    .sort((a, b) => b.filled - a.filled);
  for (const c of scored) {
    try {
      let ok = false;
      await mutateMatch(c.id, async (m) => {
        if (m.status !== 'forming') return {};
        const i = pickSeat(m.seats);
        if (i == null) return {};
        m.seats[i] = humanSeat(p, s);
        ok = true;
        return { changed: true };
      }, p.id);
      if (ok) { signal('lobby'); return c.id; }
    } catch (e) { /* try next */ }
  }

  const seats = newSeats(tier.mode);
  seats[0] = humanSeat(p, s);
  const ins = await q(sb.from('matches').insert({
    tier_id: tier.id, mode: tier.mode, stake: st, pot: st * seats.length, is_free: !!tier.is_free,
    commission_pct: tier.is_free ? 0 : Number(s.commission_pct), seats, meta: {}, created_by: p.id,
  }).select('id'));
  signal('lobby');
  return ins[0].id;
}

// "Chamar parceiro": host na cadeira 0, cadeira 2 reservada por 2 min para o convidado
export async function createParty(p, { tierId, stake }, s) {
  const existing = await activeMatchFor(p.id);
  if (existing) throw new ApiError(400, 'already_in_match', 'Você já está numa mesa');
  const tier = await getTier(Number(tierId));
  const st = tier?.is_free ? 0 : Number(stake);
  await assertCanPlay(p, tier, st, s);
  const code = rid(8);
  const seats = newSeats(tier.mode);
  seats[0] = humanSeat(p, s);
  const partnerSeat = seats.length === 4 ? 2 : 1;
  seats[partnerSeat] = { reserved: true, code, until: Date.now() + 120000, color: 'linear-gradient(140deg,#1B2340,#141A2E)' };
  const ins = await q(db().from('matches').insert({
    tier_id: tier.id, mode: tier.mode, stake: st, pot: st * seats.length, is_free: !!tier.is_free,
    commission_pct: tier.is_free ? 0 : Number(s.commission_pct), seats, invite_code: code, meta: {}, created_by: p.id,
  }).select('id'));
  return { id: ins[0].id, code };
}

// Admin: open a room pre-seated with chosen bots so humans find a table waiting
export async function adminCreateRoom({ tierId, stake, botIds = [], botCount = 0 }, s) {
  const tier = await getTier(Number(tierId));
  if (!tier) throw new ApiError(400, 'tier', 'Salon bulunamadı');
  const st = tier.is_free ? 0 : Number(stake);
  const seats = newSeats(tier.mode);
  const fake = { seats };
  const want = Math.min(seats.length - 1, Math.max(botIds.length, Number(botCount) || 0));
  const bots = await pickBots(fake, want, botIds);
  bots.slice(0, want).forEach((b, k) => { seats[k] = botSeat(b); });
  const ins = await q(db().from('matches').insert({
    tier_id: tier.id, mode: tier.mode, stake: st, pot: st * seats.length, is_free: !!tier.is_free,
    commission_pct: tier.is_free ? 0 : Number(s.commission_pct), seats, meta: { adminRoom: true },
  }).select('id'));
  signal('lobby');
  return ins[0].id;
}

export async function adminAddBot(matchId, seatIndex, botId) {
  let added = null;
  await mutateMatch(matchId, async (m) => {
    if (m.status !== 'forming') throw new ApiError(400, 'not_forming', 'Oda artık bekleme durumunda değil');
    let i = seatIndex == null || seatIndex === '' ? m.seats.findIndex((x) => !x || x.reserved) : Number(seatIndex);
    if (i < 0 || i >= m.seats.length) throw new ApiError(400, 'full', 'Boş koltuk yok');
    if (m.seats[i] && !m.seats[i].reserved) throw new ApiError(400, 'taken', 'Koltuk dolu');
    const bots = await pickBots(m, 1, botId ? [botId] : []);
    const b = botId ? bots.find((x) => x.id === botId) || null : bots[0];
    if (!b) throw new ApiError(400, 'no_bot', 'Uygun (boşta) bot yok');
    m.seats[i] = botSeat(b);
    added = b.display_name;
    return { changed: true };
  });
  return added;
}
