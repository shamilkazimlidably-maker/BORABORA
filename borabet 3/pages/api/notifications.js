import { handler, db, q } from '../../lib/server/db';
import { authPlayer } from '../../lib/server/auth';

export default handler(['GET'], async (req) => {
  const p = await authPlayer(req);
  const rows = await q(db().from('notifications').select('*').eq('player_id', p.id).order('created_at', { ascending: false }).limit(60));
  return { items: rows };
});
