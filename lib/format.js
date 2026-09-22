// pt-BR formatting helpers (shared)
export const fmtBC = (v, dec) => {
  const n = Number(v || 0);
  const d = dec ?? (Math.round(n) === n ? 0 : 2);
  return n.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
};
export const fmtBC2 = (v) => fmtBC(v, 2);
export const fmtBRL = (bc) =>
  'R$ ' + (Number(bc || 0) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const signed = (v) => (Number(v) > 0 ? '+' : Number(v) < 0 ? '−' : '') + fmtBC(Math.abs(Number(v)));
export const round2 = (v) => Math.round(Number(v) * 100) / 100;
export function timeAgo(iso) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'agora';
  if (s < 3600) return `há ${Math.floor(s / 60)} min`;
  if (s < 86400) return `há ${Math.floor(s / 3600)} h`;
  if (s < 172800) return 'ontem';
  return new Date(iso).toLocaleDateString('pt-BR');
}
export const hhmm = (iso) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
export const mmss = (ms) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
