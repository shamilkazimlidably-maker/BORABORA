import { handler, db, q } from '../../lib/server/db';
import { authPlayer } from '../../lib/server/auth';
import { getSettings, publicSettings } from '../../lib/server/settings';
import { getTiers } from '../../lib/server/game';
import { activeMatchFor } from '../../lib/server/matchmaking';
import { playerPublic } from '../../lib/server/me';

export default handler(['GET'], async (req) => {
  const p = await authPlayer(req);
  const s = await getSettings();
  const [tiers, active, unread] = await Promise.all([
    getTiers(),
    activeMatchFor(p.id),
    db().from('notifications').select('id', { count: 'exact', head: true }).eq('player_id', p.id).eq('read', false),
  ]);
  return {
    me: playerPublic(p, s),
    settings: publicSettings(s),
    tiers: tiers.filter((t) => t.active).map((t) => ({
      id: t.id, name: t.name, mode: t.mode, stakes: (t.stakes || []).map(Number), target: t.target, tie_rule: t.tie_rule,
      saida66: t.saida66, turn_seconds: t.turn_seconds, is_free: t.is_free, vip_min_level: t.vip_min_level,
      subtitle: t.subtitle, bot_allowed: t.bot_allowed,
    })),
    activeMatch: active,
    unread: unread.count || 0,
    startParam: p._startParam || null,
    serverNow: Date.now(),
  };
});
