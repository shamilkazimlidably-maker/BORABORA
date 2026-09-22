import { handler, db, q, ApiError } from '../../lib/server/db';
import { authPlayer } from '../../lib/server/auth';
import { getSettings } from '../../lib/server/settings';
import { dailyStatus, freshPlayer, playerPublic } from '../../lib/server/me';
import { creditReward } from '../../lib/server/wallet';
import { listMissions, claimMission, trackMetrics } from '../../lib/server/missions';
import { localDate } from '../../lib/server/time';

export default handler(['GET', 'POST'], async (req) => {
  const p = await authPlayer(req);
  const s = await getSettings();
  if (req.method === 'GET') {
    return { daily: dailyStatus(p, s), missions: await listMissions(p, s), me: playerPublic(p, s) };
  }
  const { action, id } = req.body || {};
  if (action === 'daily') {
    const st = dailyStatus(p, s);
    if (st.claimedToday) throw new ApiError(400, 'claimed', 'Você já resgatou hoje');
    const today = localDate(s.timezone);
    let upd = db().from('players').update({ daily_streak: st.nextDay, last_daily_claim: today }).eq('id', p.id);
    upd = p.last_daily_claim ? upd.eq('last_daily_claim', p.last_daily_claim) : upd.is('last_daily_claim', null);
    const done = await q(upd.select('id'));
    if (!done.length) throw new ApiError(409, 'race', 'Tente de novo');
    await creditReward(p.id, st.nextReward, 'daily', today, { day: st.nextDay }, s);
    await trackMetrics(p.id, { daily_claim: 1 });
    const fresh = await freshPlayer(p.id);
    return { amount: st.nextReward, day: st.nextDay, me: playerPublic(fresh, s) };
  }
  if (action === 'claim') {
    const r = await claimMission(p, id, s);
    const fresh = await freshPlayer(p.id);
    return { ...r, me: playerPublic(fresh, s), missions: await listMissions(fresh, s) };
  }
  throw new ApiError(400, 'bad_action');
});
