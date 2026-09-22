import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { fmtBC } from '../lib/format';
import { haptic } from '../lib/client/tg';
import { sfx } from '../lib/client/sound';

// ------------------------------------------------------------------ icons (2px line set)
const P = {
  back: <path d="M15 5l-7 7 7 7" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  plus: <path d="M12 5v14M5 12h14" />,
  bell: <><path d="M18 8a6 6 0 1 0-12 0c0 6-2 7-2 7h16s-2-1-2-7" /><path d="M13.7 20a2 2 0 0 1-3.4 0" /></>,
  home: <><path d="M4 11l8-7 8 7" /><path d="M6 10v10h12V10" /></>,
  games: <><rect x="7" y="3" width="10" height="18" rx="3" /><path d="M7 12h10" /><circle cx="12" cy="7.5" r="1" fill="currentColor" /><circle cx="12" cy="16.5" r="1" fill="currentColor" /></>,
  gift: <><rect x="3" y="9" width="18" height="12" rx="2" /><path d="M12 9v12M3 13h18M12 9s-4-6-6-3 6 3 6 3zm0 0s4-6 6-3-6 3-6 3z" /></>,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  more: <><circle cx="12" cy="5" r="1.7" fill="currentColor" /><circle cx="12" cy="12" r="1.7" fill="currentColor" /><circle cx="12" cy="19" r="1.7" fill="currentColor" /></>,
  help: <><path d="M9.2 9a2.9 2.9 0 1 1 3.9 2.7c-.7.3-1.1 1-1.1 1.8v.5" /><circle cx="12" cy="17.6" r="1.1" fill="currentColor" stroke="none" /></>,
  share: <><circle cx="18" cy="5" r="2.5" /><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="19" r="2.5" /><path d="M8.3 10.8l7.4-4.4M8.3 13.2l7.4 4.4" /></>,
  copy: <><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></>,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  chevron: <path d="M9 5l7 7-7 7" />,
  lock: <><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /></>,
  users: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c1-3.5 3.6-5 6.5-5s5.5 1.5 6.5 5" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 15c2 .6 3.2 2.3 3.8 5" /></>,
  chat: <path d="M4 5h16v11H9l-5 4z" />,
  wallet: <><rect x="3" y="6" width="18" height="14" rx="3" /><path d="M16 13h2M3 10h18" /></>,
  trophy: <><path d="M8 4h8v5a4 4 0 0 1-8 0z" /><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 20h8" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>,
  shield: <path d="M12 3l8 3v6c0 4.5-3.4 8.2-8 9-4.6-.8-8-4.5-8-9V6z" />,
  arrowUp: <path d="M12 19V5M6 11l6-6 6 6" />,
  arrowDown: <path d="M12 5v14M6 13l6 6 6-6" />,
  bot: <><rect x="5" y="8" width="14" height="11" rx="3" /><path d="M12 8V4M9 13h.01M15 13h.01" /></>,
  send: <path d="M4 12l16-8-6 16-2.5-6.5z" />,
  logout: <><path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10" /></>,
  sound: <><path d="M4 9v6h4l5 4V5L8 9z" /><path d="M16 9a4 4 0 0 1 0 6" /></>,
  fire: <path d="M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-3 2-4 2-6 1.5 1 2 2 2 3 1-2 1-5 1-7z" />,
  star: <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.5 2.9 1-6.1L3.2 9.5l6.1-.9z" />,
  crown: <path d="M3 8l4 4 5-7 5 7 4-4-2 11H5z" />,
  gem: <path d="M6 3h12l3 6-9 12L3 9z M3 9h18" />,
  coin: <><circle cx="12" cy="12" r="8" /><path d="M12 8v8M9.5 10h3.5a1.5 1.5 0 0 1 0 3H11a1.5 1.5 0 0 0 0 3h3.5" /></>,
  domino: <><rect x="7" y="3" width="10" height="18" rx="3" /><path d="M7 12h10" /></>,
  phone: <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" />,
  eye: <><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>,
  refresh: <path d="M20 11a8 8 0 1 0-2 5.3M20 5v6h-6" />,
};
export function Icon({ name, size = 20, color = 'currentColor', stroke = 2.2, style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" style={style} aria-hidden="true">
      {P[name] || P.domino}
    </svg>
  );
}

