import { handler, ApiError, db } from '../../../lib/server/db';
import { sweepStale } from '../../../lib/server/game';

export default handler(['GET', 'POST'], async (req) => {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.authorization || '';
  if (secret && auth !== `Bearer ${secret}` && req.query.key !== secret) throw new ApiError(401, 'unauthorized');
  const n = await sweepStale(50);
  // expire old deposit quotes
  await db().from('deposits').update({ status: 'expired' }).eq('status', 'awaiting').is('tx_hash', null)
    .lt('quote_expires_at', new Date(Date.now() - 3600000).toISOString());
  return { swept: n };
});
