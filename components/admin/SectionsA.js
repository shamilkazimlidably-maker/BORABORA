import { useEffect, useState } from 'react';
import { aapi, useAdmin, Field, Num, Txt, Bool, Sel, Modal, n0, dt, ago, SKILL, Status } from './kit';

// ================================================================= PANEL
export function Dashboard({ go }) {
  const { run } = useAdmin();
  const [d, setD] = useState(null);
  const load = () => run(() => aapi('dashboard')).then((r) => r && setD(r));
  useEffect(() => { load(); const id = setInterval(load, 15000); return () => clearInterval(id); }, []); // eslint-disable-line
  if (!d) return <p className="adm-sub">Yükleniyor…</p>;
  const S = ({ v, l, c, onClick }) => <div className="adm-card adm-stat" style={{ cursor: onClick ? 'pointer' : undefined }} onClick={onClick}><div className="v" style={{ color: c }}>{v}</div><div className="l">{l}</div></div>;
  return (
    <>
      <h1 className="adm-h1">Genel Bakış</h1>
      <p className="adm-sub">Her 15 saniyede bir otomatik yenilenir. Tutarlar BC (BoraCoin) cinsindendir · 100 BC = R$ 1,00.</p>
      <div className="adm-grid">
        <S v={n0(d.online)} l="Şu an çevrimiçi (son 2 dk)" c="#3DDB5F" />
        <S v={n0(d.humans)} l={`Toplam oyuncu (+${d.newToday} bugün)`} onClick={() => go('players')} />
        <S v={n0(d.bots)} l="Aktif bot" onClick={() => go('bots')} />
        <S v={`${d.live.playing} / ${d.live.forming}`} l="Oynanan / bekleyen masa" onClick={() => go('rooms')} />
        <S v={`${d.live.seatsHuman} / ${d.live.seatsBot}`} l="Masalardaki insan / bot" />
        <S v={n0(d.finishedToday)} l="Bugün biten maç" />
        <S v={`%${d.botShareToday}`} l="Bugün maçlardaki bot oranı" c="#8FB4FF" />
        <S v={n0(d.pendingDeposits)} l="Onay bekleyen yatırım" c={d.pendingDeposits ? '#FFD93D' : undefined} onClick={() => go('finance')} />
        <S v={n0(d.pendingWithdrawals)} l="Bekleyen çekim talebi" c={d.pendingWithdrawals ? '#FFD93D' : undefined} onClick={() => go('finance')} />
      </div>
      <div className="adm-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
        {[['Bugün', d.houseToday, d.netToday], ['Son 7 gün', d.houseWeek, d.netWeek]].map(([t, h, net]) => (
          <div key={t} className="adm-card">
            <h3>Kasa · {t}</h3>
            <table className="adm-table"><tbody>
              <tr><td>Komisyon geliri</td><td style={{ textAlign: 'right', color: '#3DDB5F' }}>+{n0(h.commission)}</td></tr>
              <tr><td>Bot kazançları</td><td style={{ textAlign: 'right' }}>{n0(h.bot_win)}</td></tr>
              <tr><td>Bot bahisleri</td><td style={{ textAlign: 'right' }}>{n0(h.bot_stake)}</td></tr>
              <tr><td>Bonus / ödüller</td><td style={{ textAlign: 'right', color: '#FF8A90' }}>{n0(h.bonus)}</td></tr>
              <tr><td>Admin düzeltmeleri</td><td style={{ textAlign: 'right' }}>{n0(h.admin_adjust)}</td></tr>
              <tr><td><b>Net</b></td><td style={{ textAlign: 'right' }}><b style={{ color: net >= 0 ? '#3DDB5F' : '#FF8A90' }}>{n0(net)}</b></td></tr>
            </tbody></table>
          </div>
        ))}
        <div className="adm-card">
          <h3>Oyuncu bakiyeleri (yükümlülük)</h3>
          <table className="adm-table"><tbody>
            <tr><td>Gerçek bakiye (çekilebilir)</td><td style={{ textAlign: 'right' }}>{n0(d.liabilities.real)}</td></tr>
            <tr><td>Bonus bakiye</td><td style={{ textAlign: 'right' }}>{n0(d.liabilities.bonus)}</td></tr>
            <tr><td>Bekleyen çekimler</td><td style={{ textAlign: 'right' }}>{n0(d.liabilities.pending)}</td></tr>
          </tbody></table>
        </div>
      </div>
    </>
  );
}