// Glossy "3D" badge icon (gradient disc + line icon)
const GLOSS = {
  domino: ['#FBF8EE', '#D8CFB8', '#1A1A1A'], trophy: ['#FFE66D', '#D79A00', '#3A2A00'], coin: ['#FFF3B0', '#D79A00', '#3A2A00'],
  fire: ['#FF9A5C', '#F0424B', '#fff'], crown: ['#FFE9A8', '#D4A017', '#3A2A00'], gem: ['#C9A8FF', '#8B4DFF', '#fff'],
  shield: ['#8FB4FF', '#3B7BFF', '#fff'], star: ['#FFE66D', '#F2B705', '#3A2A00'], gift: ['#7CF29A', '#1E8F3B', '#fff'],
  chat: ['#8FB4FF', '#3B7BFF', '#fff'], users: ['#7CF29A', '#12925B', '#fff'], wallet: ['#FFE66D', '#B98900', '#3A2A00'],
  lock: ['#6E7691', '#3A4260', '#fff'], phone: ['#7CF29A', '#12925B', '#fff'], help: ['#8FB4FF', '#3B7BFF', '#fff'],
};
export function GlossIcon({ name = 'domino', size = 44 }) {
  const [a, b, c] = GLOSS[name] || GLOSS.domino;
  return (
    <span style={{ width: size, height: size, borderRadius: size * 0.32, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      background: `radial-gradient(80% 80% at 30% 22%, ${a} 0%, ${b} 75%)`, boxShadow: `inset 0 -3px 0 rgba(0,0,0,.25), inset 0 2px 0 rgba(255,255,255,.45), 0 6px 14px rgba(0,0,0,.35)` }}>
      <Icon name={name} size={size * 0.52} color={c} stroke={2.4} />
    </span>
  );
}

// ------------------------------------------------------------------ domino tile
const PIPS = { 0: [], 1: ['2/2'], 2: ['1/1', '3/3'], 3: ['1/1', '2/2', '3/3'], 4: ['1/1', '1/3', '3/1', '3/3'], 5: ['1/1', '1/3', '2/2', '3/1', '3/3'], 6: ['1/1', '1/3', '2/1', '2/3', '3/1', '3/3'] };
const PIPS_H = { ...PIPS, 2: ['1/3', '3/1'], 3: ['1/3', '2/2', '3/1'], 6: ['1/1', '1/2', '1/3', '3/1', '3/2', '3/3'] };
function Half({ v, size, pip, horizontal }) {
  const set = (horizontal ? PIPS_H : PIPS)[v] || [];
  return (
    <span className="half" style={{ width: size, height: size }}>
      {set.map((a) => <i key={a} className="pip" style={{ gridArea: a, width: pip, height: pip }} />)}
    </span>
  );
}
// u = short side in px. orientation 'v' (a top, b bottom) or 'h' (a left, b right)
export function Tile({ a, b, u = 44, orientation = 'v', className = '', style, onClick, label, ...rest }) {
  const h = orientation === 'h';
  const half = u * 0.72;
  const pip = Math.max(3, Math.round(u * 0.14));
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag className={`tile ${h ? 'h' : ''} ${className}`} onClick={onClick} aria-label={label || `Peça ${a}-${b}`}
      style={{ width: h ? u * 2 : u, height: h ? u : u * 2, borderRadius: Math.max(5, u * 0.2), ...style }} {...rest}>
      <Half v={a} size={half} pip={pip} horizontal={h} />
      {h ? <span className="div-v" style={{ height: u * 0.66 }} /> : <span className="div-h" style={{ width: u * 0.66 }} />}
      <Half v={b} size={half} pip={pip} horizontal={h} />
    </Tag>
  );
}
export function TileBack({ u = 30, orientation = 'v', style }) {
  const h = orientation === 'h';
  return (
    <div className="tile back" style={{ width: h ? u * 2 : u, height: h ? u : u * 2, borderRadius: Math.max(4, u * 0.2), fontSize: u * 0.5, ...style }}>B</div>
  );
}

