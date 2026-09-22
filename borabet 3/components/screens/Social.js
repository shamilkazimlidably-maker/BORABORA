import { useEffect, useRef, useState } from 'react';
import { useApp } from '../AppContext';
import { Avatar, Bar, BotTag, Btn, GlossIcon, Icon, Onca, TopBar, useInterval } from '../ui';
import { api } from '../../lib/client/api';
import { subscribeSignal } from '../../lib/client/realtime';
import { fmtBC, hhmm, signed, timeAgo } from '../../lib/format';
import { shareLink, appLink, copyText } from '../../lib/client/tg';
import { sfx } from '../../lib/client/sound';

export function Chat() {
  const { back, toast } = useApp();
  const [msgs, setMsgs] = useState([]);
  const [rain, setRain] = useState(null);
  const [text, setText] = useState('');
  const last = useRef(0);
  const box = useRef(null);
  const load = async (full) => {
    try {
      const r = await api('chat' + (!full && last.current ? '?after=' + last.current : ''));
      setRain(r.rain);
      if (r.messages.length || r.deleted?.length) {
        setMsgs((m) => {
          const merged = full ? r.messages : [...m, ...r.messages.filter((x) => !m.some((y) => y.id === x.id))];
          const del = new Set(r.deleted || []);
          return merged.filter((x) => !del.has(x.id)).slice(-120);
        });
        if (r.messages.length) last.current = r.messages[r.messages.length - 1].id;
        setTimeout(() => box.current?.scrollTo(0, box.current.scrollHeight), 30);
      }
    } catch (e) { /* noop */ }
  };
  useEffect(() => { load(true); return subscribeSignal('chat', () => load()); }, []); // eslint-disable-line
  useInterval(() => load(), 5000);
  async function send() {
    const t = text.trim();
    if (!t) return;
    try { const r = await api('chat', { method: 'POST', body: { text: t } }); setText(''); setMsgs((m) => [...m, r.message]); last.current = r.message.id; setTimeout(() => box.current?.scrollTo(0, box.current.scrollHeight), 30); }
    catch (e) { toast(e.message, 'error'); }
  }
  async function grab() {
    try { const r = await api('chat', { method: 'POST', body: { action: 'rain' } }); sfx.coin(); toast(`+${fmtBC(r.amount)} BC da chuva!`); setRain({ ...rain, claimed: true }); } catch (e) { toast(e.message, 'error'); }
  }
  return (
    <div className="screen full" style={{ height: '100vh', paddingBottom: 'calc(12px + var(--safe-bottom))' }}>
      <TopBar onBack={back} title="Chat ao vivo" />
      {rain && !rain.claimed && (
        <div className="card felt row"><span style={{ fontSize: 26 }}>🌧️</span><div className="grow col" style={{ gap: 2 }}><b>Chuva de moedas!</b><span className="cap" style={{ color: '#CFE6DA' }}>Toque em Pegar antes que acabe</span></div><Btn size="sm" onClick={grab}>Pegar</Btn></div>
      )}
      <div ref={box} className="grow col" style={{ overflowY: 'auto', gap: 8, paddingRight: 2 }}>
        {msgs.map((m) => (
          <div key={m.id} className="col" style={{ alignSelf: m.me ? 'flex-end' : 'flex-start', maxWidth: '82%', gap: 2 }}>
            {!m.me && <div className="row" style={{ gap: 6 }}><b style={{ fontSize: 12 }}>{m.name}</b>{m.role && <span className={`badge ${m.role === 'MOD' ? 'mod' : 'vip'}`}>{m.role}</span>}<span className="tiny">{hhmm(m.created_at)}</span></div>}
            <div style={{ padding: '8px 12px', borderRadius: 16, fontSize: 14, lineHeight: '19px', background: m.me ? 'linear-gradient(180deg,#FFE66D,#F2B705)' : m.role === 'MOD' ? 'rgba(61,219,95,.12)' : 'var(--surface-2)', color: m.me ? '#1A1400' : '#fff', border: m.role === 'MOD' ? '1px solid rgba(61,219,95,.35)' : undefined }}>{m.text}</div>
          </div>
        ))}
        {!msgs.length && <div className="empty"><Onca pose="idle" size={80} />Seja o primeiro a falar.</div>}
      </div>
      <div className="row" style={{ gap: 8 }}>
        <input className="input grow" placeholder="Mandar mensagem" maxLength={200} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} />
        <button className="nav-plus" style={{ width: 52, height: 52, margin: 0 }} aria-label="Enviar" onClick={send}><Icon name="send" color="#1A1400" /></button>
      </div>
      <span className="tiny center">Seja gentil. Divulgação, ofensas e golpes dão silêncio no chat.</span>
    </div>
  );
}

