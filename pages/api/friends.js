import { handler, db, q } from '../../lib/server/db';
import { authPlayer } from '../../lib/server/auth';
import { getSettings } from '../../lib/server/settings';

export default handler(['GET'], async (req) => {
  const p = await authPlayer(req);
  const s = await getSettings();
  const refs = await q(db().from('players').select('id,display_name,avatar_color,last_seen,referral_rewarded,level').eq('referred_by', p.id)
    .order('last_seen', { ascending: false }).limit(100));
  const now = Date.now();
  return {
    code: p.referral_code,
    bonus: Number(s.referral_bonus),
    stats: { invited: refs.length, active: refs.filter((r) => r.referral_rewarded).length, earned: refs.filter((r) => r.referral_rewarded).length * Number(s.referral_bonus) },
    friends: refs.map((r) => ({ name: r.display_name, color: r.avatar_color, level: r.level, online: now - new Date(r.last_seen).getTime() < 120000 })),
  };
});
