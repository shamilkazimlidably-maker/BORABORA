import { handler, db, q } from '../../lib/server/db';
import { authPlayer } from '../../lib/server/auth';
import { getSettings } from '../../lib/server/settings';
import { sweepStale } from '../../lib/server/game';
import { listMissions } from '../../lib/server/missions';
import { dayStart, weekInfo } from '../../lib/server/time';

let lastSweep = 0;
export default handler(['GET'], async (req) => {
  const p = await authPlayer(req);
  const s = await getSettings();
  const sb = db();
  if (Date.now() - lastSweep > 20000) { lastSweep = Date.now(); sweepStale(4).catch(() => {}); }
  const since = dayStart(s.timezone).toISOString();
  const [live, wins, todayCount, chat, board, missions] = await Promise.all([
    q(sb.from('matches').select('status,seats').in('status', ['forming', 'ready', 'playing'])),
    q(sb.from('match_players').select('player_id,net,tier_name,finished_at,is_bot').eq('result', 'win').gt('net', 0)
      .order('finished_at', { ascending: false }).limit(12)),
    sb.from('matches').select('id', { count: 'exact', head: true }).in('status', ['finished']).gte('finished_at', since),
    q(sb.from('chat_messages').select('id,name,role,text,created_at').eq('deleted', false).order('created_at', { ascending: false }).limit(2)),
    q(sb.rpc('leaderboard', { p_since: weekInfo(s.timezone).start.toISOString(), p_bots: !!s.bots_in_ranking, p_limit: 3 })),
    listMissions(p, s),
  ]);
  let playing = 0;
  let open = 0;
  for (const m of live) {
    const seated = (m.seats || []).filter((x) => x && !x.reserved);
    playing += seated.length;
    if (m.status === 'forming') open += 1;
  }
  const bigPot = await q(sb.from('matches').select('pot').eq('status', 'finished').gte('finished_at', since).order('pot', { ascending: false }).limit(1));
  const tickerRows = wins.filter((w) => s.bots_in_ticker || !w.is_bot).slice(0, 8);
  const names = tickerRows.length
    ? await q(sb.from('players').select('id,display_name,avatar_color,is_bot').in('id', [...new Set(tickerRows.map((w) => w.player_id))]))
    : [];
  const byId = Object.fromEntries(names.map((n) => [n.id, n]));
  return {
    playingNow: playing,
    openTables: open,
    matchesToday: todayCount.count || 0,
    biggestPotToday: Number(bigPot[0]?.pot || 0),
    ticker: tickerRows.map((w) => ({
      name: byId[w.player_id]?.display_name, color: byId[w.player_id]?.avatar_color, bot: byId[w.player_id]?.is_bot,
      amount: Number(w.net) + 0, tier: w.tier_name, at: w.finished_at,
    })),
    chat: chat.reverse(),
    leaderboard: board.map((r) => ({ name: r.display_name, color: r.avatar_color, bot: r.is_bot, wins: Number(r.wins), level: r.level })),
    missions: missions.filter((m) => m.scope === 'daily'),
  };
});