export function Amigos() {
  const { back, toast } = useApp();
  const [f, setF] = useState(null);
  useEffect(() => { api('friends').then(setF).catch(() => {}); }, []);
  const link = f ? appLink('ref_' + f.code) : '';
  return (
    <div className="screen">
      <TopBar onBack={back} title="Amigos" />
      <div className="card felt col center" style={{ alignItems: 'center', gap: 8 }}>
        <Onca pose="celebrate" size={100} />
        <h2 className="h2">Chame amigos, ganhem os dois</h2>
        <p className="cap" style={{ color: '#CFE6DA', margin: 0 }}>Quando seu amigo fizer o primeiro depósito, vocês dois ganham {fmtBC(f?.bonus)} BC de bônus.</p>
        <Btn block onClick={() => shareLink(link, 'Bora jogar dominó em dupla comigo na BoraBet?')}><Icon name="send" size={16} color="#1A1400" />Convidar no Telegram</Btn>
        <Btn kind="s" block onClick={() => copyText(link).then(() => toast('Link copiado'))}><Icon name="copy" size={16} />Copiar link</Btn>
      </div>
      {f && (
        <div className="row" style={{ gap: 8 }}>
          {[[f.stats.invited, 'Convidados'], [f.stats.active, 'Depositaram'], [fmtBC(f.stats.earned) + ' BC', 'Você ganhou']].map(([v, l]) => <div key={l} className="card tight grow col center" style={{ gap: 2 }}><span className="display" style={{ fontSize: 18 }}>{v}</span><span className="tiny">{l}</span></div>)}
        </div>
      )}
      <h2 className="section-title">Seus amigos</h2>
      {f?.friends?.map((x, i) => (
        <div key={i} className="list-row"><Avatar name={x.name} color={x.color} size={40} online={x.online} /><div className="grow col" style={{ gap: 2 }}><b>{x.name}</b><span className="cap">{x.online ? 'Online' : 'Offline'} · nível {x.level}</span></div></div>
      ))}
      {f && !f.friends.length && <div className="empty">Ninguém ainda. Mande o link!</div>}
    </div>
  );
}

