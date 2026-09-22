import { handler } from '../../../lib/server/db';
import { authPlayer } from '../../../lib/server/auth';
import { mutateMatch, playerAction, clientView } from '../../../lib/server/game';

export default handler(['GET', 'POST'], async (req) => {
  const p = await authPlayer(req);
  const id = req.query.id;
  const fn = req.method === 'POST' ? playerAction(p.id, req.body || {}) : null;
  const { m, tier, s } = await mutateMatch(id, fn, p.id);
  return clientView(m, tier, p.id, s);
});
