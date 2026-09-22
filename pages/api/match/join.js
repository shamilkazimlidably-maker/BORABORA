import { handler } from '../../../lib/server/db';
import { authPlayer } from '../../../lib/server/auth';
import { getSettings } from '../../../lib/server/settings';
import { joinMatch, createParty } from '../../../lib/server/matchmaking';

export default handler(['POST'], async (req) => {
  const p = await authPlayer(req);
  const s = await getSettings();
  const { tierId, stake, invite, party } = req.body || {};
  if (party) return await createParty(p, { tierId, stake }, s);
  const id = await joinMatch(p, { tierId, stake, invite }, s);
  return { id };
});