export function Perfil() {
  const { me, back, go, toast, setMe } = useApp();
  const [p, setP] = useState(null);
  const [edit, setEdit] = useState(false);
  const [name, setName] = useState(me.name);
  useEffect(() => { api('profile').then(setP).catch(() => {}); }, []);
  const L = me.levelInfo;
  const s = me.stats;
  const rate = s.played ? Math.round((s.won / s.played) * 100) : 0;
  async function saveName() {
    try { const r = await api('account', { method: 'POST', body: { action: 'name', name } }); setMe(r.me); setEdit(false); } catch (e) { toast(e.message, 'error'); }
  }
  const ach = p?.achievements || [];
  return (
    <div className="screen">
      <TopBar onBack={back} title="Perfil" />
      <div className="card col center" style={{ alignItems: 'center', gap: 6 }}>
        <div style={{ position: 'relative' }}>
          <Avatar name={me.name} color={me.color} photo={me.photo} size={88} ring="#FFD93D" />
          <span className="display" style={{ position: 'absolute', right: -6, bottom: -4, width: 34, height: 34, borderRadius: '50%', background: 'linear-gradient(180deg,#FFE66D,#F2B705)', color: '#1A1400', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '3px solid var(--surface-1)' }}>{L.level}</span>
        </div>
        {edit ? (
          <div className="row" style={{ width: '100%' }}><input className="input grow" value={name} maxLength={20} onChange={(e) => setName(e.target.value)} /><Btn size="sm" onClick={saveName}>Salvar</Btn></div>
        ) : (
          <button onClick={() => setEdit(true)} style={{ background: 'none', border: 0, color: '#fff', cursor: 'pointer' }} className="row"><span className="display" style={{ fontSize: 24 }}>{me.name}</span><Icon name="settings" size={14} color="var(--text-3)" /></button>
        )}
        {me.username && <span className="cap">@{me.username}</span>}
        <span className="tag flat y">{L.tier.name}</span>
        <div style={{ width: '100%' }} className="col"><Bar value={L.xp - L.from} max={L.to - L.from} /><span className="tiny center">{fmtBC(L.xp - L.from)} / {fmtBC(L.to - L.from)} XP{L.tier.next ? ` · faltam ${fmtBC(L.to - L.xp)} para o nível ${L.level + 1}` : ''}</span></div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
        {[[s.played, 'Partidas'], [rate + '%', 'Vitórias'], [fmtBC(s.biggestPot), 'Maior pote'], [s.streak, 'Sequência']].map(([v, l]) => <div key={l} className="card tight col center" style={{ gap: 2, padding: 10 }}><span className="display" style={{ fontSize: 17 }}>{v}</span><span className="tiny">{l}</span></div>)}
      </div>
      {p?.partners?.length > 0 && (<>
        <h2 className="section-title">Sua dupla</h2>
        {p.partners.slice(0, 1).map((x) => (
          <div key={x.name} className="card row">
            <Avatar name={x.name} color={x.color} bot={x.bot} size={48} />
            <div className="grow col" style={{ gap: 2 }}><div className="row"><b>{x.name}</b>{x.games >= 10 && <span className="badge partner">PARCEIRO FIEL</span>}{x.bot && <BotTag />}</div><span className="cap">{x.games} partidas juntos · {x.rate}% de vitória</span></div>
            <Btn size="xs" onClick={() => go('parceiro', {})}>Chamar</Btn>
          </div>
        ))}
      </>)}
      <div className="row" style={{ gap: 8 }}>
        {[[s.carrocas, 'carroças batidas'], [s.laelos, 'lá e lô'], [s.fechamentos, 'fechamentos']].map(([v, l]) => <div key={l} className="card tight grow col center" style={{ gap: 2 }}><span className="display" style={{ fontSize: 20, color: 'var(--yellow-500)' }}>{v}</span><span className="tiny">{l}</span></div>)}
      </div>
      <div className="row"><h2 className="section-title grow">Conquistas</h2><span className="cap">{ach.filter((a) => a.status !== 'active' || a.level > 0).length} de {ach.length}</span></div>
      <div className="hscroll">
        {ach.map((a) => (
          <div key={a.title} className="card tight col center" style={{ minWidth: 110, alignItems: 'center', gap: 4, opacity: a.level > 0 || a.status !== 'active' ? 1 : 0.5 }}>
            <GlossIcon name={a.icon} size={40} /><span style={{ fontSize: 11, fontWeight: 600 }}>{a.title}</span><Bar value={a.progress} max={a.target} small />
          </div>
        ))}
      </div>
      <div className="row"><h2 className="section-title grow">Últimas partidas</h2></div>
      {(p?.recent || []).map((r) => (
        <div key={r.match_id} className="list-row">
          <span className={`tag flat ${r.result === 'win' ? '' : r.result === 'annulled' ? 'gray' : 'red'}`} style={{ width: 30, textAlign: 'center' }}>{r.result === 'win' ? 'V' : r.result === 'annulled' ? 'AN' : 'D'}</span>
          <div className="grow col" style={{ gap: 2 }}><b style={{ fontSize: 13 }}>{r.tier_name} · {r.result === 'annulled' ? 'anulada' : `${r.score_us} × ${r.score_them}`}</b><span className="cap">{r.partner ? `com ${r.partner} · ` : ''}{timeAgo(r.finished_at)}</span></div>
          <b className={r.net > 0 ? 'green' : ''}>{signed(r.net)}</b>
        </div>
      ))}
      {p && !p.recent.length && <div className="empty">Sua primeira partida vai aparecer aqui.</div>}
      <div className="row" style={{ gap: 8 }}>
        <Btn kind="s" className="grow" onClick={() => shareLink(appLink('ref_' + me.referralCode), `Jogo dominó em dupla na BoraBet: nível ${L.level}, ${s.won} vitórias. Bora?`)}><Icon name="share" size={16} />Compartilhar perfil</Btn>
        <Btn kind="s" className="grow" onClick={() => go('config')}><Icon name="settings" size={16} />Configurações</Btn>
      </div>
    </div>
  );
}

const N_ICON = { match: 'domino', mission: 'star', level: 'crown', reward: 'gift', deposit: 'wallet', withdraw: 'wallet', friend: 'users', system: 'bell' };
export function Notificacoes() {
  const { back, setData } = useApp();
  const [items, setItems] = useState(null);
  useEffect(() => {
    api('notifications').then((r) => setItems(r.items)).catch(() => setItems([]));
    api('account', { method: 'POST', body: { action: 'read_notifications' } }).then(() => setData((d) => ({ ...d, unread: 0 }))).catch(() => {});
  }, [setData]);
  return (
    <div className="screen">
      <TopBar onBack={back} title="Notificações" />
      {!items && <div className="empty"><span className="spinner" /></div>}
      {items?.map((n) => (
        <div key={n.id} className="list-row" style={{ border: !n.read ? '1px solid rgba(255,217,61,.4)' : undefined }}>
          <GlossIcon name={N_ICON[n.kind] || 'star'} size={36} />
          <div className="grow col" style={{ gap: 2 }}><b style={{ fontSize: 14 }}>{n.title}</b><span className="cap">{n.body}</span></div>
          <span className="tiny">{timeAgo(n.created_at)}</span>
        </div>
      ))}
      {items && !items.length && <div className="empty"><Onca pose="idle" size={90} />Nada novo por aqui.</div>}
    </div>
  );
}