// ------------------------------------------------------------------ basics
export function Btn({ kind = 'y', size, block, className = '', onClick, children, sound = true, ...rest }) {
  return (
    <button className={`btn btn-${kind} ${size ? 'btn-' + size : ''} ${block ? 'btn-block' : ''} ${className}`}
      onClick={(e) => { if (sound) sfx.tap(); haptic('light'); onClick?.(e); }} {...rest}>{children}</button>
  );
}
export function Coin({ size }) { return <span className={`coin ${size || ''}`} />; }
export function BC({ v, dec }) { return <>{fmtBC(v, dec)}</>; }

export function Avatar({ name = '?', color, photo, size = 40, online, bot, ring }) {
  const initials = String(name || '?').trim().slice(0, 1).toUpperCase();
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.42, background: photo ? `url(${photo}) center/cover` : color || '#3A4260',
      boxShadow: ring ? `0 0 0 2px ${ring}` : undefined }}>
      {!photo && (bot ? <Icon name="bot" size={size * 0.5} color="rgba(255,255,255,.9)" /> : initials)}
      {online && <i className="online" />}
    </span>
  );
}
export function BotTag() { return <span className="badge bot">BOT</span>; }

export function Bar({ value = 0, max = 1, green, small }) {
  const pct = Math.max(0, Math.min(100, (Number(value) / Math.max(1, Number(max))) * 100));
  return <div className={`bar ${green ? 'green' : ''} ${small ? 'sm' : ''}`}><i style={{ width: pct + '%' }} /></div>;
}

export function Ring({ size = 48, stroke = 3, pct = 1, color = '#FFD93D', children }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <span style={{ position: 'relative', width: size, height: size, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <svg width={size} height={size} className="ring" style={{ position: 'absolute', inset: 0 }}>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,.08)" strokeWidth={stroke} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - Math.max(0, Math.min(1, pct)))} style={{ transition: 'stroke-dashoffset .25s linear' }} />
      </svg>
      {children}
    </span>
  );
}

export function Toggle({ on, onChange, label }) {
  return <button className={`toggle ${on ? 'on' : ''}`} aria-label={label} aria-pressed={!!on} onClick={() => { haptic('select'); onChange?.(!on); }} />;
}

export function Sheet({ open, onClose, children, dismissable = true }) {
  if (!open) return null;
  return (
    <>
      <div className="backdrop" onClick={() => dismissable && onClose?.()} />
      <div className="sheet" role="dialog">
        {onClose && <button className="iconbtn sheet-close" style={{ width: 32, height: 32 }} aria-label="Fechar" onClick={onClose}><Icon name="close" size={16} /></button>}
        {children}
      </div>
    </>
  );
}

