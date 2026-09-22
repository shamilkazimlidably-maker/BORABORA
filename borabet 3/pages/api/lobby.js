import { handler, db, q } from '../../lib/server/db';
import { authPlayer } from '../../lib/server/auth';

// Contagem ao vivo por salão (para os cards de Salas / Aposta)
export default handler(['GET'], async (req) => {
  await authPlayer(req);
  const rows = await q(db().from('matches').select('tier_id,stake,status,seats').in('status', ['forming', 'ready', 'playing']));
  const out = {};
  for (const m of rows) {
    const t = (out[m.tier_id] = out[m.tier_id] || { open: 0, playing: 0, seated: 0, best: 0, searching: 0, byStake: {} });
    const seated = (m.seats || []).filter((x) => x && !x.reserved).length;
    t.seated += seated;
    if (m.status === 'forming') { t.open += 1; t.best = Math.max(t.best, seated); t.searching += (m.seats || []).filter((x) => x && !x.bot && !x.reserved).length; }
    else t.playing += 1;
    const k = String(Number(m.stake));
    t.byStake[k] = (t.byStake[k] || 0) + (m.status === 'forming' ? 1 : 0);
  }
  return { tiers: out };
});