// ================================================================= BOTLAR
const EMPTY_BOT = { display_name: '', bot_skill: 3, bot_speed_min_ms: 1800, bot_speed_max_ms: 5500, level: 5, bot_active: true, bot_note: '' };
export function Bots() {
  const { run } = useAdmin();
  const [bots, setBots] = useState(null);
  const [edit, setEdit] = useState(null);
  const [gen, setGen] = useState(null);
  const [filter, setFilter] = useState('');
  const load = () => run(() => aapi('bots')).then((r) => r && setBots(r.bots));
  useEffect(() => { load(); }, []); // eslint-disable-line

  async function save() {
    const b = edit;
    const body = { display_name: b.display_name, bot_skill: Number(b.bot_skill), bot_speed_min_ms: Number(b.bot_speed_min_ms), bot_speed_max_ms: Number(b.bot_speed_max_ms), level: Number(b.level), bot_active: !!b.bot_active, bot_note: b.bot_note || null };
    const r = await run(() => (b.id ? aapi('bots/' + b.id, { method: 'PATCH', body }) : aapi('bots', { method: 'POST', body })), 'Bot kaydedildi');
    if (r) { setEdit(null); load(); }
  }
  async function toggle(b) { await run(() => aapi('bots/' + b.id, { method: 'PATCH', body: { bot_active: !b.bot_active } }), b.bot_active ? 'Bot pasif yapıldı' : 'Bot aktif'); load(); }
  async function del(b) {
    if (!confirm(`"${b.display_name}" silinsin mi? Maç geçmişi varsa sadece pasif yapılır.`)) return;
    const r = await run(() => aapi('bots/' + b.id, { method: 'DELETE' }));
    if (r) { run(async () => r, r.deleted ? 'Bot silindi' : 'Geçmişi olduğu için pasif yapıldı'); load(); }
  }
  async function generate() {
    const body = { count: Number(gen.count), skill: gen.skill === 'random' ? null : Number(gen.skill), speed_min_ms: gen.speed === 'random' ? undefined : Number(gen.min), speed_max_ms: gen.speed === 'random' ? undefined : Number(gen.max) };
    const r = await run(() => aapi('bots/generate', { method: 'POST', body }), 'Botlar oluşturuldu');
    if (r) { setGen(null); load(); }
  }
  const list = (bots || []).filter((b) => !filter || b.display_name.toLowerCase().includes(filter.toLowerCase()));
  return (
    <>
      <h1 className="adm-h1">Botlar</h1>
      <p className="adm-sub">Botlar uygulamada normal oyuncu gibi görünür (isim, seviye, avatar). Masada kurallar gereği küçük bir <b>BOT</b> etiketi taşırlar. Masaya ne sıklıkla bot oturacağını <b>Ayarlar → Bot & Eşleştirme</b> bölümündeki olasılıktan yönetirsiniz.</p>
      <div className="adm-help">
        <b>Hız nasıl çalışır?</b> Her hamleden önce bot, belirlediğiniz <i>minimum–maksimum</i> süre arasında insan gibi "düşünür" (çan eğrisi dağılımı, seçenek çoğaldıkça biraz daha uzun, ara sıra dikkat dağınıklığı gibi ek gecikme). İnsan gibi görünmesi için <b>1500–6000 ms</b> önerilir; 1000 ms altı robotik görünür.
        <br /><b>Beceri:</b> 1 = sık hata yapan acemi, 5 = neredeyse hatasız usta. Botlar sadece kendi elini ve masadaki açık bilgiyi görür — hile yapmaz.
      </div>
      <div className="adm-row" style={{ marginBottom: 12 }}>
        <button className="adm-btn y" onClick={() => setEdit({ ...EMPTY_BOT })}>+ Yeni bot</button>
        <button className="adm-btn" onClick={() => setGen({ count: 10, skill: 'random', speed: 'random', min: 1800, max: 5500 })}>⚡ Toplu bot üret (rastgele Brezilya isimleri)</button>
        <div className="adm-sp" /><input className="adm-in" placeholder="İsimle ara…" value={filter} onChange={(e) => setFilter(e.target.value)} />
      </div>
      <div className="adm-card adm-wrap" style={{ padding: 0 }}>
        <table className="adm-table">
          <thead><tr><th>İsim</th><th>Durum</th><th>Beceri</th><th>Düşünme süresi</th><th>Seviye</th><th>Maç / Galibiyet</th><th>Son 30 gün</th><th>Şu an</th><th /></tr></thead>
          <tbody>
            {list.map((b) => (
              <tr key={b.id}>
                <td><div className="adm-row" style={{ gap: 8 }}><span style={{ width: 24, height: 24, borderRadius: '50%', background: b.avatar_color }} /><b>{b.display_name}</b></div>{b.bot_note && <div className="adm-mono">{b.bot_note}</div>}</td>
                <td>{b.bot_active ? <span className="adm-tag g">Aktif</span> : <span className="adm-tag">Pasif</span>}</td>
                <td>{'★'.repeat(b.bot_skill)}<span style={{ color: '#3A4260' }}>{'★'.repeat(5 - b.bot_skill)}</span></td>
                <td>{(b.bot_speed_min_ms / 1000).toFixed(1)}–{(b.bot_speed_max_ms / 1000).toFixed(1)} sn</td>
                <td>{b.level}</td>
                <td>{b.matches_played} / {b.matches_won}</td>
                <td><span style={{ color: '#3DDB5F' }}>{b.last30.w}G</span> · <span style={{ color: '#FF8A90' }}>{b.last30.l}M</span></td>
                <td>{b.busy ? <Status s={b.busy.status} /> : <span className="adm-tag">Boşta</span>}</td>
                <td><div className="adm-row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                  <button className="adm-btn sm" onClick={() => setEdit({ ...b })}>Düzenle</button>
                  <button className="adm-btn sm" onClick={() => toggle(b)}>{b.bot_active ? 'Pasif yap' : 'Aktif yap'}</button>
                  <button className="adm-btn sm r" onClick={() => del(b)}>Sil</button>
                </div></td>
              </tr>
            ))}
            {bots && !list.length && <tr><td colSpan={9} style={{ textAlign: 'center', color: '#8891AB', padding: 30 }}>Bot yok. "Toplu bot üret" ile başlayın.</td></tr>}
          </tbody>
        </table>
      </div>

      {edit && (
        <Modal title={edit.id ? 'Botu düzenle' : 'Yeni bot'} onClose={() => setEdit(null)}>
          <div className="adm-row" style={{ alignItems: 'flex-start' }}>
            <Field label="Görünen isim" help="Oyuncuların göreceği isim (maks. 20 karakter)"><Txt value={edit.display_name} onChange={(v) => setEdit({ ...edit, display_name: v.slice(0, 20) })} /></Field>
            <Field label="Beceri"><Sel value={edit.bot_skill} onChange={(v) => setEdit({ ...edit, bot_skill: Number(v) })} options={Object.entries(SKILL)} /></Field>
            <Field label="Seviye (profilde görünen)"><Num value={edit.level} min={1} max={200} onChange={(v) => setEdit({ ...edit, level: v })} /></Field>
          </div>
          <div className="adm-row" style={{ alignItems: 'flex-start', marginTop: 12 }}>
            <Field label="Min. düşünme süresi (ms)" help="Hamleden önce en az bekleme"><Num value={edit.bot_speed_min_ms} min={300} step={100} onChange={(v) => setEdit({ ...edit, bot_speed_min_ms: v })} /></Field>
            <Field label="Maks. düşünme süresi (ms)" help="Hamleden önce en fazla bekleme (tur süresinden kısa olmalı)"><Num value={edit.bot_speed_max_ms} min={500} step={100} onChange={(v) => setEdit({ ...edit, bot_speed_max_ms: v })} /></Field>
            <Field label="Not (sadece admin görür)"><Txt value={edit.bot_note} onChange={(v) => setEdit({ ...edit, bot_note: v })} /></Field>
          </div>
          <div style={{ marginTop: 12 }}><Bool value={edit.bot_active} onChange={(v) => setEdit({ ...edit, bot_active: v })} label="Aktif (boş koltuklara oturabilir)" /></div>
          <div className="adm-row" style={{ marginTop: 18 }}><div className="adm-sp" /><button className="adm-btn" onClick={() => setEdit(null)}>Vazgeç</button><button className="adm-btn y" onClick={save}>Kaydet</button></div>
        </Modal>
      )}
      {gen && (
        <Modal title="Toplu bot üret" onClose={() => setGen(null)}>
          <div className="adm-row" style={{ alignItems: 'flex-start' }}>
            <Field label="Kaç bot?" help="Tek seferde en fazla 50"><Num value={gen.count} min={1} max={50} onChange={(v) => setGen({ ...gen, count: v })} /></Field>
            <Field label="Beceri"><Sel value={gen.skill} onChange={(v) => setGen({ ...gen, skill: v })} options={[['random', 'Rastgele (1–5 karışık)'], ...Object.entries(SKILL)]} /></Field>
            <Field label="Hız"><Sel value={gen.speed} onChange={(v) => setGen({ ...gen, speed: v })} options={[['random', 'Rastgele (insan gibi, karışık)'], ['fixed', 'Belirli aralık']]} /></Field>
          </div>
          {gen.speed === 'fixed' && (
            <div className="adm-row" style={{ marginTop: 12 }}>
              <Field label="Min. (ms)"><Num value={gen.min} step={100} onChange={(v) => setGen({ ...gen, min: v })} /></Field>
              <Field label="Maks. (ms)"><Num value={gen.max} step={100} onChange={(v) => setGen({ ...gen, max: v })} /></Field>
            </div>
          )}
          <p className="adm-sub" style={{ marginTop: 12 }}>İsimler Brezilya takma adlarından (Tião, Bia, Duda, Rafa_Domina…) benzersiz olarak üretilir; seviye 3–23 arası rastgele atanır.</p>
          <div className="adm-row"><div className="adm-sp" /><button className="adm-btn y" onClick={generate}>Üret</button></div>
        </Modal>
      )}
    </>
  );
}

