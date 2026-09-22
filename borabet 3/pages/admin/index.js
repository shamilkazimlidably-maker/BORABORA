import { useEffect, useState } from 'react';
import Head from 'next/head';
import { aapi, AdminProvider } from '../../components/admin/kit';
import { Dashboard, Bots, Rooms, Tiers } from '../../components/admin/SectionsA';
import { Missions, Players, Finance, ChatAdmin, Settings, Reports } from '../../components/admin/SectionsB';

const NAV = [
  ['dashboard', '📊', 'Genel Bakış'],
  ['bots', '🤖', 'Botlar'],
  ['rooms', '🀄', 'Odalar & Maçlar'],
  ['tiers', '🏷️', 'Salonlar'],
  ['missions', '🎯', 'Görevler'],
  ['players', '👥', 'Oyuncular'],
  ['finance', '💰', 'Finans'],
  ['chat', '💬', 'Sohbet & Yağmur'],
  ['settings', '⚙️', 'Ayarlar'],
  ['reports', '📈', 'Raporlar'],
];

function Login({ onOk }) {
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  async function go(e) {
    e.preventDefault();
    setBusy(true); setErr('');
    try { await aapi('login', { method: 'POST', body: { password: pw } }); onOk(); }
    catch (x) { setErr(x.message); setBusy(false); }
  }
  return (
    <div className="adm-login">
      <form onSubmit={go} className="adm-card adm-col" style={{ width: 360, padding: 28 }}>
        <div className="adm-brand" style={{ padding: 0 }}>BoraBet<small>YÖNETİM PANELİ</small></div>
        <label className="adm-field"><span>Yönetici şifresi</span>
          <input className="adm-in" type="password" autoFocus value={pw} onChange={(e) => setPw(e.target.value)} /></label>
        {err && <div style={{ color: '#FF8A90', fontSize: 13 }}>{err}</div>}
        <button className="adm-btn y" style={{ height: 42 }} disabled={busy || !pw}>Giriş yap</button>
        <small style={{ color: '#6E7691', fontSize: 12 }}>Şifre, Vercel'deki <b>ADMIN_PASSWORD</b> ortam değişkenidir. Oturum 12 saat açık kalır.</small>
      </form>
    </div>
  );
}

export default function AdminPage() {
  const [auth, setAuth] = useState(null); // null = checking
  const [page, setPage] = useState('dashboard');
  const [badges, setBadges] = useState({});

  useEffect(() => {
    const h = typeof window !== 'undefined' ? window.location.hash.slice(1) : '';
    if (NAV.some((n) => n[0] === h)) setPage(h);
    aapi('dashboard').then((d) => { setAuth(true); setBadges({ finance: d.pendingDeposits + d.pendingWithdrawals }); }).catch(() => setAuth(false));
  }, []);
  useEffect(() => {
    if (!auth) return undefined;
    const id = setInterval(() => aapi('dashboard').then((d) => setBadges({ finance: d.pendingDeposits + d.pendingWithdrawals })).catch((e) => e.status === 401 && setAuth(false)), 30000);
    return () => clearInterval(id);
  }, [auth]);
  const go = (p) => { setPage(p); if (typeof window !== 'undefined') window.location.hash = p; window.scrollTo(0, 0); };

  const head = <Head><title>BoraBet · Yönetim Paneli</title><meta name="robots" content="noindex" /></Head>;
  if (auth === null) return <div className="adm">{head}<div className="adm-main"><p className="adm-sub">Yükleniyor…</p></div></div>;
  if (!auth) return <div className="adm">{head}<Login onOk={() => setAuth(true)} /></div>;

  const Page = { dashboard: Dashboard, bots: Bots, rooms: Rooms, tiers: Tiers, missions: Missions, players: Players, finance: Finance, chat: ChatAdmin, settings: Settings, reports: Reports }[page] || Dashboard;
  return (
    <AdminProvider onAuthLost={() => setAuth(false)}>
      {head}
      <div className="adm">
        <aside className="adm-side">
          <div className="adm-brand">BoraBet<small>YÖNETİM PANELİ</small></div>
          <nav className="adm-nav">
            {NAV.map(([k, ic, l]) => (
              <button key={k} className={page === k ? 'on' : ''} onClick={() => go(k)}>
                <span>{ic}</span>{l}{badges[k] ? <span className="cnt">{badges[k]}</span> : null}
              </button>
            ))}
            <button onClick={async () => { await aapi('logout', { method: 'POST' }).catch(() => {}); setAuth(false); }} style={{ marginTop: 12, color: '#FF8A90' }}><span>🚪</span>Çıkış</button>
          </nav>
        </aside>
        <main className="adm-main"><Page go={go} /></main>
      </div>
    </AdminProvider>
  );
}
