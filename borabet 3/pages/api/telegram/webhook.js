import { handler } from '../../../lib/server/db';
import { tgSend } from '../../../lib/server/telegram';

// Telegram bot: /start → botão "Jogar" abrindo o Mini App
export default handler(['POST'], async (req) => {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (secret && req.headers['x-telegram-bot-api-secret-token'] !== secret) return { ok: false };
  const msg = req.body?.message;
  if (!msg?.chat?.id) return { ok: true };
  const url = process.env.NEXT_PUBLIC_APP_URL;
  const param = (msg.text || '').split(' ')[1] || '';
  const appUrl = url ? url + (param ? `?tgWebAppStartParam=${encodeURIComponent(param)}` : '') : null;
  await tgSend(msg.chat.id,
    '<b>BoraBet · Dominó em dupla</b>\nA dupla campeã leva o pote. Bora?\n\n18+ · Jogue com responsabilidade.',
    appUrl ? { reply_markup: { inline_keyboard: [[{ text: '🁢 Jogar agora', web_app: { url: appUrl } }]] } } : {});
  return { ok: true };
});
