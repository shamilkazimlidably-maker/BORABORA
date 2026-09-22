// Telegram WebApp helpers (safe in browser without Telegram)
export const tg = () => (typeof window !== 'undefined' ? window.Telegram?.WebApp : null);
export function initTelegram() {
  const w = tg();
  if (!w) return;
  try {
    w.ready(); w.expand();
    w.setHeaderColor?.('#0D1222'); w.setBackgroundColor?.('#070A14');
    w.disableVerticalSwipes?.();
  } catch (e) { /* noop */ }
}
let hapticsOn = true;
export function setHaptics(v) { hapticsOn = v !== false; }
export function haptic(kind = 'light') {
  if (!hapticsOn) return;
  const h = tg()?.HapticFeedback;
  try {
    if (!h) { if (navigator.vibrate) navigator.vibrate(kind === 'heavy' ? 30 : 10); return; }
    if (kind === 'success' || kind === 'error' || kind === 'warning') h.notificationOccurred(kind);
    else if (kind === 'select') h.selectionChanged();
    else h.impactOccurred(kind);
  } catch (e) { /* noop */ }
}
let backHandler = null;
export function setBack(fn) {
  const w = tg();
  if (!w?.BackButton) return;
  if (backHandler) { try { w.BackButton.offClick(backHandler); } catch (e) { /* noop */ } }
  backHandler = fn;
  if (fn) { w.BackButton.onClick(fn); w.BackButton.show(); } else w.BackButton.hide();
}
export function shareLink(url, text) {
  const link = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text || '')}`;
  const w = tg();
  if (w?.openTelegramLink) w.openTelegramLink(link);
  else window.open(link, '_blank');
}
export function openLink(url) {
  const w = tg();
  if (url.startsWith('https://t.me/') && w?.openTelegramLink) w.openTelegramLink(url);
  else if (w?.openLink) w.openLink(url);
  else window.open(url, '_blank');
}
export function appLink(param) {
  const bot = process.env.NEXT_PUBLIC_BOT_USERNAME;
  const short = process.env.NEXT_PUBLIC_APP_SHORT_NAME;
  if (bot && short) return `https://t.me/${bot}/${short}?startapp=${param}`;
  if (bot) return `https://t.me/${bot}?start=${param}`;
  return `${typeof window !== 'undefined' ? window.location.origin : ''}/?startapp=${param}`;
}
export async function copyText(t) {
  try { await navigator.clipboard.writeText(t); return true; } catch (e) {
    const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch (x) { /* noop */ } ta.remove(); return true;
  }
}