// ------------------------------------------------------------------ toasts
const ToastCtx = createContext(() => {});
export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const push = useCallback((text, kind = 'ok') => {
    const id = Math.random();
    setItems((x) => [...x.slice(-2), { id, text, kind }]);
    haptic(kind === 'error' ? 'error' : kind === 'ok' ? 'success' : 'light');
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), 3000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts">
        {items.map((t) => (
          <div key={t.id} className="toast">
            <span style={{ width: 22, height: 22, borderRadius: '50%', flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: t.kind === 'error' ? 'var(--red-500)' : 'var(--green-500)' }}>
              <Icon name={t.kind === 'error' ? 'close' : 'check'} size={13} color={t.kind === 'error' ? '#fff' : '#06220F'} stroke={3} />
            </span>
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

// ------------------------------------------------------------------ confetti
export function Confetti({ count = 60 }) {
  const [pieces] = useState(() => Array.from({ length: count }, (_, i) => ({
    left: Math.random() * 100, delay: Math.random() * 0.6, dur: 1.4 + Math.random() * 1.2,
    color: ['#FFD93D', '#3DDB5F', '#FFE66D', '#D4A017', '#8B4DFF', '#fff'][i % 6], rot: Math.random() * 360,
  })));
  return <>{pieces.map((p, i) => <i key={i} className="confetti" style={{ left: p.left + '%', background: p.color, animationDuration: p.dur + 's', animationDelay: p.delay + 's', transform: `rotate(${p.rot}deg)` }} />)}</>;
}

// ------------------------------------------------------------------ Onça (original mascot, SVG)
export function Onca({ pose = 'idle', size = 96, style }) {
  const eyes = {
    idle: <><ellipse cx="44" cy="58" rx="6" ry="7" fill="#1A1400" /><ellipse cx="76" cy="58" rx="6" ry="7" fill="#1A1400" /><circle cx="46" cy="55" r="2.2" fill="#fff" /><circle cx="78" cy="55" r="2.2" fill="#fff" /></>,
    surprised: <><circle cx="44" cy="57" r="9" fill="#fff" /><circle cx="76" cy="57" r="9" fill="#fff" /><circle cx="44" cy="58" r="5" fill="#1A1400" /><circle cx="76" cy="58" r="5" fill="#1A1400" /></>,
    sad: <><path d="M37 60q7-5 14 0" stroke="#1A1400" strokeWidth="3.4" fill="none" strokeLinecap="round" /><path d="M69 60q7-5 14 0" stroke="#1A1400" strokeWidth="3.4" fill="none" strokeLinecap="round" /></>,
    celebrate: <><path d="M37 60q7-9 14 0" stroke="#1A1400" strokeWidth="3.6" fill="none" strokeLinecap="round" /><path d="M69 60q7-9 14 0" stroke="#1A1400" strokeWidth="3.6" fill="none" strokeLinecap="round" /></>,
  };
  const eye = eyes[pose] || eyes.idle;
  const mouth = pose === 'celebrate' ? <path d="M50 80q10 12 20 0z" fill="#7A1E24" stroke="#1A1400" strokeWidth="2" />
    : pose === 'sad' ? <path d="M52 84q8-5 16 0" stroke="#1A1400" strokeWidth="2.6" fill="none" strokeLinecap="round" />
      : pose === 'surprised' ? <ellipse cx="60" cy="83" rx="5" ry="6" fill="#7A1E24" stroke="#1A1400" strokeWidth="2" />
        : <path d="M52 80q4 5 8 0q4 5 8 0" stroke="#1A1400" strokeWidth="2.6" fill="none" strokeLinecap="round" />;
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" style={style} aria-label={`Onça ${pose}`}>
      <defs>
        <radialGradient id={`of-${pose}`} cx="40%" cy="30%" r="75%"><stop offset="0" stopColor="#FFE9A0" /><stop offset=".55" stopColor="#F6C343" /><stop offset="1" stopColor="#C98A12" /></radialGradient>
      </defs>
      <ellipse cx="60" cy="112" rx="34" ry="5" fill="rgba(0,0,0,.35)" />
      {pose === 'celebrate' && <g fill="#FFD93D"><rect x="8" y="18" width="8" height="4" rx="2" transform="rotate(30 12 20)" /><rect x="100" y="12" width="8" height="4" rx="2" transform="rotate(-30 104 14)" /><rect x="104" y="44" width="7" height="3" rx="1.5" fill="#3DDB5F" /><rect x="6" y="48" width="7" height="3" rx="1.5" fill="#8B4DFF" /></g>}
      <path d="M22 40 L30 12 L48 30 Z" fill={`url(#of-${pose})`} stroke="#1A1400" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M98 40 L90 12 L72 30 Z" fill={`url(#of-${pose})`} stroke="#1A1400" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M30 22 L34 32 L40 28 Z" fill="#0D1222" /><path d="M90 22 L86 32 L80 28 Z" fill="#0D1222" />
      <ellipse cx="60" cy="64" rx="42" ry="40" fill={`url(#of-${pose})`} stroke="#1A1400" strokeWidth="2.5" />
      <g fill="none" stroke="#0D1222" strokeWidth="3" strokeLinecap="round">
        <path d="M30 40q-4 4-2 9" /><path d="M90 40q4 4 2 9" /><path d="M22 66q-2 5 1 9" /><path d="M98 66q2 5-1 9" /><path d="M54 30q6-4 12 0" /><path d="M38 90q-2 5 2 8" /><path d="M82 90q2 5-2 8" />
      </g>
      <g fill="#0D1222"><circle cx="34" cy="78" r="2.4" /><circle cx="86" cy="78" r="2.4" /><circle cx="60" cy="38" r="2.2" /></g>
      <ellipse cx="60" cy="80" rx="18" ry="13" fill="#FFF6DA" />
      {eye}
      <path d="M54 70h12l-6 6z" fill="#1A1400" />
      {mouth}
      {pose === 'vip' && <path d="M40 16l8 8 12-14 12 14 8-8-4 16H44z" fill="#FFD93D" stroke="#B98900" strokeWidth="2" strokeLinejoin="round" />}
      {pose === 'point' && <g><ellipse cx="100" cy="100" rx="11" ry="9" fill={`url(#of-${pose})`} stroke="#1A1400" strokeWidth="2.5" /><path d="M104 104l8 8" stroke="#1A1400" strokeWidth="3" strokeLinecap="round" /></g>}
    </svg>
  );
}

// ------------------------------------------------------------------ top bar & nav
export function TopBar({ me, onDeposit, onBell, unread, onAvatar, onBack, title }) {
  return (
    <div className="topbar">
      {onBack ? (
        <button className="iconbtn" aria-label="Voltar" onClick={() => { sfx.tap(); onBack(); }}><Icon name="back" color="#fff" /></button>
      ) : (
        <>
          <Logo small />
        </>
      )}
      {title && <div className="display" style={{ fontSize: 20 }}>{title}</div>}
      <div className="grow" />
      {me && (
        <div className="balance">
          <Coin />
          <span className="amt">{fmtBC(me.balances.total, 2)}</span>
          {onDeposit && <button className="dep-mini" onClick={() => { sfx.tap(); onDeposit(); }}><Icon name="plus" size={12} color="#1A1400" stroke={3.5} /> Depositar</button>}
        </div>
      )}
      {onBell && <button className="iconbtn" aria-label="Notificações" onClick={onBell} style={{ width: 36, height: 36 }}><Icon name="bell" size={18} />{unread > 0 && <span className="red-dot" />}</button>}
      {onAvatar && me && <button onClick={onAvatar} style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer' }} aria-label="Perfil"><Avatar name={me.name} color={me.color} photo={me.photo} size={32} /></button>}
    </div>
  );
}

export function Logo({ small }) {
  const s = small ? 32 : 104;
  return (
    <div className="row" style={{ gap: small ? 8 : 12 }}>
      <div style={{ width: s, height: s, borderRadius: s * 0.3, background: 'linear-gradient(160deg,#182142 0%,#0D1222 70%)', border: '1px solid rgba(212,160,23,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        boxShadow: small ? undefined : '0 18px 40px rgba(0,0,0,.6), 0 0 32px rgba(255,217,61,.25)' }}>
        <div style={{ transform: 'rotate(-12deg)' }}><Tile a={5} b={5} u={small ? 11 : 38} /></div>
      </div>
      {small && <div className="display" style={{ fontSize: 19 }}>BoraBet</div>}
    </div>
  );
}

export function BottomNav({ tab, go }) {
  const items = [['home', 'Início', 'home'], ['jogos', 'Jogos', 'games'], null, ['recompensas', 'Recompensas', 'gift'], ['menu', 'Menu', 'menu']];
  return (
    <nav className="bottomnav">
      {items.map((it, i) => it ? (
        <button key={it[0]} className={`nav-item ${tab === it[0] ? 'on' : ''}`} onClick={() => { sfx.tap(); haptic('select'); go(it[0]); }}>
          <Icon name={it[2]} size={22} />{it[1]}
        </button>
      ) : (
        <div key="plus" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <button className="nav-plus" aria-label="Depositar" onClick={() => { sfx.coin(); haptic('medium'); go('depositar'); }}><span className="coin lg" /></button>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', marginTop: 3 }}>Depositar</span>
        </div>
      ))}
    </nav>
  );
}

export function useInterval(fn, ms) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (ms == null) return undefined;
    const id = setInterval(() => ref.current(), ms);
    return () => clearInterval(id);
  }, [ms]);
}
export function useNow(ms = 250) {
  const [now, setNow] = useState(Date.now());
  useInterval(() => setNow(Date.now()), ms);
  return now;
}
