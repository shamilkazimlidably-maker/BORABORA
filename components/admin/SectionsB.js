import { useEffect, useState } from 'react';
import { aapi, useAdmin, Field, Num, Txt, Bool, Sel, Modal, n0, dt, ago, Status, METRICS, SCOPES, ICONS, LEDGER_TR, PLAYER_LEDGER_TR } from './kit';

const metricTr = (m) => (METRICS.find((x) => x[0] === m) || [m, m])[1];
const scopeTr = (s) => (SCOPES.find((x) => x[0] === s) || [s, s])[1];

// ================================================================= GÖREVLER
const EMPTY_TPL = {
  code: '', scope: 'daily', metric: 'matches_played', agg: 'sum', title_pt: 'Jogue {n} partidas', title_tr: '{n} maç oyna', icon: 'domino',
  base_target: 3, target_per_level: 0.2, target_growth: 1, target_variance: 0.15, target_round: 1,
  reward_bc_base: 50, reward_bc_per_level: 5, reward_xp_base: 30, reward_xp_per_level: 2, reward_growth: 1,
  min_level: 1, max_level: 999, weight: 10, active: true,
};
export function Missions() {
  const { run } = useAdmin();
  const [tpls, setTpls] = useState(null);
  const [edit, setEdit] = useState(null);
  const [preview, setPreview] = useState(null);
  const [scope, setScope] = useState('all');
  const load = () => run(() => aapi('missions')).then((r) => r && setTpls(r.templates));
  useEffect(() => { load(); }, []); // eslint-disable-line
  useEffect(() => {
    if (!edit) { setPreview(null); return undefined; }
    const t = setTimeout(() => run(() => aapi('missions/preview', { method: 'POST', body: { template: edit } })).then((r) => r && setPreview(r.rows)), 300);
    return () => clearTimeout(t);
  }, [edit]); // eslint-disable-line
  async function save() {
    const body = { ...edit }; delete body.id; delete body.stats; delete body.created_at;
    const r = await run(() => (edit.id ? aapi('missions/' + edit.id, { method: 'PATCH', body }) : aapi('missions', { method: 'POST', body })), 'Görev şablonu kaydedildi');
    if (r) { setEdit(null); load(); }
  }
  async function toggle(t) { await run(() => aapi('missions/' + t.id, { method: 'PATCH', body: { active: !t.active } }), t.active ? 'Pasif yapıldı' : 'Aktif'); load(); }
  const list = (tpls || []).filter((t) => scope === 'all' || t.scope === scope);
  const E = (k) => (v) => setEdit({ ...edit, [k]: v });
  return (
    <>
      <h1 className="adm-h1">Görevler</h1>
      <p className="adm-sub">Görevler şablonlardan üretilir. Her şablonun <b>değişkenleri</b> vardır; oyuncunun seviyesine ve zincir adımına göre hedef ve ödül otomatik hesaplanır. Seviye zinciri görevleri <b>sonsuzdur</b>: oyuncu ödülü aldıkça bir sonraki, daha zor ve daha ödüllü adım doğar.</p>
      <div className="adm-help">
        <b>Formül:</b> hedef = (taban + seviye_başı × (seviye − 1)) × büyüme<sup>zincir</sup> × (1 ± varyans), yuvarlama adımına yuvarlanır.<br />
        ödül = (taban_BC + seviye_başı_BC × (seviye − 1)) × ödül_büyümesi<sup>zincir</sup> × zorluk_oranı (hedef rastgele yüksek çıktıysa ödül de orantılı artar).<br />
        <b>Günlük</b> görevler her gün (Brezilya saatiyle gece yarısı), <b>haftalık</b> görevler her pazartesi yenilenir; sayılarını Ayarlar'dan belirlersiniz. Seçim ağırlığa (weight) göre rastgele yapılır. Başlıkta <code>{'{n}'}</code> hedef sayıyla değiştirilir.
      </div>
      <div className="adm-row" style={{ marginBottom: 12 }}>
        <div className="adm-tabs" style={{ margin: 0 }}>{[['all', 'Tümü'], ...SCOPES].map(([k, l]) => <button key={k} className={scope === k ? 'on' : ''} onClick={() => setScope(k)}>{l}</button>)}</div>
        <div className="adm-sp" /><button className="adm-btn y" onClick={() => setEdit({ ...EMPTY_TPL })}>+ Yeni görev şablonu</button>
      </div>
      <div className="adm-card adm-wrap" style={{ padding: 0 }}>
        <table className="adm-table">
          <thead><tr><th>Başlık (TR / PT)</th><th>Kapsam</th><th>Ölçüt</th><th>Hedef formülü</th><th>Ödül (Sv.1)</th><th>Seviye</th><th>Ağırlık</th><th>7 gün (verilen/tamamlanan)</th><th>Durum</th><th /></tr></thead>
          <tbody>{list.map((t) => (
            <tr key={t.id} style={{ opacity: t.active ? 1 : 0.5 }}>
              <td><b>{t.title_tr || '—'}</b><div className="adm-mono">{t.title_pt}</div></td>
              <td>{scopeTr(t.scope)}</td><td>{metricTr(t.metric)}{t.agg === 'max' ? ' (maks.)' : ''}</td>
              <td className="adm-mono">{t.base_target} + {t.target_per_level}·Sv{Number(t.target_growth) !== 1 ? ` · ×${t.target_growth}ᶻ` : ''} ±{Math.round(t.target_variance * 100)}%</td>
              <td>{n0(t.reward_bc_base)} BC · {t.reward_xp_base} XP</td>
              <td>{t.min_level}–{t.max_level >= 999 ? '∞' : t.max_level}</td><td>{t.weight}</td>
              <td>{t.stats.given} / {t.stats.done}</td>
              <td>{t.active ? <span className="adm-tag g">Aktif</span> : <span className="adm-tag">Pasif</span>}</td>
              <td><div className="adm-row" style={{ gap: 6, flexWrap: 'nowrap' }}><button className="adm-btn sm" onClick={() => setEdit({ ...t })}>Düzenle</button><button className="adm-btn sm" onClick={() => toggle(t)}>{t.active ? 'Pasif' : 'Aktif'}</button></div></td>
            </tr>
          ))}</tbody>
        </table>
      </div>

      {edit && (
        <Modal wide title={edit.id ? 'Görev şablonunu düzenle' : 'Yeni görev şablonu'} onClose={() => setEdit(null)}>
          <div className="adm-row" style={{ alignItems: 'flex-start' }}>
            <Field label="Kod (benzersiz)"><Txt value={edit.code} onChange={E('code')} /></Field>
            <Field label="Kapsam"><Sel value={edit.scope} onChange={E('scope')} options={SCOPES} /></Field>
            <Field label="Ölçüt (ne sayılır?)" style={{ minWidth: 260 }}><Sel value={edit.metric} onChange={E('metric')} options={METRICS} /></Field>
            <Field label="Toplama"><Sel value={edit.agg} onChange={E('agg')} options={[['sum', 'Toplam (her olayda artar)'], ['max', 'En yüksek değer (seri gibi)']]} /></Field>
            <Field label="İkon"><Sel value={edit.icon} onChange={E('icon')} options={ICONS} /></Field>
          </div>
          <div className="adm-row" style={{ alignItems: 'flex-start', marginTop: 12 }}>
            <Field label="Başlık (Portekizce, oyuncu görür)" help="{n} = hedef sayı" style={{ flex: 1 }}><Txt value={edit.title_pt} onChange={E('title_pt')} /></Field>
            <Field label="Başlık (Türkçe, sadece admin)" style={{ flex: 1 }}><Txt value={edit.title_tr} onChange={E('title_tr')} /></Field>
          </div>
          <h3 style={{ margin: '16px 0 8px', fontSize: 14 }}>Hedef değişkenleri</h3>
          <div className="adm-row" style={{ alignItems: 'flex-start' }}>
            <Field label="Taban hedef"><Num value={edit.base_target} step={0.5} onChange={E('base_target')} /></Field>
            <Field label="Seviye başına +"><Num value={edit.target_per_level} step={0.05} onChange={E('target_per_level')} /></Field>
            <Field label="Zincir büyümesi (×)" help="Seviye/başarım zinciri için, ör. 1.35"><Num value={edit.target_growth} step={0.05} onChange={E('target_growth')} /></Field>
            <Field label="Varyans (0–1)" help="0.15 = ±%15 rastgelelik"><Num value={edit.target_variance} step={0.05} min={0} max={0.9} onChange={E('target_variance')} /></Field>
            <Field label="Yuvarlama adımı"><Num value={edit.target_round} onChange={E('target_round')} /></Field>
          </div>
          <h3 style={{ margin: '16px 0 8px', fontSize: 14 }}>Ödül değişkenleri</h3>
          <div className="adm-row" style={{ alignItems: 'flex-start' }}>
            <Field label="Taban BC"><Num value={edit.reward_bc_base} onChange={E('reward_bc_base')} /></Field>
            <Field label="Seviye başına BC +"><Num value={edit.reward_bc_per_level} step={0.5} onChange={E('reward_bc_per_level')} /></Field>
            <Field label="Taban XP"><Num value={edit.reward_xp_base} onChange={E('reward_xp_base')} /></Field>
            <Field label="Seviye başına XP +"><Num value={edit.reward_xp_per_level} step={0.5} onChange={E('reward_xp_per_level')} /></Field>
            <Field label="Ödül büyümesi (×/zincir)"><Num value={edit.reward_growth} step={0.05} onChange={E('reward_growth')} /></Field>
          </div>
          <div className="adm-row" style={{ alignItems: 'flex-start', marginTop: 12 }}>
            <Field label="Min. seviye"><Num value={edit.min_level} onChange={E('min_level')} /></Field>
            <Field label="Maks. seviye"><Num value={edit.max_level} onChange={E('max_level')} /></Field>
            <Field label="Seçilme ağırlığı" help="Yüksek = daha sık çıkar"><Num value={edit.weight} onChange={E('weight')} /></Field>
            <div style={{ paddingTop: 26 }}><Bool value={edit.active} onChange={E('active')} label="Aktif" /></div>
          </div>
          <h3 style={{ margin: '18px 0 8px', fontSize: 14 }}>Önizleme (varyanssız, oyuncunun göreceği değerler)</h3>
          <div className="adm-wrap">
            <table className="adm-table">
              <thead><tr><th>Seviye</th>{(preview?.[0]?.items || []).map((it) => <th key={it.k}>{edit.scope === 'level' || edit.scope === 'achievement' ? `Adım ${it.k + 1}` : 'Görev'}</th>)}</tr></thead>
              <tbody>{(preview || []).map((r) => (
                <tr key={r.level}><td><b>Sv. {r.level}</b></td>{r.items.map((it) => <td key={it.k}><div>{it.title}</div><div className="adm-mono">{n0(it.reward_bc)} BC · {it.reward_xp} XP</div></td>)}</tr>
              ))}</tbody>
            </table>
          </div>
          <div className="adm-row" style={{ marginTop: 18 }}><div className="adm-sp" /><button className="adm-btn" onClick={() => setEdit(null)}>Vazgeç</button><button className="adm-btn y" onClick={save}>Kaydet</button></div>
        </Modal>
      )}
    </>
  );
}

