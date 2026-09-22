import { handler, db, q } from '../../lib/server/db';
import { authPlayer } from '../../lib/server/auth';
import { getSettings } from '../../lib/server/settings';
import { playerPublic } from '../../lib/server/me';
import { ensureMissions } from '../../lib/server/missions';

export default handler(['GET'], async (req) => {
  const p = await authPlayer(req);
  const s = await getSettings();
  const sb = db();
  await ensureMissions(p, s);
  const [recent, partnersRaw, ach] = await Promise.all([
    q(sb.from('match_players').select('match_id,result,net,score_us,score_them,tier_name,partner_id,finished_at').eq('player_id', p.id)
      .order('finished_at', { ascending: false }).limit(10)),
    q(sb.from('match_players').select('partner_id,result').eq('player_id', p.id).not('partner_id', 'is', null).limit(500)),
    q(sb.from('player_missions').select('title,icon,status,target,progress,chain_index,template_id').eq('player_id', p.id).eq('scope', 'achievement')),
  ]);
  const agg = {};
  for (const r of partnersRaw) {
    const a = (agg[r.partner_id] = agg[r.partner_id] || { games: 0, wins: 0 });
    a.games++; if (r.result === 'win') a.wins++;
  }
  const topIds = Object.entries(agg).sort((a, b) => b[1].games - a[1].games).slice(0, 3).map(([id]) => id);
  const ids = [...new Set([...topIds, ...recent.map((r) => r.partner_id).filter(Boolean)])];
  const people = ids.length ? await q(sb.from('players').select('id,display_name,avatar_color,is_bot,last_seen').in('id', ids)) : [];
  const byId = Object.fromEntries(people.map((x) => [x.id, x]));
  return {
    me: playerPublic(p, s),
    recent: recent.map((r) => ({ ...r, net: Number(r.net), partner: byId[r.partner_id]?.display_name || null, partnerBot: byId[r.partner_id]?.is_bot })),
    partners: topIds.map((id) => ({ name: byId[id]?.display_name, color: byId[id]?.avatar_color, bot: byId[id]?.is_bot, ...agg[id], rate: Math.round((agg[id].wins / agg[id].games) * 100) })),
    achievements: ach.map((a) => ({ title: a.title, icon: a.icon, status: a.status, target: Number(a.target), progress: Number(a.progress), level: a.chain_index })),
  };
});
