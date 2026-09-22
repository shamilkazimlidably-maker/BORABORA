import { useEffect, useState } from 'react';
import { useApp } from '../AppContext';
import { Avatar, Bar, BotTag, Btn, Confetti, GlossIcon, Icon, Onca, TopBar } from '../ui';
import { api } from '../../lib/client/api';
import { fmtBC } from '../../lib/format';
import { sfx } from '../../lib/client/sound';

function timeLeft(iso) {
  if (!iso) return null;
  const ms = Date.parse(iso) - Date.now();
  if (ms <= 0) return 'expirou';
  const h = Math.floor(ms / 3600000);
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  return `${h}h ${Math.floor((ms % 3600000) / 60000)}min`;
}

function MissionRow({ m, onClaim }) {
  const done = m.status === 'completed';
  const claimed = m.status === 'claimed';
  return (
    <div className="list-row" style={{ border: done ? '1px solid rgba(61,219,95,.5)' : undefined, opacity: claimed ? 0.6 : 1 }}>
      <GlossIcon name={m.icon || 'star'} size={40} />
      <div className="grow col" style={{ gap: 5 }}>
        <div className="row"><b style={{ fontSize: 14 }} className="grow">{m.title}</b>{m.scope === 'level' && <span className="tag flat p">#{m.chain + 1}</span>}</div>
        <Bar value={m.progress} max={m.target} small green={done || claimed} />
        <div className="row"><span className="tiny grow">{fmtBC(m.progress)}/{fmtBC(m.target)}{m.expires_at && !claimed ? ` · ${timeLeft(m.expires_at)}` : ''}</span>
          <span className="tiny yellow">{m.reward_bc ? `${fmtBC(m.reward_bc)} BC` : ''}{m.reward_bc && m.reward_xp ? ' · ' : ''}{m.reward_xp ? `+${m.reward_xp} XP` : ''}</span></div>
      </div>
      {done ? <Btn size="xs" kind="g" onClick={() => onClaim(m)}>Pegar</Btn> : claimed ? <Icon name="check" color="#3DDB5F" stroke={3} /> : null}
    </div>
  );
}

export function Recompensas({ tab: tab0 = 'diarias' }) {
  const { me, settings, go, toast, setMe, unread } = useApp();
  const [tab, setTab] = useState(tab0);
  const [d, setD] = useState(null);
  const [celebrate, setCelebrate] = useState(null);
  const load = () => api('rewards').then((r) => { setD(r); setMe(r.me); }).catch((e) => toast(e.message, 'error'));
  useEffect(() => { load(); }, []); // eslint-disable-line
  async function claim(m) {
    try {
      const r = await api('rewards', { method: 'POST', body: { action: 'claim', id: m.id } });
      sfx.coin(); setMe(r.me); setD((x) => ({ ...x, missions: r.missions, me: r.me }));
      if (r.levelUp) { sfx.level(); setCelebrate(r.levelUp); } else toast(`+${fmtBC(r.reward_bc)} BC · +${r.reward_xp} XP`);
    } catch (e) { toast(e.message, 'error'); }
  }
  async function daily() {
    try { const r = await api('rewards', { method: 'POST', body: { action: 'daily' } }); sfx.coin(); toast(`+${fmtBC(r.amount)} BC`); setMe(r.me); load(); } catch (e) { toast(e.message, 'error'); }
  }
  const L = me.levelInfo;
  const ms = d?.missions || [];
  const ready = ms.filter((m) => m.status === 'completed').length;
  const dy = me.daily;
  return (
    <div className="screen">
      <TopBar me={me} onDeposit={() => go('depositar')} onBell={() => go('notificacoes')} unread={unread} />
      <h1 className="h1">Recompensas</h1>
      <div className="card col" style={{ gap: 8 }}>
        <div className="row"><span className="display" style={{ fontSize: 30, color: 'var(--yellow-500)' }}>{L.level}</span><div className="col grow" style={{ gap: 0 }}><b>Nível {L.level} · {L.tier.name}</b><span className="cap">{fmtBC(L.xp - L.from)} / {fmtBC(L.to - L.from)} XP</span></div>
          {L.tier.next && <span className="cap">Nível {L.tier.nextLevel}: {L.tier.next}</span>}</div>
        <Bar value={L.xp - L.from} max={L.to - L.from} />
        <span className="tiny">Cada nível paga bônus e libera uma nova missão de nível — a cadeia não acaba.</span>
      </div>
      <div className="chips">
        {[['diarias', 'Diárias'], ['missoes', `Missões${ready ? ` (${ready})` : ''}`], ['niveis', 'Níveis'], ['conquistas', 'Conquistas']].map(([k, l]) => <button key={k} className={`chip ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>{l}</button>)}
      </div>
      {tab === 'diarias' && (
        <div className="card col" style={{ gap: 12 }}>
          <div className="row"><GlossIcon name="fire" /><div className="grow col" style={{ gap: 2 }}><b>{dy.streak ? `Sequência de ${dy.streak} dia${dy.streak > 1 ? 's' : ''}` : 'Comece sua sequência'}</b><span className="cap">Volte todo dia: o prêmio cresce até o 7º dia</span></div></div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
            {dy.rewards.map((r, i) => {
              const day = i + 1;
              const done = day <= dy.streak && (dy.claimedToday || day < dy.nextDay);
              const next = !dy.claimedToday && day === dy.nextDay;
              return (
                <div key={i} className="col center" style={{ alignItems: 'center', gap: 4, padding: '10px 4px', borderRadius: 16, gridColumn: day === 7 ? 'span 2' : undefined,
                  background: next ? 'rgba(255,217,61,.14)' : 'var(--surface-2)', border: next ? '1px solid rgba(255,217,61,.7)' : '1px solid var(--stroke)', opacity: done ? 0.55 : 1 }}>
                  <span className="tiny">DIA {day}</span>{done ? <Icon name="check" color="#3DDB5F" stroke={3} /> : <span className={`coin ${day === 7 ? 'lg' : ''}`} />}<b style={{ fontSize: 13 }}>{fmtBC(r)} BC</b>
                </div>
              );
            })}
          </div>
          <Btn size="lg" block disabled={dy.claimedToday} onClick={daily}>{dy.claimedToday ? 'Volte amanhã' : `Pegar ${fmtBC(dy.nextReward)} BC`}</Btn>
          <span className="tiny center">Recompensas entram como {settings?.reward_balance === 'real' ? 'saldo real' : 'bônus (saldo para jogar)'}.</span>
        </div>
      )}
      {tab === 'missoes' && (
        <>
          <h2 className="section-title">De hoje</h2>
          {ms.filter((m) => m.scope === 'daily').map((m) => <MissionRow key={m.id} m={m} onClaim={claim} />)}
          <h2 className="section-title">Da semana</h2>
          {ms.filter((m) => m.scope === 'weekly').map((m) => <MissionRow key={m.id} m={m} onClaim={claim} />)}
          {!d && <div className="empty"><span className="spinner" /></div>}
        </>
      )}
      {tab === 'niveis' && (
        <>
          <p className="cap" style={{ margin: 0 }}>Missões de nível não expiram. Ao resgatar, nasce a próxima — mais difícil e com prêmio maior.</p>
          {ms.filter((m) => m.scope === 'level').map((m) => <MissionRow key={m.id} m={m} onClaim={claim} />)}
          <h2 className="section-title">Faixas</h2>
          <div className="row wrap" style={{ gap: 6 }}>{(settings?.level_tiers || []).map((t) => <span key={t.name} className={`pill ${L.tier.name === t.name ? '' : ''}`} style={{ background: L.tier.name === t.name ? 'rgba(255,217,61,.15)' : 'var(--surface-2)', color: L.tier.name === t.name ? 'var(--yellow-500)' : undefined }}>{t.name} · nv. {t.min}+</span>)}</div>
        </>
      )}
      {tab === 'conquistas' && (
        <>
          {ms.filter((m) => m.scope === 'achievement').map((m) => <MissionRow key={m.id} m={m} onClaim={claim} />)}
          {d && !ms.some((m) => m.scope === 'achievement') && <div className="empty">Conquistas aparecem aqui conforme você joga.</div>}
        </>
      )}
      {celebrate && (
        <div className="overlay" onClick={() => setCelebrate(null)}>
          <Confetti />
          <div className="overlay-inner" style={{ justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
            <Onca pose="celebrate" size={140} />
            <span className="tag y flat">SUBIU DE NÍVEL</span>
            <h1 className="h1" style={{ fontSize: 44, lineHeight: '48px', color: 'var(--yellow-500)' }}>Nível {celebrate.to}</h1>
            <p className="muted">+{fmtBC(celebrate.bonus)} BC de bônus e uma nova missão de nível liberada.</p>
            <Btn onClick={() => setCelebrate(null)}>Bora!</Btn>
          </div>
        </div>
      )}
    </div>
  );
}

export function Ranking() {
  const { back } = useApp();
  const [period, setPeriod] = useState('week');
  const [r, setR] = useState(null);
  useEffect(() => { setR(null); api('ranking?period=' + period).then(setR).catch(() => {}); }, [period]);
  const podium = r?.list?.slice(0, 3) || [];
  return (
    <div className="screen">
      <TopBar onBack={back} title="Ranking das duplas" />
      <div className="seg">{[['week', 'Semana'], ['month', 'Mês'], ['all', 'Geral']].map(([k, l]) => <button key={k} className={period === k ? 'on' : ''} onClick={() => setPeriod(k)}>{l}</button>)}</div>
      {!r && <div className="empty"><span className="spinner" /></div>}
      {podium.length > 0 && (
        <div className="row" style={{ alignItems: 'flex-end', justifyContent: 'center', gap: 10, padding: '10px 0' }}>
          {[1, 0, 2].map((k) => podium[k] && (
            <div key={k} className="col center" style={{ alignItems: 'center', gap: 4, width: 100 }}>
              <Avatar name={podium[k].name} color={podium[k].color} size={k === 0 ? 64 : 50} ring={['#FFD93D', '#C9D1E6', '#D08A4A'][k]} />
              <b style={{ fontSize: 13, maxWidth: 96, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{podium[k].name}</b>
              <span className="cap">{podium[k].wins} vitórias</span>
              <div style={{ width: '100%', height: [70, 50, 40][k], borderRadius: '12px 12px 0 0', background: ['linear-gradient(180deg,#FFE66D,#B98900)', 'linear-gradient(180deg,#E3E8F4,#7A8299)', 'linear-gradient(180deg,#E9A46A,#8A4F22)'][k], display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span className="display" style={{ fontSize: 24, color: '#1A1400' }}>{k + 1}</span></div>
            </div>
          ))}
        </div>
      )}
      <div className="col">
        {r?.list?.slice(3).map((x) => (
          <div key={x.id} className="list-row" style={{ border: x.me ? '1px solid var(--yellow-500)' : undefined }}>
            <span className="display" style={{ width: 28, color: 'var(--text-2)' }}>{x.rank}</span>
            <Avatar name={x.name} color={x.color} size={34} />
            <div className="grow col" style={{ gap: 0 }}><b style={{ fontSize: 14 }}>{x.name} {x.bot && <BotTag />}</b><span className="tiny">nível {x.level} · {x.played} partidas</span></div>
            <b>{x.wins}</b>
          </div>
        ))}
        {r && !r.list.length && <div className="empty"><Onca pose="surprised" size={90} />Ninguém pontuou neste período ainda.</div>}
      </div>
      {r?.mine && (
        <div className="card s2 row" style={{ position: 'sticky', bottom: 90, border: '1px solid rgba(255,217,61,.5)' }}>
          <span className="display" style={{ width: 36, color: 'var(--yellow-500)' }}>{r.mine.rank || '—'}</span>
          <b className="grow">Você</b><span className="cap">{r.mine.wins} vitórias · {r.mine.played} partidas</span>
        </div>
      )}
    </div>
  );
}