// ================================================================= OYUNCULAR
export function Players() {
  const { run } = useAdmin();
  const [q, setQ] = useState('');
  const [rows, setRows] = useState(null);
  const [sel, setSel] = useState(null);
  const search = () => run(() => aapi('players?q=' + encodeURIComponent(q))).then((r) => r && setRows(r.players));
  useEffect(() => { search(); }, []); // eslint-disable-line
  return (
    <>
      <h1 className="adm-h1">Oyuncular</h1>
      <p className="adm-sub">Gerçek oyuncular (botlar hariç). İsim, kullanıcı adı veya Telegram ID ile arayın.</p>
      <div className="adm-row" style={{ marginBottom: 12 }}>
        <input className="adm-in" style={{ width: 320 }} placeholder="İsim, @kullanıcı veya Telegram ID" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && search()} />
        <button className="adm-btn y" onClick={search}>Ara</button>
      </div>
      <div className="adm-card adm-wrap" style={{ padding: 0 }}>
        <table className="adm-table">
          <thead><tr><th>Oyuncu</th><th>Telegram ID</th><th>Seviye</th><th>Gerçek</th><th>Bonus</th><th>Bekleyen</th><th>Maç / G</th><th>KYC</th><th>Son görülme</th><th /></tr></thead>
          <tbody>{(rows || []).map((p) => (
            <tr key={p.id}>
              <td><b>{p.display_name}</b>{p.username && <div className="adm-mono">@{p.username}</div>}{p.banned && <span className="adm-tag r">Engelli</span>}{p.paused_until && new Date(p.paused_until) > new Date() && <span className="adm-tag y">Mola</span>}</td>
              <td className="adm-mono">{p.telegram_id}</td><td>{p.level}</td><td>{n0(p.balance_real)}</td><td>{n0(p.balance_bonus)}</td><td>{n0(p.balance_pending)}</td>
              <td>{p.matches_played} / {p.matches_won}</td><td>{p.kyc_level}</td><td>{ago(p.last_seen)}</td>
              <td><button className="adm-btn sm" onClick={() => setSel(p.id)}>Detay</button></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      {sel && <PlayerDetail id={sel} onClose={() => { setSel(null); search(); }} />}
    </>
  );
}

function PlayerDetail({ id, onClose }) {
  const { run } = useAdmin();
  const [d, setD] = useState(null);
  const [bal, setBal] = useState({ amount: '', bucket: 'bonus', note: '', notify: true, wager_mult: 0 });
  const [msg, setMsg] = useState({ title: '', body: '', telegram: true });
  const [xp, setXp] = useState('');
  const [tab, setTab] = useState('ledger');
  const load = () => run(() => aapi('players/' + id)).then((r) => r && setD(r));
  useEffect(() => { load(); }, [id]); // eslint-disable-line
  if (!d) return <Modal title="Yükleniyor…" onClose={onClose}><p>…</p></Modal>;
  const p = d.player;
  const act = async (path, body, ok) => { const r = await run(() => aapi(`players/${id}/${path}`, { method: 'POST', body }), ok); if (r) load(); return r; };
  return (
    <Modal wide title={`${p.display_name} ${p.username ? '@' + p.username : ''}`} onClose={onClose}>
      <div className="adm-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
        {[[n0(p.balance_real), 'Gerçek bakiye'], [n0(p.balance_bonus), 'Bonus bakiye'], [n0(p.wager_remaining), 'Bonus çevrim kalan'], [n0(p.balance_pending), 'Bekleyen çekim'],
          [`${p.levelInfo.level} (${n0(p.xp)} XP)`, 'Seviye'], [`${p.matches_played} / ${p.matches_won}`, 'Maç / Galibiyet'], [p.kyc_level, 'KYC seviyesi'], [p.telegram_id, 'Telegram ID']].map(([v, l]) => (
          <div key={l} className="adm-card adm-stat"><div className="v" style={{ fontSize: 18 }}>{v}</div><div className="l">{l}</div></div>))}
      </div>
      <div className="adm-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
        <div className="adm-card adm-col">
          <h3 style={{ margin: 0 }}>Bakiye düzelt</h3>
          <div className="adm-row">
            <Field label="Tutar (BC, eksi = düş)"><Num value={bal.amount} onChange={(v) => setBal({ ...bal, amount: v })} /></Field>
            <Field label="Bakiye türü"><Sel value={bal.bucket} onChange={(v) => setBal({ ...bal, bucket: v })} options={[['bonus', 'Bonus (çekilemez)'], ['real', 'Gerçek (çekilebilir)']]} /></Field>
          </div>
          {bal.bucket === 'bonus' && <Field label="Çevrim şartı (×)" help="0 = şartsız"><Num value={bal.wager_mult} step={0.5} onChange={(v) => setBal({ ...bal, wager_mult: v })} /></Field>}
          <Field label="Not (kayıtlara geçer)"><Txt value={bal.note} onChange={(v) => setBal({ ...bal, note: v })} /></Field>
          <Bool value={bal.notify} onChange={(v) => setBal({ ...bal, notify: v })} label="Oyuncuya bildirim gönder" />
          <button className="adm-btn y" onClick={() => act('balance', bal, 'Bakiye güncellendi').then((r) => r && setBal({ ...bal, amount: '', note: '' }))}>Uygula</button>
        </div>
        <div className="adm-card adm-col">
          <h3 style={{ margin: 0 }}>Hesap</h3>
          <div className="adm-row">
            <button className={`adm-btn ${p.banned ? 'g' : 'r'}`} onClick={() => act('flags', { banned: !p.banned }, p.banned ? 'Engel kaldırıldı' : 'Oyuncu engellendi')}>{p.banned ? 'Engeli kaldır' : 'Engelle'}</button>
            <button className="adm-btn" onClick={() => act('flags', { mute_minutes: 60 }, '1 saat susturuldu')}>Sohbette 1 sa sustur</button>
            <button className="adm-btn" onClick={() => act('flags', { mute_minutes: 0 }, 'Susturma kaldırıldı')}>Susturmayı kaldır</button>
          </div>
          <div className="adm-row">
            <Field label="KYC seviyesi"><Sel value={p.kyc_level} onChange={(v) => act('flags', { kyc_level: Number(v) }, 'KYC güncellendi')} options={[[0, '0 · Doğrulanmamış'], [1, '1 · CPF doğrulandı'], [2, '2 · Belge doğrulandı']]} /></Field>
            {p.paused_until && <button className="adm-btn" style={{ marginTop: 18 }} onClick={() => act('flags', { unpause: true }, 'Mola kaldırıldı')}>Molayı kaldır</button>}
          </div>
          {p.kyc?.name && <div className="adm-mono">KYC: {p.kyc.name} · {p.kyc.birth} · CPF {p.kyc.cpf}</div>}
          <div className="adm-row"><Field label="XP ekle"><Num value={xp} onChange={setXp} /></Field><button className="adm-btn" style={{ marginTop: 18 }} onClick={() => act('xp', { xp: Number(xp) }, 'XP eklendi').then(() => setXp(''))}>Ekle</button></div>
          <button className="adm-btn" onClick={() => run(() => aapi('missions/reset-player', { method: 'POST', body: { playerId: id } }), 'Günlük/haftalık görevler yenilendi').then(load)}>Günlük + haftalık görevlerini yenile</button>
        </div>
        <div className="adm-card adm-col">
          <h3 style={{ margin: 0 }}>Mesaj gönder (Portekizce yazın)</h3>
          <Field label="Başlık"><Txt value={msg.title} onChange={(v) => setMsg({ ...msg, title: v })} /></Field>
          <Field label="Mesaj"><textarea className="adm-ta" style={{ fontFamily: 'inherit' }} value={msg.body} onChange={(e) => setMsg({ ...msg, body: e.target.value })} /></Field>
          <Bool value={msg.telegram} onChange={(v) => setMsg({ ...msg, telegram: v })} label="Telegram botundan da gönder" />
          <button className="adm-btn y" onClick={() => act('message', msg, 'Mesaj gönderildi').then(() => setMsg({ title: '', body: '', telegram: true }))}>Gönder</button>
        </div>
      </div>
      <div className="adm-tabs">{[['ledger', 'Hesap hareketleri'], ['matches', 'Maçlar'], ['missions', 'Açık görevler']].map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>
      <div className="adm-wrap">
        {tab === 'ledger' && <table className="adm-table"><thead><tr><th>Tarih</th><th>Tür</th><th>Gerçek</th><th>Bonus</th><th>Sonra (G/B)</th><th>Not</th></tr></thead><tbody>
          {d.ledger.map((l) => <tr key={l.id}><td>{dt(l.created_at)}</td><td>{PLAYER_LEDGER_TR[l.type] || l.type}</td><td>{n0(l.amount_real)}</td><td>{n0(l.amount_bonus)}</td><td>{n0(l.balance_real_after)} / {n0(l.balance_bonus_after)}</td><td className="adm-mono">{l.meta?.note || l.meta?.tier || ''}</td></tr>)}</tbody></table>}
        {tab === 'matches' && <table className="adm-table"><thead><tr><th>Tarih</th><th>Salon</th><th>Sonuç</th><th>Skor</th><th>Net</th></tr></thead><tbody>
          {d.matches.map((m) => <tr key={m.match_id}><td>{dt(m.finished_at)}</td><td>{m.tier_name}</td><td>{{ win: 'Galibiyet', loss: 'Mağlubiyet', forfeit: 'Pes etti', annulled: 'İptal' }[m.result]}</td><td>{m.score_us} × {m.score_them}</td><td>{n0(m.net)}</td></tr>)}</tbody></table>}
        {tab === 'missions' && <table className="adm-table"><thead><tr><th>Görev</th><th>Kapsam</th><th>İlerleme</th><th>Ödül</th><th>Durum</th><th>Bitiş</th></tr></thead><tbody>
          {d.missions.map((m) => <tr key={m.id}><td>{m.title}</td><td>{scopeTr(m.scope)}{m.chain_index ? ` #${m.chain_index + 1}` : ''}</td><td>{n0(m.progress)} / {n0(m.target)}</td><td>{n0(m.reward_bc)} BC · {m.reward_xp} XP</td><td><Status s={m.status} /></td><td>{m.expires_at ? dt(m.expires_at) : '∞'}</td></tr>)}</tbody></table>}
      </div>
    </Modal>
  );
}

// ================================================================= FİNANS
export function Finance() {
  const { run } = useAdmin();
  const [tab, setTab] = useState('dep');
  const [open, setOpen] = useState('open');
  const [rows, setRows] = useState(null);
  const load = () => run(() => aapi((tab === 'dep' ? 'deposits' : 'withdrawals') + '?status=' + open)).then((r) => r && setRows(tab === 'dep' ? r.deposits : r.withdrawals));
  useEffect(() => { setRows(null); load(); const i = setInterval(load, 10000); return () => clearInterval(i); }, [tab, open]); // eslint-disable-line
  const dep = async (d, action) => {
    let body = {};
    if (action === 'reject') { const note = prompt('Red sebebi (oyuncuya gider, Portekizce):'); if (note == null) return; body = { note }; }
    if (action === 'detect') { const c = prompt('Kaç onay (confirmation) görüldü?', '1'); if (c == null) return; body = { confirmations: Number(c) }; }
    if (action === 'confirm' && !confirm(`${n0(d.amount_bc)} BC (+${n0(d.bonus_bc)} bonus) oyuncuya yatırılsın mı? Ödemenin cüzdana geldiğini kontrol ettiniz mi?`)) return;
    await run(() => aapi(`deposits/${d.id}/${action}`, { method: 'POST', body }), 'Tamam'); load();
  };
  const wd = async (w, action) => {
    let body = {};
    if (action === 'sent') { const tx = prompt('İşlem hash (tx) — ödemeyi gönderdikten sonra yapıştırın:'); if (!tx) return; body = { tx_hash: tx.trim() }; }
    if (action === 'reject') { const note = prompt('Red sebebi (oyuncuya gider, Portekizce):'); if (note == null) return; body = { note }; }
    await run(() => aapi(`withdrawals/${w.id}/${action}`, { method: 'POST', body }), 'Tamam'); load();
  };
  return (
    <>
      <h1 className="adm-h1">Finans</h1>
      <p className="adm-sub">Yatırımlar kripto cüzdanınıza gelir; ödemeyi blok gezgininde (TronScan / Tonviewer) kontrol edip <b>Onayla</b>'ya basınca oyuncunun bakiyesine (ve varsa bonus + davet ödülü) eklenir. Çekimlerde önce <b>İncele</b>, ödemeyi kendi cüzdanınızdan gönderince <b>Gönderildi</b> (tx hash ile), ağda onaylanınca <b>Tamamlandı</b>. Red edilen çekim tutarı otomatik iade edilir.</p>
      <div className="adm-row" style={{ marginBottom: 12 }}>
        <div className="adm-tabs" style={{ margin: 0 }}>{[['dep', 'Yatırımlar'], ['wd', 'Çekimler']].map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>
        <div className="adm-tabs" style={{ margin: 0 }}>{[['open', 'Bekleyenler'], ['closed', 'Geçmiş']].map(([k, l]) => <button key={k} className={open === k ? 'on' : ''} onClick={() => setOpen(k)}>{l}</button>)}</div>
      </div>
      <div className="adm-card adm-wrap" style={{ padding: 0 }}>
        {tab === 'dep' ? (
          <table className="adm-table"><thead><tr><th>Tarih</th><th>Oyuncu</th><th>Tutar</th><th>Bonus</th><th>Ağ</th><th>Tx hash (oyuncu girdi)</th><th>Durum</th><th /></tr></thead><tbody>
            {(rows || []).map((d) => (
              <tr key={d.id}><td>{dt(d.created_at)}</td><td>{d.players?.display_name}<div className="adm-mono">{d.players?.telegram_id}</div></td>
                <td><b>{n0(d.amount_bc)} BC</b><div className="adm-mono">R$ {n0(d.amount_bc / 100)}</div></td><td>{n0(d.bonus_bc)}</td><td>{d.asset} · {d.network}</td>
                <td className="adm-mono" style={{ maxWidth: 220 }}>{d.tx_hash || '—'}</td><td><Status s={d.status} />{d.confirmations ? <div className="adm-mono">{d.confirmations} onay</div> : null}</td>
                <td>{['awaiting', 'detected', 'expired'].includes(d.status) && <div className="adm-row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                  <button className="adm-btn sm g" onClick={() => dep(d, 'confirm')}>Onayla</button>
                  <button className="adm-btn sm" onClick={() => dep(d, 'detect')}>Ağda görüldü</button>
                  <button className="adm-btn sm r" onClick={() => dep(d, 'reject')}>Reddet</button></div>}</td></tr>
            ))}
            {rows && !rows.length && <tr><td colSpan={8} style={{ textAlign: 'center', color: '#8891AB', padding: 30 }}>Kayıt yok.</td></tr>}
          </tbody></table>
        ) : (
          <table className="adm-table"><thead><tr><th>Tarih</th><th>Oyuncu</th><th>Tutar</th><th>Ücret</th><th>Adres</th><th>KYC</th><th>Durum</th><th /></tr></thead><tbody>
            {(rows || []).map((w) => (
              <tr key={w.id}><td>{dt(w.created_at)}</td><td>{w.players?.display_name}<div className="adm-mono">{w.players?.telegram_id}</div></td>
                <td><b>{n0(w.amount_bc)} BC</b><div className="adm-mono">gönderilecek: R$ {n0((w.amount_bc - w.fee_bc) / 100)}</div></td><td>{n0(w.fee_bc)}</td>
                <td className="adm-mono" style={{ maxWidth: 240 }}>{w.asset} · {w.network}<br />{w.address}</td>
                <td>{w.players?.kyc_level}{w.players?.kyc?.name && <div className="adm-mono">{w.players.kyc.name}</div>}</td>
                <td><Status s={w.status === 'cancelled' ? 'cancelled_w' : w.status} />{w.tx_hash && <div className="adm-mono">{w.tx_hash.slice(0, 16)}…</div>}</td>
                <td><div className="adm-row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                  {w.status === 'requested' && <button className="adm-btn sm" onClick={() => wd(w, 'review')}>İncele</button>}
                  {['requested', 'review'].includes(w.status) && <button className="adm-btn sm g" onClick={() => wd(w, 'sent')}>Gönderildi</button>}
                  {w.status === 'sent' && <button className="adm-btn sm g" onClick={() => wd(w, 'complete')}>Tamamlandı</button>}
                  {['requested', 'review'].includes(w.status) && <button className="adm-btn sm r" onClick={() => wd(w, 'reject')}>Reddet</button>}</div></td></tr>
            ))}
            {rows && !rows.length && <tr><td colSpan={8} style={{ textAlign: 'center', color: '#8891AB', padding: 30 }}>Kayıt yok.</td></tr>}
          </tbody></table>
        )}
      </div>
    </>
  );
}

// ================================================================= SOHBET
export function ChatAdmin() {
  const { run } = useAdmin();
  const [d, setD] = useState(null);
  const [ann, setAnn] = useState('');
  const [rain, setRain] = useState({ pool: 1000, max_per_user: 50, seconds: 60 });
  const load = () => run(() => aapi('chat')).then((r) => r && setD(r));
  useEffect(() => { load(); const i = setInterval(load, 8000); return () => clearInterval(i); }, []); // eslint-disable-line
  return (
    <>
      <h1 className="adm-h1">Sohbet & Para Yağmuru</h1>
      <p className="adm-sub">Canlı sohbeti yönetin. Duyurular "BoraBet · MOD" adıyla görünür. Para yağmuru başlatınca sohbette "Pegar" butonu çıkar; ilk gelenler havuzdan pay alır (ödül türü Ayarlar'daki "Ödüller hangi bakiyeye" seçeneğine göre).</p>
      <div className="adm-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
        <div className="adm-card adm-col">
          <h3 style={{ margin: 0 }}>Duyuru yaz (Portekizce)</h3>
          <textarea className="adm-ta" style={{ fontFamily: 'inherit' }} value={ann} onChange={(e) => setAnn(e.target.value)} placeholder="Ex.: Chuva de moedas às 21h, fiquem ligados!" />
          <button className="adm-btn y" onClick={() => run(() => aapi('chat/announce', { method: 'POST', body: { text: ann } }), 'Duyuru gönderildi').then(() => { setAnn(''); load(); })}>Gönder</button>
        </div>
        <div className="adm-card adm-col">
          <h3 style={{ margin: 0 }}>🌧️ Para yağmuru başlat</h3>
          <div className="adm-row">
            <Field label="Toplam havuz (BC)"><Num value={rain.pool} onChange={(v) => setRain({ ...rain, pool: v })} /></Field>
            <Field label="Kişi başı maks. (BC)"><Num value={rain.max_per_user} onChange={(v) => setRain({ ...rain, max_per_user: v })} /></Field>
            <Field label="Süre (sn)"><Num value={rain.seconds} onChange={(v) => setRain({ ...rain, seconds: v })} /></Field>
          </div>
          <button className="adm-btn y" onClick={() => confirm(`${rain.pool} BC yağmur başlatılsın mı?`) && run(() => aapi('chat/rain', { method: 'POST', body: rain }), 'Yağmur başladı').then(load)}>Başlat</button>
          {(d?.rains || []).slice(0, 5).map((r) => <div key={r.id} className="adm-mono">#{r.id} · {dt(r.starts_at)} · havuz {n0(r.pool)} · kalan {n0(r.remaining)}</div>)}
        </div>
      </div>
      <div className="adm-card adm-wrap" style={{ padding: 0 }}>
        <table className="adm-table"><thead><tr><th>Zaman</th><th>İsim</th><th>Mesaj</th><th /></tr></thead><tbody>
          {(d?.messages || []).map((m) => (
            <tr key={m.id} style={{ opacity: m.deleted ? 0.4 : 1 }}><td>{dt(m.created_at)}</td><td><b>{m.name}</b> {m.role && <span className="adm-tag">{m.role}</span>}</td><td>{m.text}</td>
              <td>{!m.deleted && <button className="adm-btn sm r" onClick={() => run(() => aapi('chat/delete', { method: 'POST', body: { id: m.id } }), 'Silindi').then(load)}>Sil</button>}</td></tr>
          ))}
        </tbody></table>
      </div>
    </>
  );
}

// ================================================================= AYARLAR
const GROUPS = [
  ['Bot & Eşleştirme', [
    ['bot_fill_probability', 'slider', 'Boş koltuğa bot oturma olasılığı (%)', 'Masada en az bir gerçek oyuncu varken, her boş koltuk için bekleme süresi dolunca bu olasılıkla bot oturur. 0 = bot hiç otomatik oturmaz (sadece oyuncu "Completar com Bot" derse veya admin eklerse), 100 = süre dolunca her zaman bot oturur. Kalan olasılıkta koltuk gerçek oyuncu için açık kalır.'],
    ['bot_fill_delay_min_s', 'num', 'Bot oturmadan önce min. bekleme (sn)', 'Gerçek oyunculara şans tanımak için'],
    ['bot_fill_delay_max_s', 'num', 'Bot oturmadan önce maks. bekleme (sn)', 'Her koltuk bu aralıkta rastgele bir anda dolar — botlar hep aynı anda girmez'],
    ['matchmaking_max_wait_s', 'num', 'Oyuncunun "Bot ile doldur" butonu kaç sn sonra aktif olur', ''],
    ['allow_manual_bot_fill', 'bool', 'Oyuncular "Completar com Bot" ile masayı botla doldurabilsin', ''],
    ['bots_in_ranking', 'bool', 'Botlar sıralamada (ranking) görünsün', 'Kapalıysa sıralamada sadece gerçek oyuncular olur'],
    ['bots_in_ticker', 'bool', 'Botların kazançları ana sayfa kazanan şeridinde görünsün', ''],
  ]],
  ['Oyun kuralları', [
    ['commission_pct', 'num', 'Komisyon (%)', 'Pottan kesilen kasa payı. Oyuncuya RTP = 100 − komisyon olarak gösterilir'],
    ['mult_carroca', 'num', 'Carroça (çift taşla bitirme) çarpanı', ''], ['mult_laelo', 'num', 'Lá e lô (iki uca uyan taşla bitirme) çarpanı', ''],
    ['mult_cruzada', 'num', 'Cruzada (iki uca uyan çift taş) çarpanı', ''],
    ['ready_check_s', 'num', 'Hazırlık kontrolü süresi (sn)', 'Masa dolunca herkesin "Estou pronto" demesi için süre'],
    ['round_break_s', 'num', 'Eller arası mola (sn)', ''], ['time_bank_count', 'num', 'Maç başına ek süre hakkı (+10 sn)', ''],
    ['time_bank_s', 'num', 'Ek süre (sn)', ''], ['max_timeouts', 'num', 'Kaç kez süre aşımında maç kaybedilir', ''],
  ]],
  ['Ekonomi & bonuslar', [
    ['welcome_bonus', 'num', 'Hoş geldin bonusu (BC)', 'Ücretsiz tanıtım masasından sonra verilir'],
    ['wagering_multiplier', 'num', 'Bonus çevrim şartı (×)', '3 = bonus tutarının 3 katı bahis yapılınca çekilebilir olur'],
    ['deposit_bonus_pct', 'num', 'Yatırım bonusu (%)', ''], ['referral_bonus', 'num', 'Davet bonusu (BC, iki tarafa)', 'Davet edilen ilk yatırımını yapınca'],
    ['daily_rewards', 'list', 'Günlük ödüller (7 gün, virgülle)', 'Ör: 50, 75, 100, 150, 200, 300, 500'],
    ['reward_balance', 'sel:bonus=Bonus bakiyeye (çevrim şartlı)|real=Gerçek bakiyeye', 'Görev/günlük/seviye ödülleri hangi bakiyeye', ''],
    ['reward_wager_mult', 'num', 'Ödül bonuslarının çevrim şartı (×)', ''],
  ]],
  ['XP & Seviye', [
    ['xp_base', 'num', 'XP eğrisi tabanı', 'Sv. N için gereken toplam XP = taban × (N−1)^üs'], ['xp_exp', 'num', 'XP eğrisi üssü', '1.45 önerilir; büyüdükçe seviye atlamak zorlaşır'],
    ['xp_match', 'num', 'Maç başına XP', ''], ['xp_win', 'num', 'Galibiyet ek XP', ''], ['xp_round_won', 'num', 'Kazanılan el başına XP', ''],
    ['level_up_bonus', 'num', 'Seviye bonusu (BC × yeni seviye)', 'Ör: 25 → Sv.10 olunca 250 BC'],
    ['level_tiers', 'json', 'Seviye kademeleri (JSON)', '[{"name":"Novato","min":1}, …] — isimler oyuncuya Portekizce görünür'],
  ]],
  ['Görev üretimi', [
    ['missions_daily_count', 'num', 'Günlük görev sayısı', ''], ['missions_weekly_count', 'num', 'Haftalık görev sayısı', ''],
    ['missions_level_slots', 'num', 'Aynı anda açık seviye-zinciri görevi', 'Biri alınınca yenisi doğar (sonsuz)'],
  ]],
  ['Finans', [
    ['min_deposit', 'num', 'Min. yatırım (BC)', ''], ['max_deposit', 'num', 'Maks. yatırım (BC)', ''], ['quote_minutes', 'num', 'Kur geçerlilik süresi (dk)', ''],
    ['deposit_addresses', 'json', 'Yatırım cüzdan adresleriniz (JSON)', '{"usdt_trc20":"T…","ton":"UQ…"} — boş bırakılan ağ kapalı olur'],
    ['withdraw_fee', 'json', 'Çekim ağ ücretleri (BC, JSON)', '{"usdt_trc20":120,"ton":50}'],
    ['min_withdraw', 'num', 'Min. çekim (BC)', ''], ['new_address_delay_h', 'num', 'Yeni adres kilidi (saat)', 'Güvenlik için'],
    ['kyc2_threshold', 'num', 'KYC-2 gereken çekim eşiği (BC)', ''],
  ]],
  ['Genel', [
    ['maintenance', 'bool', 'Bakım modu (yeni masa ve yatırım kapalı)', ''], ['chat_slow_mode_s', 'num', 'Sohbet yavaş mod (sn)', ''],
    ['timezone', 'txt', 'Saat dilimi', 'Günlük/haftalık sıfırlama için: America/Sao_Paulo'], ['license_text', 'txt', 'Lisans metni (alt bilgi)', ''],
    ['support_url', 'txt', 'Destek linki (Telegram)', 'https://t.me/kullaniciadi'],
  ]],
];
export function Settings() {
  const { run } = useAdmin();
  const [s, setS] = useState(null);
  const [draft, setDraft] = useState({});
  const [jsonErr, setJsonErr] = useState({});
  useEffect(() => { run(() => aapi('settings')).then((r) => r && setS(r.settings)); }, []); // eslint-disable-line
  if (!s) return <p className="adm-sub">Yükleniyor…</p>;
  const val = (k) => (k in draft ? draft[k] : s[k]);
  const set = (k, v) => setDraft({ ...draft, [k]: v });
  async function save() {
    if (Object.values(jsonErr).some(Boolean)) { alert('JSON alanlarında hata var'); return; }
    const r = await run(() => aapi('settings', { method: 'PATCH', body: { values: draft } }), 'Ayarlar kaydedildi');
    if (r) { setS(r.settings); setDraft({}); }
  }
  const dirty = Object.keys(draft).length;
  const xpPreview = [2, 5, 10, 20, 30, 50].map((L) => [L, Math.round(Number(val('xp_base')) * Math.pow(L - 1, Number(val('xp_exp'))))]);
  return (
    <>
      <div className="adm-row"><h1 className="adm-h1">Ayarlar</h1><div className="adm-sp" />
        <button className="adm-btn" disabled={!dirty} onClick={() => setDraft({})}>Değişiklikleri geri al</button>
        <button className="adm-btn y" disabled={!dirty} onClick={save}>Kaydet {dirty ? `(${dirty})` : ''}</button></div>
      <p className="adm-sub">Değişiklikler kaydedildikten en geç 15 saniye sonra tüm sunucularda geçerli olur. Oyun sırasındaki masalar mevcut kurallarla devam eder.</p>
      {GROUPS.map(([title, fields]) => (
        <div key={title} className="adm-card" style={{ marginBottom: 14 }}>
          <h3>{title}</h3>
          <div className="adm-col" style={{ gap: 14 }}>
            {fields.map(([k, type, label, help]) => {
              const v = val(k);
              let input;
              if (type === 'slider') {
                input = (
                  <div className="adm-col" style={{ gap: 4 }}>
                    <div className="adm-row"><input className="adm-range" type="range" min={0} max={100} value={v} onChange={(e) => set(k, Number(e.target.value))} style={{ maxWidth: 420 }} />
                      <b style={{ fontSize: 22, color: '#FFD93D', minWidth: 60 }}>%{v}</b></div>
                    <div className="adm-row" style={{ gap: 6 }}>{[0, 25, 50, 70, 90, 100].map((x) => <button key={x} className="adm-btn sm" onClick={() => set(k, x)}>%{x}</button>)}</div>
                  </div>
                );
              } else if (type === 'bool') input = <Bool value={v} onChange={(x) => set(k, x)} label={v ? 'Açık' : 'Kapalı'} />;
              else if (type === 'num') input = <Num value={v} step="any" onChange={(x) => set(k, x)} style={{ width: 160 }} />;
              else if (type === 'txt') input = <Txt value={v} onChange={(x) => set(k, x)} style={{ width: 360 }} />;
              else if (type === 'list') input = <Txt value={(Array.isArray(v) ? v : []).join(', ')} onChange={(x) => set(k, x.split(/[,\s]+/).filter(Boolean).map(Number))} style={{ width: 360 }} />;
              else if (type.startsWith('sel:')) input = <Sel value={v} onChange={(x) => set(k, x)} options={type.slice(4).split('|').map((o) => o.split('='))} />;
              else if (type === 'json') {
                input = <textarea className="adm-ta" style={{ maxWidth: 560, minHeight: 70, borderColor: jsonErr[k] ? '#F0424B' : undefined }} defaultValue={JSON.stringify(v, null, 1)}
                  onChange={(e) => { try { set(k, JSON.parse(e.target.value)); setJsonErr({ ...jsonErr, [k]: false }); } catch (x) { setJsonErr({ ...jsonErr, [k]: true }); } }} />;
              }
              return (
                <div key={k} className="adm-col" style={{ gap: 4 }}>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{label} {k in draft && <span className="adm-tag y">değişti</span>}</span>
                  {input}
                  {help && <small style={{ color: '#6E7691', fontSize: 12, lineHeight: '17px', maxWidth: 720 }}>{help}</small>}
                  {k === 'xp_exp' && <div className="adm-mono">Önizleme: {xpPreview.map(([L, x]) => `Sv.${L} = ${n0(x)} XP`).join(' · ')}</div>}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </>
  );
}

// ================================================================= RAPORLAR
export function Reports() {
  const { run } = useAdmin();
  const [days, setDays] = useState(30);
  const [r, setR] = useState(null);
  const [log, setLog] = useState(null);
  useEffect(() => { run(() => aapi('ledger?days=' + days)).then((x) => x && setR(x.days)); }, [days]); // eslint-disable-line
  useEffect(() => { run(() => aapi('log')).then((x) => x && setLog(x.log)); }, []); // eslint-disable-line
  const tot = (r || []).reduce((a, d) => ({ commission: a.commission + d.commission, bot: a.bot + d.bot_stake + d.bot_win, bonus: a.bonus + d.bonus, adj: a.adj + d.admin_adjust, net: a.net + d.net }), { commission: 0, bot: 0, bonus: 0, adj: 0, net: 0 });
  return (
    <>
      <h1 className="adm-h1">Raporlar</h1>
      <p className="adm-sub">Kasa defteri gün gün. <b>Bot sonucu</b> = botların yatırdığı bahisler ile kazandıkları arasındaki fark (kasa botların bankasıdır). Net = komisyon + bot sonucu − bonuslar − admin düzeltmeleri.</p>
      <div className="adm-tabs">{[7, 30, 90].map((d) => <button key={d} className={days === d ? 'on' : ''} onClick={() => setDays(d)}>Son {d} gün</button>)}</div>
      <div className="adm-grid">
        {[['Komisyon', tot.commission, '#3DDB5F'], ['Bot sonucu', tot.bot], ['Bonus / ödüller', tot.bonus, '#FF8A90'], ['Admin düzeltme', tot.adj], ['NET', tot.net, tot.net >= 0 ? '#3DDB5F' : '#FF8A90']].map(([l, v, c]) => (
          <div key={l} className="adm-card adm-stat"><div className="v" style={{ color: c }}>{n0(v)}</div><div className="l">{l} (BC)</div></div>))}
      </div>
      <div className="adm-card adm-wrap" style={{ padding: 0, marginBottom: 18 }}>
        <table className="adm-table"><thead><tr><th>Gün</th><th>{LEDGER_TR.commission}</th><th>Bot bahis</th><th>Bot kazanç</th><th>Bonus</th><th>Admin</th><th>Net</th></tr></thead><tbody>
          {(r || []).map((d) => <tr key={d.day}><td>{d.day}</td><td>{n0(d.commission)}</td><td>{n0(d.bot_stake)}</td><td>{n0(d.bot_win)}</td><td>{n0(d.bonus)}</td><td>{n0(d.admin_adjust)}</td><td><b style={{ color: d.net >= 0 ? '#3DDB5F' : '#FF8A90' }}>{n0(d.net)}</b></td></tr>)}
        </tbody></table>
      </div>
      <h3>Admin işlem kaydı</h3>
      <div className="adm-card adm-wrap" style={{ padding: 0 }}>
        <table className="adm-table"><thead><tr><th>Zaman</th><th>İşlem</th><th>Detay</th></tr></thead><tbody>
          {(log || []).map((l) => <tr key={l.id}><td>{dt(l.created_at)}</td><td>{l.action}</td><td className="adm-mono">{JSON.stringify(l.meta)}</td></tr>)}
        </tbody></table>
      </div>
    </>
  );
}
