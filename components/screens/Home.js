import { useEffect, useState } from 'react';
import { useApp } from '../AppContext';
import { Avatar, Bar, BotTag, Btn, GlossIcon, Icon, Onca, Tile, TopBar, useInterval } from '../ui';
import { api } from '../../lib/client/api';
import { fmtBC } from '../../lib/format';
import { sfx } from '../../lib/client/sound';
import { subscribeSignal } from '../../lib/client/realtime';

export function quickTier(tiers) {
  const list = tiers.filter((t) => !t.is_free && t.mode === '2v2' && !t.vip_min_level);
  return list.find((t) => /r[aá]pida/i.test(t.name)) || list.sort((a, b) => Math.min(...a.stakes) - Math.min(...b.stakes))[0];
}
export function netPerWinner(stake, n, pct) { return Math.round(((stake * n * (100 - pct)) / 100 / (n === 4 ? 2 : 1)) * 100) / 100; }

export function useQuickJoin() {
  const { me, go, toast } = useApp();
  return async (tier, stake) => {
    if (!tier) return;
    if (!tier.is_free && me.balances.total < stake) { go('aposta', { tierId: tier.id, insufficient: stake }); return; }
    try {
      const r = await api('match/join', { method: 'POST', body: { tierId: tier.id, stake } });
      sfx.found();
      go('mesa', { id: r.id });
    } catch (e) {
      if (e.code === 'insufficient_balance') go('aposta', { tierId: tier.id, insufficient: stake });
      else toast(e.message, 'error');
    }
  };
}