// ================================================================= ODALAR & MAÇLAR
export function Rooms() {
  const { run } = useAdmin();
  const [tab, setTab] = useState('live');
  const [rows, setRows] = useState(null);
  const [tiers, setTiers] = useState([]);
  const [bots, setBots] = useState([]);
  const [create, setCreate] = useState(null);
  const [addBot, setAddBot] = useState(null);
  const [detail, setDetail] = useState(null);
  const load = () => run(() => aapi('matches?status=' + tab)).then((r) => r && setRows(r.matches));
  useEffect(() => { setRows(null); load(); const id = setInterval(load, 5000); return () => clearInterval(id); }, [tab]); // eslint-disable-line
  useEffect(() => { run(() => aapi('tiers')).then((r) => r && setTiers(r.tiers)); run(() => aapi('bots')).then((r) => r && setBots(r.bots)); }, []); // eslint-disable-line

  async function doCreate() {
    const r = await run(() => aapi('matches/room', { method: 'POST', body: { tierId: Number(create.tierId), stake: Number(create.stake), botCount: Number(create.botCount), botIds: create.botIds } }), 'Oda açıldı');
    if (r) { setCreate(null); load(); }
  }
  async function doAddBot() {
    const r = await run(() => aapi(`matches/${addBot.id}/add-bot`, { method: 'POST', body: { seat: addBot.seat === '' ? null : Number(addBot.seat), botId: addBot.botId || null } }));
    if (r) { run(async () => r, `${r.added} masaya oturdu`); setAddBot(null); load(); }
  }
  async function kick(m, seat) { if (confirm('Bu koltuk boşaltılsın mı?')) { await run(() => aapi(`matches/${m.id}/kick`, { method: 'POST', body: { seat } }), 'Koltuk boşaltıldı'); load(); } }
  async function cancel(m) {
    if (!confirm(m.status === 'playing' ? 'Maç iptal edilsin mi? Tüm bahisler komisyonsuz iade edilir.' : 'Oda kapatılsın mı?')) return;
    await run(() => aapi(`matches/${m.id}/cancel`, { method: 'POST' }), 'İşlem tamam'); load();
  }
  async function open(m) { const r = await run(() => aapi('matches/' + m.id)); if (r) setDetail(r.match); }
  const tierById = (id) => tiers.find((t) => t.id === Number(id));
  const freeBots = bots.filter((b) => b.bot_active && !b.busy);
  return (
    <>
      <h1 className="adm-h1">Odalar & Maçlar</h1>
      <p className="adm-sub">Canlı masaları izleyin, bekleyen odalara bot ekleyin veya önceden botlu oda açın (oyuncular geldiğinde masa hazır olur). Liste 5 saniyede bir yenilenir.</p>
      <div className="adm-row" style={{ marginBottom: 12 }}>
        <div className="adm-tabs" style={{ margin: 0 }}>{[['live', 'Canlı'], ['history', 'Geçmiş']].map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>
        <div className="adm-sp" />
        <button className="adm-btn" onClick={() => run(() => aapi('matches/sweep', { method: 'POST' }), 'Takılı masalar ilerletildi').then(load)}>↻ Takılı masaları ilerlet</button>
        <button className="adm-btn y" onClick={() => { const t = tiers.find((x) => !x.is_free) || tiers[0]; setCreate({ tierId: t?.id, stake: t?.stakes?.[0], botCount: 2, botIds: [] }); }}>+ Botlu oda aç</button>
      </div>
      <div className="adm-card adm-wrap" style={{ padding: 0 }}>
        <table className="adm-table">
          <thead><tr><th>Salon</th><th>Bahis / Pot</th><th>Durum</th><th>Koltuklar</th><th>Skor</th><th>Zaman</th><th /></tr></thead>
          <tbody>
            {(rows || []).map((m) => (
              <tr key={m.id}>
                <td><b>{m.tier}</b><div className="adm-mono">{m.id.slice(0, 8)}{m.adminRoom ? ' · admin odası' : ''}{m.is_private ? ' · davetli' : ''}</div></td>
                <td>{m.is_free ? <span className="adm-tag y">Ücretsiz</span> : <>{n0(m.stake)} / {n0(m.pot)}</>}</td>
                <td><Status s={m.status} />{m.result?.type && m.status !== 'annulled' && <div className="adm-mono">{m.result.type}</div>}</td>
                <td style={{ maxWidth: 360 }}>
                  {m.seats.map((s, i) => s ? (
                    <span key={i} className="adm-seat">{s.bot && <span className="adm-tag b" style={{ padding: '0 4px' }}>BOT</span>}{s.name}{s.ready && m.status === 'ready' ? ' ✓' : ''}
                      {tab === 'live' && ['forming', 'ready'].includes(m.status) && <a style={{ color: '#FF8A90', cursor: 'pointer', marginLeft: 4 }} onClick={() => kick(m, i)}>✕</a>}</span>
                  ) : (
                    <span key={i} className="adm-seat empty">boş {tab === 'live' && m.status === 'forming' && <a style={{ color: '#FFD93D', cursor: 'pointer' }} onClick={() => setAddBot({ id: m.id, seat: i, botId: '' })}>+ bot</a>}</span>
                  ))}
                </td>
                <td>{m.scores ? `${m.scores[0]} × ${m.scores[1]}` : '—'}{m.round ? <div className="adm-mono">el {m.round}</div> : null}</td>
                <td>{tab === 'live' ? ago(m.started_at || m.created_at) : dt(m.finished_at)}</td>
                <td><div className="adm-row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                  <button className="adm-btn sm" onClick={() => open(m)}>İncele</button>
                  {tab === 'live' && <button className="adm-btn sm r" onClick={() => cancel(m)}>{m.status === 'playing' ? 'İptal + iade' : 'Kapat'}</button>}
                </div></td>
              </tr>
            ))}
            {rows && !rows.length && <tr><td colSpan={7} style={{ textAlign: 'center', color: '#8891AB', padding: 30 }}>{tab === 'live' ? 'Şu an açık masa yok.' : 'Kayıt yok.'}</td></tr>}
          </tbody>
        </table>
      </div>

      {create && (
        <Modal title="Botlu oda aç" onClose={() => setCreate(null)}>
          <p className="adm-sub">Oda, seçtiğiniz sayıda bot oturmuş halde "oyuncu bekleniyor" durumunda açılır. En az bir koltuk gerçek oyuncu için boş kalır. Gerçek oyuncu gelmezse oda kapanmaz (admin odası).</p>
          <div className="adm-row" style={{ alignItems: 'flex-start' }}>
            <Field label="Salon"><Sel value={create.tierId} onChange={(v) => { const t = tierById(v); setCreate({ ...create, tierId: Number(v), stake: t?.stakes?.[0] }); }} options={tiers.map((t) => [t.id, `${t.name} (${t.mode})`])} /></Field>
            <Field label="Bahis (BC)"><Sel value={create.stake} onChange={(v) => setCreate({ ...create, stake: Number(v) })} options={(tierById(create.tierId)?.stakes || [0]).map((s) => [s, n0(s)])} /></Field>
            <Field label="Bot sayısı" help="Belirli bot seçmezseniz boştaki botlardan seçilir"><Num value={create.botCount} min={0} max={(tierById(create.tierId)?.mode === '1v1' ? 1 : 3)} onChange={(v) => setCreate({ ...create, botCount: v })} /></Field>
          </div>
          <Field label="Belirli botlar (isteğe bağlı)" style={{ marginTop: 12 }}>
            <div className="adm-row" style={{ gap: 6 }}>{freeBots.map((b) => (
              <label key={b.id} className="adm-seat" style={{ cursor: 'pointer', border: create.botIds.includes(b.id) ? '1px solid #FFD93D' : '1px solid transparent' }}>
                <input type="checkbox" checked={create.botIds.includes(b.id)} onChange={(e) => setCreate({ ...create, botIds: e.target.checked ? [...create.botIds, b.id] : create.botIds.filter((x) => x !== b.id) })} />{b.display_name} {'★'.repeat(b.bot_skill)}
              </label>))}</div>
          </Field>
          <div className="adm-row" style={{ marginTop: 16 }}><div className="adm-sp" /><button className="adm-btn y" onClick={doCreate}>Odayı aç</button></div>
        </Modal>
      )}
      {addBot && (
        <Modal title="Koltuğa bot ekle" onClose={() => setAddBot(null)}>
          <div className="adm-row">
            <Field label="Bot"><Sel value={addBot.botId} onChange={(v) => setAddBot({ ...addBot, botId: v })} options={[['', 'Rastgele boştaki bot'], ...freeBots.map((b) => [b.id, `${b.display_name} · beceri ${b.bot_skill}`])]} /></Field>
          </div>
          <div className="adm-row" style={{ marginTop: 16 }}><div className="adm-sp" /><button className="adm-btn y" onClick={doAddBot}>Ekle</button></div>
        </Modal>
      )}
      {detail && (
        <Modal wide title={`Maç ${detail.id.slice(0, 8)} · ${tierById(detail.tier_id)?.name || ''}`} onClose={() => setDetail(null)}>
          <div className="adm-row" style={{ marginBottom: 10 }}><Status s={detail.status} /><span>Bahis {n0(detail.stake)} · Pot {n0(detail.pot)} · Komisyon %{detail.commission_pct}</span><span className="adm-mono">v{detail.version}</span></div>
          {detail.state && (
            <div className="adm-card" style={{ marginBottom: 10 }}>
              <h3>Eller (sadece admin görür)</h3>
              {detail.seats.map((s, i) => <div key={i} className="adm-row" style={{ gap: 8, marginBottom: 4 }}><b style={{ width: 140 }}>{s?.name}{s?.bot ? ' (BOT)' : ''}</b><span className="adm-mono">{(detail.state.hands?.[i] || []).map((t) => `[${t[0]}|${t[1]}]`).join(' ')}</span></div>)}
              <div className="adm-mono" style={{ marginTop: 8 }}>Masa: {(detail.state.chain || []).map((t) => `[${t.a}|${t.b}]`).join(' ')}</div>
            </div>
          )}
          <textarea className="adm-ta" style={{ minHeight: 260 }} readOnly value={JSON.stringify({ seats: detail.seats, result: detail.result, meta: { ...detail.meta, fill: undefined } }, null, 2)} />
        </Modal>
      )}
    </>
  );
}

// ================================================================= SALONLAR
export function Tiers() {
  const { run } = useAdmin();
  const [tiers, setTiers] = useState(null);
  const [edit, setEdit] = useState(null);
  const load = () => run(() => aapi('tiers')).then((r) => r && setTiers(r.tiers));
  useEffect(() => { load(); }, []); // eslint-disable-line
  async function save() {
    const t = edit;
    const body = { ...t, stakes: String(t.stakes).split(/[,\s]+/).filter(Boolean).map(Number) };
    delete body.id; delete body.created_at;
    const r = await run(() => (t.id ? aapi('tiers/' + t.id, { method: 'PATCH', body }) : aapi('tiers', { method: 'POST', body })), 'Salon kaydedildi');
    if (r) { setEdit(null); load(); }
  }
  return (
    <>
      <h1 className="adm-h1">Salonlar (masa türleri)</h1>
      <p className="adm-sub">Oyuncunun "Salas" ekranında gördüğü masa türleri. Bahis seçenekleri, hedef puan, beraberlik kuralı ve bu salona bot oturup oturamayacağı buradan ayarlanır.</p>
      <div className="adm-row" style={{ marginBottom: 12 }}><div className="adm-sp" /><button className="adm-btn y" onClick={() => setEdit({ name: '', mode: '2v2', stakes: '100, 250', target: 200, tie_rule: 'nao_fechou', saida66: 'first', turn_seconds: 20, is_free: false, vip_min_level: 0, bot_allowed: true, active: true, sort: 10, subtitle: '' })}>+ Yeni salon</button></div>
      <div className="adm-card adm-wrap" style={{ padding: 0 }}>
        <table className="adm-table">
          <thead><tr><th>Sıra</th><th>İsim</th><th>Mod</th><th>Bahisler (BC)</th><th>Hedef</th><th>Beraberlik</th><th>Tur süresi</th><th>Bot</th><th>VIP</th><th>Durum</th><th /></tr></thead>
          <tbody>{(tiers || []).map((t) => (
            <tr key={t.id}>
              <td>{t.sort}</td><td><b>{t.name}</b>{t.is_free && <span className="adm-tag y" style={{ marginLeft: 6 }}>Ücretsiz</span>}</td><td>{t.mode}</td>
              <td>{(t.stakes || []).map(n0).join(' · ')}</td><td>{t.target}</td><td>{t.tie_rule === 'anula' ? 'El iptal' : 'Kapatmayan kazanır'}</td>
              <td>{t.turn_seconds} sn</td><td>{t.bot_allowed ? <span className="adm-tag g">İzinli</span> : <span className="adm-tag r">Kapalı</span>}</td>
              <td>{t.vip_min_level ? `Sv. ${t.vip_min_level}+` : '—'}</td><td>{t.active ? <span className="adm-tag g">Açık</span> : <span className="adm-tag">Gizli</span>}</td>
              <td><button className="adm-btn sm" onClick={() => setEdit({ ...t, stakes: (t.stakes || []).join(', ') })}>Düzenle</button></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      {edit && (
        <Modal title={edit.id ? 'Salonu düzenle' : 'Yeni salon'} onClose={() => setEdit(null)}>
          <div className="adm-row" style={{ alignItems: 'flex-start' }}>
            <Field label="İsim (oyuncu görür, Portekizce)"><Txt value={edit.name} onChange={(v) => setEdit({ ...edit, name: v })} /></Field>
            <Field label="Mod"><Sel value={edit.mode} onChange={(v) => setEdit({ ...edit, mode: v })} options={[['2v2', '2v2 (eşli, 4 kişi)'], ['1v1', '1v1 (2 kişi, çekme destesi var)']]} /></Field>
            <Field label="Bahis seçenekleri" help="Virgülle ayırın: 100, 250, 500"><Txt value={edit.stakes} onChange={(v) => setEdit({ ...edit, stakes: v })} /></Field>
          </div>
          <div className="adm-row" style={{ alignItems: 'flex-start', marginTop: 12 }}>
            <Field label="Hedef puan"><Num value={edit.target} onChange={(v) => setEdit({ ...edit, target: v })} /></Field>
            <Field label="Beraberlik kuralı (kapanan oyunda)"><Sel value={edit.tie_rule} onChange={(v) => setEdit({ ...edit, tie_rule: v })} options={[['nao_fechou', 'Kapatmayan takım kazanır'], ['anula', 'El iptal edilir (Nordeste)']]} /></Field>
            <Field label="6-6 ile açılış"><Sel value={edit.saida66} onChange={(v) => setEdit({ ...edit, saida66: v })} options={[['first', 'Sadece ilk elde'], ['always', 'Her elde']]} /></Field>
          </div>
          <div className="adm-row" style={{ alignItems: 'flex-start', marginTop: 12 }}>
            <Field label="Tur süresi (sn)"><Num value={edit.turn_seconds} onChange={(v) => setEdit({ ...edit, turn_seconds: v })} /></Field>
            <Field label="VIP min. seviye" help="0 = herkese açık"><Num value={edit.vip_min_level} onChange={(v) => setEdit({ ...edit, vip_min_level: v })} /></Field>
            <Field label="Sıralama"><Num value={edit.sort} onChange={(v) => setEdit({ ...edit, sort: v })} /></Field>
          </div>
          <div className="adm-row" style={{ gap: 18, marginTop: 14 }}>
            <Bool value={edit.bot_allowed} onChange={(v) => setEdit({ ...edit, bot_allowed: v })} label="Bu salonda bot oturabilir" />
            <Bool value={edit.is_free} onChange={(v) => setEdit({ ...edit, is_free: v })} label="Ücretsiz (tanıtım masası, oyuncu başına 1 kez)" />
            <Bool value={edit.active} onChange={(v) => setEdit({ ...edit, active: v })} label="Uygulamada göster" />
          </div>
          <div className="adm-row" style={{ marginTop: 18 }}><div className="adm-sp" /><button className="adm-btn y" onClick={save}>Kaydet</button></div>
        </Modal>
      )}
    </>
  );
}
