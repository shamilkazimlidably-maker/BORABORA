import { handler, db, q } from '../../lib/server/db';
import { authPlayer } from '../../lib/server/auth';
import { getSettings } from '../../lib/server/settings';
import { weekInfo } from '../../lib/server/time';

export default handler(['GET'], async (req) => {
  const p = await authPlayer(req);
  const s = await getSettings();
  const period = req.query.period || 'week';
  const since = period === 'month' ? new Date(Date.now() - 30 * 86400000)
    : period === 'all' ? new Date('2020-01-01') : weekInfo(s.timezone).start;
  const rows = await q(db().rpc('leaderboard', { p_since: since.toISOString(), p_bots: !!s.bots_in_ranking, p_limit: 50 }));
  const list = rows.map((r, i) => ({ rank: i + 1, id: r.player_id, name: r.display_name, color: r.avatar_color, bot: r.is_bot, level: r.level, wins: Number(r.wins), played: Number(r.played), me: r.player_id === p.id }));
  let mine = list.find((x) => x.me) || null;
  if (!mine) {
    const my = await q(db().from('match_players').select('result').eq('player_id', p.id).gte('finished_at', since.toISOString()).in('result', ['win', 'loss', 'forfeit']));
    mine = { rank: null, name: p.display_name, color: p.avatar_color, wins: my.filter((x) => x.result === 'win').length, played: my.length, me: true };
  }
  return { period, list, mine };
});