export function Home() {
  const { me, settings, tiers, unread, activeMatch, go, refreshMe, toast } = useApp();
  const [h, setH] = useState(null);
  const quick = quickTier(tiers);
  const join = useQuickJoin();
  const load = () => api('home').then(setH).catch(() => {});
  useEffect(() => { load(); refreshMe().catch(() => {}); return subscribeSignal('lobby', load); }, []); // eslint-disable-line
  useInterval(load, 20000);
  const rtp = 100 - Number(settings?.commission_pct || 10);
  const d = me.daily;

  async function claimDaily() {
    try {
      const r = await api('rewards', { method: 'POST', body: { action: 'daily' } });
      sfx.coin(); toast(`+${fmtBC(r.amount)} BC de recompensa diária`); await refreshMe();
    } catch (e) { toast(e.message, 'error'); }
  }
  const main2v2 = tiers.find((t) => t.mode === '2v2' && !t.is_free && /cl[aá]ssica/i.test(t.name)) || tiers.find((t) => t.mode === '2v2' && !t.is_free);

  return (
    <div className="screen">
      <TopBar me={me} onDeposit={() => go('depositar')} onBell={() => go('notificacoes')} unread={unread} onAvatar={() => go('perfil')} />

      {activeMatch && (
        <div className="card pressable row" style={{ border: '1px solid rgba(61,219,95,.5)' }} onClick={() => go('mesa', { id: activeMatch.id })}>
          <span className="dot pulse" /><div className="grow col" style={{ gap: 2 }}><b>Continuar jogando</b><span className="cap">Sua mesa está te esperando</span></div><Icon name="chevron" />
        </div>
      )}

      <div className="card felt" style={{ borderRadius: 28, padding: 20, minHeight: 190, overflow: 'hidden' }}>
        <div style={{ position: 'absolute', right: -6, top: 6, zIndex: 1 }}><Onca pose="point" size={118} /></div>
        <div className="col" style={{ gap: 6, maxWidth: '64%' }}>
          <span className="display" style={{ fontSize: 30, lineHeight: '30px' }}>Dominó<br /><span style={{ color: 'var(--yellow-500)' }}>em dupla</span></span>
          <span style={{ fontSize: 13, color: '#CFE6DA' }}>A dupla campeã leva o pote</span>
        </div>
        <div className="row" style={{ marginTop: 16, gap: 8 }}>
          <Btn className="glow-pulse" onClick={() => go('salas')}>Jogar</Btn>
          <span className="pill"><span className="dot pulse" />{h ? fmtBC(h.playingNow) : '…'} jogando agora</span>
        </div>
      </div>

      {h?.ticker?.length > 0 && (
        <div className="ticker">
          <div className="ticker-track">
            {[...h.ticker, ...h.ticker].map((t, i) => (
              <span key={i} className="row" style={{ gap: 6, fontSize: 12 }}>
                <Avatar name={t.name} color={t.color} size={20} /><b>{t.name}</b><span className="muted">ganhou</span><b className="green">+{fmtBC(t.amount)} BC</b>
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="card col" style={{ gap: 10 }}>
        <div className="row"><span className="pill" style={{ background: 'rgba(240,66,75,.15)', borderColor: 'rgba(240,66,75,.4)', color: '#FF8A90' }}><span className="dot" style={{ background: '#F0424B', boxShadow: '0 0 8px #F0424B' }} />AO VIVO</span>
          <span className="pill" style={{ background: 'var(--surface-2)' }}>RTP {rtp}%</span></div>
        <div className="row" style={{ gap: 12 }}>
          <div style={{ transform: 'rotate(-10deg)' }}><Tile a={6} b={6} u={26} /></div>
          <div className="grow col" style={{ gap: 2 }}>
            <span className="display" style={{ fontSize: 20 }}>Dominó em dupla</span>
            <span className="cap">2v2 até {main2v2?.target || 200} pontos · carroça ×{settings?.mult_carroca || 2} · lá e lô ×{settings?.mult_laelo || 3}</span>
          </div>
          <Btn size="sm" onClick={() => go('salas', { tab: '2v2' })}>Jogar</Btn>
        </div>
      </div>

      {quick && (
        <div className="card s2 row pressable" onClick={() => join(quick, Math.min(...quick.stakes))}>
          <GlossIcon name="users" size={44} />
          <div className="grow col" style={{ gap: 2 }}>
            <b>Entrar numa dupla agora</b>
            <span className="cap">{quick.name} · {fmtBC(Math.min(...quick.stakes))} BC · {quick.target} pontos · ~{quick.target <= 100 ? 6 : 12} min</span>
          </div>
          <Btn kind="g" size="sm" onClick={(e) => { e.stopPropagation(); join(quick, Math.min(...quick.stakes)); }}>Bora!</Btn>
        </div>
      )}

      <div className="card col" style={{ gap: 10 }}>
        <div className="row">
          <GlossIcon name="fire" size={40} />
          <div className="grow col" style={{ gap: 2 }}>
            <b>{d.streak > 0 ? `Sequência de ${d.streak} dia${d.streak > 1 ? 's' : ''}` : 'Recompensa diária'}</b>
            <span className="cap">{d.claimedToday ? 'Volte amanhã para continuar a sequência' : 'Resgate hoje para não perder'}</span>
          </div>
          <Btn size="sm" disabled={d.claimedToday} onClick={claimDaily}>{d.claimedToday ? 'Feito' : 'Pegar'}</Btn>
        </div>
        <div className="row" style={{ gap: 5 }}>
          {d.rewards.map((r, i) => {
            const day = i + 1;
            const done = day <= d.streak && (d.claimedToday || day < d.nextDay);
            const next = !d.claimedToday && day === d.nextDay;
            return (
              <div key={i} className="grow col center" style={{ gap: 2, padding: '6px 0', borderRadius: 12, background: next ? 'rgba(255,217,61,.14)' : 'var(--surface-2)', border: next ? '1px solid rgba(255,217,61,.6)' : '1px solid transparent', opacity: done ? 0.55 : 1 }}>
                <span className="tiny">D{day}</span>{done ? <Icon name="check" size={14} color="#3DDB5F" stroke={3} /> : <span className="coin sm" style={{ margin: '0 auto' }} />}
                <span style={{ fontSize: 10, fontWeight: 700 }}>{fmtBC(r)}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="row"><h2 className="section-title grow">Missões de hoje</h2><button className="link" onClick={() => go('recompensas', { tab: 'missoes' })}>Ver todas</button></div>
      <div className="col">
        {(h?.missions || []).slice(0, 3).map((m) => (
          <div key={m.id} className="list-row press" onClick={() => go('recompensas', { tab: 'missoes' })}>
            <GlossIcon name={m.icon || 'star'} size={36} />
            <div className="grow col" style={{ gap: 5 }}>
              <div className="row"><b style={{ fontSize: 13 }} className="grow">{m.title}</b><span className="cap">{fmtBC(m.progress)}/{fmtBC(m.target)}</span></div>
              <Bar value={m.progress} max={m.target} small green={m.status !== 'active'} />
              <span className="tiny">{m.status === 'claimed' ? 'Concluída' : m.status === 'completed' ? 'Pronta para resgatar!' : `Ganhe ${fmtBC(m.reward_bc)} BC · +${m.reward_xp} XP`}</span>
            </div>
          </div>
        ))}
        {!h && <div className="empty"><span className="spinner" /></div>}
      </div>

      <div className="row"><h2 className="section-title grow">Ranking das duplas</h2><button className="link" onClick={() => go('ranking')}>Semana</button></div>
      <div className="card tight col" style={{ gap: 6 }}>
        {(h?.leaderboard || []).map((r, i) => (
          <div key={i} className="row" style={{ gap: 10, padding: '4px 2px' }}>
            <span className="display" style={{ width: 20, fontSize: 18, color: ['#FFD93D', '#C9D1E6', '#D08A4A'][i] }}>{i + 1}</span>
            <Avatar name={r.name} color={r.color} size={32} />
            <b className="grow" style={{ fontSize: 14 }}>{r.name}</b>
            <span className="cap">{r.wins} vitórias</span>
          </div>
        ))}
        {h && !h.leaderboard.length && <div className="cap center" style={{ padding: 10 }}>Ninguém pontuou nesta semana ainda. Seja o primeiro!</div>}
      </div>

      <div className="row"><h2 className="section-title grow">Chat ao vivo</h2><button className="link" onClick={() => go('chat')}>Abrir</button></div>
      <div className="card tight col pressable" style={{ gap: 8 }} onClick={() => go('chat')}>
        {(h?.chat || []).map((c) => (
          <div key={c.id} className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
            <b style={{ fontSize: 13 }}>{c.name}</b>{c.role && <span className={`badge ${c.role === 'MOD' ? 'mod' : 'vip'}`}>{c.role}</span>}
            <span className="muted grow" style={{ fontSize: 13 }}>{c.text}</span>
          </div>
        ))}
        {h && !h.chat.length && <span className="cap">Seja o primeiro a falar no chat.</span>}
      </div>

      <div className="card s2 row pressable" onClick={() => go('amigos')}>
        <GlossIcon name="gift" size={40} />
        <div className="grow col" style={{ gap: 2 }}><b>Chame amigos, ganhem os dois</b><span className="cap">{fmtBC(settings?.referral_bonus)} BC de bônus quando seu amigo fizer o primeiro depósito</span></div>
        <Icon name="chevron" color="var(--text-2)" />
      </div>

      <div className="center tiny" style={{ padding: '8px 0 4px', lineHeight: '18px' }}>
        <span className="tag flat red" style={{ marginRight: 6 }}>18+</span>{settings?.license_text}<br />
        <button className="link" onClick={() => go('responsavel')}>Jogo responsável</button> · <button className="link" onClick={() => go('glossario')}>Regras e RTP</button> · <button className="link" onClick={() => go('config')}>Termos</button>
      </div>
    </div>
  );
}

export function Jogos() {
  const { me, settings, tiers, go, unread } = useApp();
  const [h, setH] = useState(null);
  useEffect(() => { api('home').then(setH).catch(() => {}); }, []);
  const rtp = 100 - Number(settings?.commission_pct || 10);
  const v11 = tiers.find((t) => t.mode === '1v1');
  const main = tiers.find((t) => t.mode === '2v2' && !t.is_free && /cl[aá]ssica/i.test(t.name)) || tiers.find((t) => t.mode === '2v2' && !t.is_free);
  return (
    <div className="screen">
      <TopBar me={me} onDeposit={() => go('depositar')} onBell={() => go('notificacoes')} unread={unread} />
      <div><h1 className="h1">Jogos</h1><p className="muted" style={{ margin: '4px 0 0' }}>Poucos jogos, todos bons.</p></div>
      <div className="card felt col" style={{ gap: 12, borderRadius: 28 }}>
        <div className="row"><span className="pill"><span className="dot pulse" />{h ? fmtBC(h.playingNow) : '…'} jogando agora</span><span className="pill">RTP {rtp}%</span>
          <span className="pill" style={{ color: '#FF8A90' }}>AO VIVO</span></div>
        <div className="row" style={{ gap: 14 }}>
          <div className="row" style={{ gap: 4 }}><div style={{ transform: 'rotate(-12deg)' }}><Tile a={6} b={6} u={24} /></div><div style={{ transform: 'rotate(8deg)' }}><Tile a={5} b={3} u={24} /></div></div>
          <div className="grow col" style={{ gap: 2 }}>
            <span className="display" style={{ fontSize: 22 }}>Dominó em dupla</span>
            <span className="cap" style={{ color: '#CFE6DA' }}>2v2 até {main?.target || 200} pontos · a dupla leva o pote · {settings?.commission_pct}% de comissão</span>
          </div>
        </div>
        <Btn block onClick={() => go('salas', { tab: '2v2' })}>Jogar</Btn>
      </div>
      <div className="row" style={{ gap: 8 }}>
        {[[h?.openTables, 'Mesas abertas'], [h?.matchesToday, 'Partidas hoje'], [h ? fmtBC(h.biggestPotToday) + ' BC' : null, 'Maior pote hoje']].map(([v, l]) => (
          <div key={l} className="card tight grow col center" style={{ gap: 2, padding: 12 }}><span className="display" style={{ fontSize: 18 }}>{v ?? '…'}</span><span className="tiny">{l}</span></div>
        ))}
      </div>
      {v11 && (
        <div className="card row pressable" onClick={() => go('salas', { tab: '1v1' })}>
          <GlossIcon name="domino" size={48} />
          <div className="grow col" style={{ gap: 2 }}><span className="display" style={{ fontSize: 18 }}>Dominó 1v1</span><span className="cap">Sem parceiro? Um contra um, com dorme, até {v11.target} pontos</span></div>
          <Icon name="chevron" color="var(--text-2)" />
        </div>
      )}
      <div className="list-row press" onClick={() => go('regras', { tierId: main?.id })}><GlossIcon name="help" size={36} /><div className="grow col" style={{ gap: 2 }}><b>Regras e pontuação</b><span className="cap">Saída 6-6, passo, fechamento, carroça ×2, lá e lô ×3</span></div><Icon name="chevron" color="var(--text-2)" /></div>
      <div className="list-row"><GlossIcon name="shield" size={36} /><div className="grow col" style={{ gap: 2 }}><b>RTP {rtp}% · Jogo justo</b><span className="cap">Embaralhamento verificável por partida: o hash de cada rodada aparece no fim da partida</span></div></div>
      <div className="list-row press" onClick={() => go('glossario')}><GlossIcon name="star" size={36} /><div className="grow col" style={{ gap: 2 }}><b>Glossário</b><span className="cap">carroça, lá e lô, fechamento, passar fome</span></div><Icon name="chevron" color="var(--text-2)" /></div>
    </div>
  );
}

export { BotTag };
