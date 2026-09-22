import { createContext, useContext, useState, useCallback } from 'react';

export async function aapi(path, { method = 'GET', body } = {}) {
  const res = await fetch('/api/admin/' + path, {
    method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin',
  });
  let data = null;
  try { data = await res.json(); } catch (e) { data = null; }
  if (!res.ok) {
    const err = new Error(data?.message || 'Hata oluştu');
    err.status = res.status; err.code = data?.error;
    throw err;
  }
  return data;
}

const Ctx = createContext(null);
export function AdminProvider({ children, onAuthLost }) {
  const [toast, setToast] = useState(null);
  const say = useCallback((text, err) => {
    setToast({ text, err });
    setTimeout(() => setToast(null), 3200);
  }, []);
  const run = useCallback(async (fn, okText) => {
    try { const r = await fn(); if (okText) say(okText); return r; }
    catch (e) { if (e.status === 401) onAuthLost?.(); say(e.message, true); return null; }
  }, [say, onAuthLost]);
  return (
    <Ctx.Provider value={{ say, run }}>
      {children}
      {toast && <div className={`adm-toast ${toast.err ? 'err' : ''}`}>{toast.text}</div>}
    </Ctx.Provider>
  );
}
export const useAdmin = () => useContext(Ctx);

export function Field({ label, help, children, style }) {
  return <label className="adm-field" style={style}><span>{label}</span>{children}{help && <small>{help}</small>}</label>;
}
export function Num({ value, onChange, step = 1, min, max, style }) {
  return <input className="adm-in" type="number" step={step} min={min} max={max} value={value ?? ''} style={style}
    onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))} />;
}
export function Txt({ value, onChange, placeholder, style }) {
  return <input className="adm-in" value={value ?? ''} placeholder={placeholder} style={style} onChange={(e) => onChange(e.target.value)} />;
}
export function Bool({ value, onChange, label }) {
  return <label className="adm-row" style={{ cursor: 'pointer', gap: 8 }}><input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} style={{ width: 18, height: 18, accentColor: '#FFD93D' }} />{label}</label>;
}
export function Sel({ value, onChange, options, style }) {
  return <select className="adm-sel" value={value ?? ''} style={style} onChange={(e) => onChange(e.target.value)}>
    {options.map((o) => (Array.isArray(o) ? <option key={o[0]} value={o[0]}>{o[1]}</option> : <option key={o} value={o}>{o}</option>))}
  </select>;
}
export function Modal({ title, onClose, children, wide }) {
  return (
    <div className="adm-modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="adm-modal" style={wide ? { maxWidth: 1000 } : undefined}>
        <div className="adm-row" style={{ marginBottom: 12 }}><h2 style={{ margin: 0 }}>{title}</h2><div className="adm-sp" /><button className="adm-btn sm" onClick={onClose}>Kapat ✕</button></div>
        {children}
      </div>
    </div>
  );
}

export const n0 = (v) => Number(v || 0).toLocaleString('tr-TR', { maximumFractionDigits: 2 });
export const dt = (v) => (v ? new Date(v).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');
export const ago = (v) => {
  if (!v) return '—';
  const s = Math.floor((Date.now() - new Date(v).getTime()) / 1000);
  if (s < 60) return s + ' sn önce'; if (s < 3600) return Math.floor(s / 60) + ' dk önce';
  if (s < 86400) return Math.floor(s / 3600) + ' sa önce'; return Math.floor(s / 86400) + ' gün önce';
};

export const SKILL = { 1: '1 · Acemi (çok hata yapar)', 2: '2 · Amatör', 3: '3 · Orta seviye', 4: '4 · İyi oyuncu', 5: '5 · Usta (neredeyse hatasız)' };
export const STATUS_TR = {
  forming: ['Oyuncu bekleniyor', 'y'], ready: ['Hazırlık', 'b'], playing: ['Oynanıyor', 'g'], finished: ['Bitti', ''], annulled: ['İptal (iade)', 'r'], cancelled: ['Kapatıldı', ''],
  awaiting: ['Ödeme bekleniyor', 'y'], detected: ['Ağda görüldü', 'b'], credited: ['Onaylandı', 'g'], expired: ['Süresi doldu', ''], rejected: ['Reddedildi', 'r'],
  requested: ['Talep edildi', 'y'], review: ['İnceleniyor', 'b'], sent: ['Gönderildi', 'p'], completed: ['Tamamlandı', 'g'], cancelled_w: ['İptal', ''],
  active: ['Aktif', 'y'], claimed: ['Alındı', 'g'],
};
export function Status({ s }) { const [t, c] = STATUS_TR[s] || [s, '']; return <span className={`adm-tag ${c}`}>{t}</span>; }

export const METRICS = [
  ['matches_played', 'Oynanan maç'], ['matches_won', 'Kazanılan maç'], ['tiles_played', 'Oynanan taş'], ['rounds_won', 'Kazanılan el (tur)'],
  ['batidas', 'Batida (son taşı atıp eli bitirme)'], ['carrocas', 'Carroça (çift taş) ile bitirme'], ['laelos', 'Lá e lô (iki uca uyan taşla bitirme)'],
  ['fechamentos', 'Kapanan oyunu kazanma (fechamento)'], ['opp_passes', 'Rakibe pas verdirme'], ['points_scored', 'Toplanan puan'],
  ['bc_won', 'Kazanılan BC (net)'], ['win_streak', 'Galibiyet serisi (en yüksek)'], ['daily_claim', 'Günlük ödül alma'],
  ['chat_messages', 'Sohbete mesaj yazma'], ['deposits_bc', 'Yatırılan BC'],
];
export const SCOPES = [['daily', 'Günlük'], ['weekly', 'Haftalık'], ['level', 'Seviye zinciri (sonsuz)'], ['achievement', 'Başarım (ömür boyu)']];
export const ICONS = ['star', 'trophy', 'fire', 'domino', 'crown', 'gem', 'coin', 'shield', 'gift', 'chat', 'users', 'wallet'];
export const LEDGER_TR = {
  commission: 'Komisyon (kasa geliri)', bot_stake: 'Bot bahsi (kasa ödedi)', bot_win: 'Bot kazancı (kasaya döndü)', bonus: 'Bonus / ödül dağıtımı', admin_adjust: 'Admin bakiye düzeltmesi',
};
export const PLAYER_LEDGER_TR = {
  stake: 'Bahis', win: 'Kazanç', refund: 'İade', deposit: 'Yatırım', deposit_bonus: 'Yatırım bonusu', withdraw: 'Çekim', withdraw_refund: 'Çekim iadesi',
  welcome: 'Hoş geldin bonusu', daily: 'Günlük ödül', mission: 'Görev ödülü', level_up: 'Seviye bonusu', referral: 'Davet bonusu', rain: 'Para yağmuru',
  bonus_release: 'Bonus serbest kaldı', admin: 'Admin düzeltmesi',
};
