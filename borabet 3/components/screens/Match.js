import { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '../AppContext';
import { Avatar, BotTag, Btn, Confetti, Icon, Onca, Sheet, TileBack, Toggle, useNow } from '../ui';
import MatchTable from '../MatchTable';
import { RoundResult, CoachMarks } from '../MatchExtras';
import { api } from '../../lib/client/api';
import { subscribeSignal } from '../../lib/client/realtime';
import { fmtBC, mmss, signed } from '../../lib/format';
import { sfx } from '../../lib/client/sound';
import { haptic, shareLink, appLink, setBack } from '../../lib/client/tg';

export default function MatchScreen({ id }) {
  const app = useApp();
  const { me, go, reset, toast, refreshMe } = app;
  const [v, setV] = useState(null);
  const [err, setErr] = useState(null);
  const offset = useRef(0);
  const timer = useRef(null);
  const inflight = useRef(false);
  const alive = useRef(true);
  const startXp = useRef(me?.levelInfo?.xp || 0);
  const [xpGain, setXpGain] = useState(null);
  const [sheet, setSheet] = useState(null); // 'forfeit' | 'menu'
  const [coach, setCoach] = useState(false);
  const refs = { partner: useRef(null), passlog: useRef(null), hand: useRef(null) };
  const prevStatus = useRef(null);

  const apply = useCallback((r) => {
    offset.current = r.serverNow - Date.now();
    setV(r);
    setErr(null);
  }, []);

  const fetchView = useCallback(async () => {
    if (inflight.current) return;
    inflight.current = true;
    try { apply(await api('match/' + id)); } catch (e) { setErr(e); } finally { inflight.current = false; }
  }, [id, apply]);

  // adaptive polling: wake up right after the next server-side event (bot move, timeout…)
  useEffect(() => {
    if (!v) return undefined;
    clearTimeout(timer.current);
    if (['finished', 'annulled', 'cancelled'].includes(v.status)) return undefined;
    const serverNow = Date.now() + offset.current;
    let wait = v.status === 'playing' ? 2500 : 2000;
    if (v.nextTickAt) wait = Math.min(wait, Math.max(150, v.nextTickAt - serverNow + 120));
    if (typeof document !== 'undefined' && document.hidden) wait = 4000;
    timer.current = setTimeout(fetchView, wait);
    return () => clearTimeout(timer.current);
  }, [v, fetchView]);

  useEffect(() => {
    alive.current = true;
    fetchView();
    const unsub = subscribeSignal('match:' + id, () => fetchView());
    const onVis = () => { if (!document.hidden) fetchView(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { alive.current = false; unsub(); document.removeEventListener('visibilitychange', onVis); clearTimeout(timer.current); setBack(null); };
  }, [id, fetchView]);

  const act = useCallback(async (body, quiet) => {
    try { apply(await api('match/' + id, { method: 'POST', body })); }
    catch (e) { if (!quiet) toast(e.message, 'error'); fetchView(); }
  }, [id, apply, toast, fetchView]);

  // transitions: found table, match start, end
  useEffect(() => {
    if (!v) return;
    const p = prevStatus.current;
    if (p && p !== v.status) {
      if (v.status === 'ready') { sfx.found(); haptic('success'); }
      if (v.status === 'finished' || v.status === 'annulled') {
        const won = v.result && v.myTeam === v.result.winnerTeam && v.status === 'finished';
        if (won) { sfx.win(); haptic('success'); } else if (v.status === 'finished') sfx.loss();
        setTimeout(() => refreshMe().then((r) => setXpGain(Math.max(0, r.me.levelInfo.xp - startXp.current))).catch(() => {}), 1200);
      }
    }
    if (!p && (v.status === 'finished' || v.status === 'annulled')) refreshMe().catch(() => {});
    if (v.status === 'playing' && p !== 'playing' && !me.onboarding?.coach_done && v.mode === '2v2') setTimeout(() => setCoach(true), 900);
    prevStatus.current = v.status;
  }, [v, me, refreshMe]);

  // Telegram back → forfeit sheet while playing
  useEffect(() => {
    if (!v) return;
    if (v.status === 'playing') setBack(() => setSheet('forfeit'));
    else setBack(() => leave());
  }, [v?.status]); // eslint-disable-line

  async function leave() {
    if (v && (v.status === 'forming' || v.status === 'ready') && v.mySeat >= 0) await act({ type: 'leave' }, true);
    reset('home');
    go('salas');
  }

  if (err && !v) {
    return <div className="screen full" style={{ alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
      <Onca pose="surprised" size={110} /><h2 className="h2">{err.status === 404 ? 'Mesa não encontrada' : 'Sem conexão com a mesa'}</h2>
      <p className="muted">{err.message}</p><Btn onClick={fetchView}>Tentar de novo</Btn><Btn kind="s" onClick={() => reset('home')}>Voltar ao início</Btn></div>;
  }
  if (!v) return <div className="screen full" style={{ alignItems: 'center', justifyContent: 'center' }}><div className="spinner" /></div>;

  const n = v.seats.length;
  const local = (iso) => (iso ? Date.parse(iso) - offset.current : null);

  if (v.status === 'cancelled' || (v.mySeat < 0 && ['forming', 'ready'].includes(v.status))) {
    return <div className="screen full" style={{ alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
      <Onca pose="sad" size={110} /><h2 className="h2">{v.status === 'cancelled' ? 'Mesa cancelada' : 'Você saiu da mesa'}</h2>
      <p className="muted">Nada foi cobrado do seu saldo.</p><Btn onClick={() => { reset('home'); go('salas'); }}>Ver as salas</Btn></div>;
  }
  if (v.status === 'forming' || v.status === 'ready') return <Lobby v={v} n={n} local={local} act={act} leave={leave} />;
  if (v.status === 'finished' || v.status === 'annulled') return <Result v={v} n={n} xpGain={xpGain} />;

  // playing
  const st = v.state;
  const view = {
    n, seats: v.seats, mySeat: v.mySeat, myTeam: v.myTeam ?? 0, state: st, turnDeadline: local(v.turnDeadline), pot: v.pot, isFree: v.isFree,
    mode: v.mode, turnSeconds: v.tier?.turn_seconds, reactions: (v.reactions || []).map((r) => ({ ...r, at: r.at - offset.current })),
  };
  const iAmReadyNext = v.nextReady?.[v.mySeat];
  return (
    <div style={{ position: 'relative' }}>
      <MatchTable view={view} refs={refs}
        onPlay={(tile, side) => act({ type: 'play', tile, side })}
        onPass={() => act({ type: 'pass' })}
        onDraw={() => act({ type: 'draw' })}
        onReact={(emoji) => act({ type: 'react', emoji }, true)}
        onBank={() => act({ type: 'bank' })}
        onExit={() => setSheet('forfeit')}
        onMenu={() => setSheet('menu')}
        onRules={() => go('regras', { tierId: v.tier?.id })} />
      {st.phase === 'round_end' && (
        <RoundResult st={st} seats={v.seats.map((s, i) => ({ ...s, name: i === v.mySeat ? 'Você' : s.name }))} mySeat={v.mySeat} myTeam={v.myTeam ?? 0}
          phaseDeadline={local(v.phaseDeadline)} waiting={iAmReadyNext} onNext={() => act({ type: 'next' }, true)} />
      )}
      {coach && st.phase === 'playing' && (
        <CoachMarks onDone={() => { setCoach(false); api('account', { method: 'POST', body: { action: 'coach_done' } }).then(() => refreshMe()).catch(() => {}); }}
          steps={[
            { ref: refs.partner, title: 'Esse é seu parceiro', body: 'Ele senta na sua frente e joga com você. Quando um de vocês bate, a dupla soma os pontos.' },
            { ref: refs.hand, title: 'Sua mão', body: 'As peças que servem acendem e sobem. Toque para jogar; se servir nas duas pontas, toque na ponta que brilha.' },
            { ref: null, title: 'Leia os passes', body: 'Quando alguém passa, a mesa mostra os números que faltam para ele. Use isso para trancar os adversários e ajudar o parceiro.' },
          ]} />
      )}
      <ForfeitSheet open={sheet === 'forfeit'} v={v} n={n} onClose={() => setSheet(null)} onConfirm={() => { setSheet(null); act({ type: 'forfeit' }); }} />
      <Sheet open={sheet === 'menu'} onClose={() => setSheet(null)}>
        <div className="col" style={{ gap: 10, paddingTop: 10 }}>
          <span className="display" style={{ fontSize: 20 }}>Opções da mesa</span>
          <div className="list-row"><Icon name="sound" /><b className="grow">Som</b><SoundToggle /></div>
          <button className="list-row press" style={{ color: '#fff', cursor: 'pointer' }} onClick={() => { setSheet(null); go('regras', { tierId: v.tier?.id }); }}><Icon name="help" /><b className="grow" style={{ textAlign: 'left' }}>Regras da mesa</b><Icon name="chevron" /></button>
          <button className="list-row press" style={{ color: '#fff', cursor: 'pointer' }} onClick={() => setCoach(true) || setSheet(null)}><Icon name="star" /><b className="grow" style={{ textAlign: 'left' }}>Ver dicas de novo</b><Icon name="chevron" /></button>
          <Btn kind="r" block onClick={() => setSheet('forfeit')}>Desistir da partida</Btn>
        </div>
      </Sheet>
    </div>
  );
}

function SoundToggle() {
  const { me, setMe } = useApp();
  const on = me.prefs?.sound !== false;
  return <Toggle on={on} onChange={(x) => {
    setMe({ ...me, prefs: { ...me.prefs, sound: x } });
    import('../../lib/client/sound').then((m) => m.setSound(x));
    api('account', { method: 'POST', body: { action: 'prefs', prefs: { sound: x } } }).catch(() => {});
  }} />;
}

function ForfeitSheet({ open, v, n, onClose, onConfirm }) {
  if (!open) return null;
  const me = v.mySeat;
  const myTeam = v.myTeam;
  const stake = v.stake;
  return (
    <Sheet open onClose={onClose}>
      <div className="col" style={{ gap: 12, paddingTop: 8 }}>
        <h2 className="h1">Desistir da partida?</h2>
        <p className="muted" style={{ margin: 0 }}>Sair no meio conta como derrota. {n === 4 ? 'A dupla adversária' : 'O adversário'} leva o pote inteiro.</p>
        {!v.isFree && (
          <div className="card tight col" style={{ gap: 8 }}>
            <span className="tiny">O QUE ACONTECE COM O DINHEIRO</span>
            {v.seats.map((s, i) => (
              <div key={i} className="row">
                <Avatar name={s.name} color={s.color} bot={s.bot} size={28} />
                <div className="grow col" style={{ gap: 0 }}><b style={{ fontSize: 13 }}>{i === me ? 'Você' : s.name}{i !== me && s.team === myTeam ? ', seu parceiro' : ''}</b>
                  {i !== me && s.team === myTeam && <span className="tiny">perde junto com você</span>}</div>
                <b className={s.team === myTeam ? 'red' : 'green'}>{s.team === myTeam ? '−' + fmtBC(stake) : '+' + fmtBC(v.netPerWinner)} BC</b>
              </div>
            ))}
          </div>
        )}
        <p className="cap" style={{ margin: 0 }}>Perder a conexão é diferente: a mesa pausa e você tem <b style={{ color: '#fff' }}>{v.tier?.turn_seconds || 20} segundos</b> na sua vez para voltar.</p>
        <Btn kind="r" block onClick={onConfirm}>{v.isFree ? 'Desistir' : `Desistir e perder ${fmtBC(stake)} BC`}</Btn>
        <Btn kind="g" block onClick={onClose}>Continuar jogando</Btn>
        <p className="tiny center" style={{ margin: 0 }}>Desistências aparecem no seu perfil e afetam o ranking das duplas.</p>
      </div>
    </Sheet>
  );
}

// ---------------------------------------------------------------- Formando a mesa / Sala de espera
function Lobby({ v, n, local, act, leave }) {
  const now = useNow(250);
  const me = v.mySeat;
  const rel = (k) => (me + k) % n;
  const ready = v.status === 'ready';
  const seated = v.seats.filter((s) => s && !s.reserved).length;
  const reserved = v.seats.find((s) => s && s.reserved);
  const partyWait = reserved ? Math.max(0, reserved.reservedUntil - (now + (v.serverNow - Date.now()))) : 0;
  const deadline = local(v.phaseDeadline);
  const waitedS = Math.floor((now - (Date.parse(v.createdAt) - (v.serverNow - Date.now()))) / 1000);
  const Seat = ({ i, label, style }) => {
    const s = v.seats[i];
    const isMe = i === me;
    const empty = !s || s.reserved;
    return (
      <div className="col center" style={{ alignItems: 'center', gap: 4, position: 'absolute', width: 96, ...style }}>
        <div style={{ position: 'relative' }}>
          {empty ? <span className="avatar" style={{ width: 56, height: 56, border: '2px dashed rgba(255,255,255,.25)', background: 'rgba(255,255,255,.04)', animation: 'pulse 1.6s infinite' }}><span className="display" style={{ fontSize: 22, color: 'var(--text-3)' }}>?</span></span>
            : <Avatar name={s.name} color={s.color} bot={s.bot} size={56} ring={isMe ? '#FFD93D' : s.team === v.myTeam ? '#3DDB5F' : undefined} />}
          {ready && s?.ready && <span style={{ position: 'absolute', right: -4, bottom: -4, width: 22, height: 22, borderRadius: '50%', background: 'var(--green-500)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid var(--bg-1)' }}><Icon name="check" size={12} color="#06220F" stroke={3.4} /></span>}
        </div>
        <span className="display" style={{ fontSize: 13 }}>{isMe ? 'VOCÊ' : empty ? (s?.reserved ? 'CONVITE' : '…') : String(s.name).toUpperCase().slice(0, 12)}</span>
        <span className="tiny">{label}{s?.bot ? ' · ' : ''}{s?.bot && <BotTag />}</span>
      </div>
    );
  };
  const title = reserved ? 'Chamando seu parceiro' : ready ? 'Todo mundo sentou' : n === 4 ? 'Procurando sua dupla' : 'Procurando adversário';
  const sub = reserved ? 'Mande o convite: ele senta na sua frente' : ready ? 'começa quando todos estiverem prontos' : 'Parceiro sorteado · quem senta de frente joga com você';
  const missing = ready ? v.seats.map((s, i) => (!s.ready ? (i === me ? 'você' : s.name) : null)).filter(Boolean) : [];
  return (
    <div className="screen full dark" style={{ gap: 14 }}>
      <div className="row"><button className="iconbtn" aria-label="Voltar" onClick={leave}><Icon name="back" color="#fff" /></button><div className="grow center display" style={{ fontSize: 16 }}>{v.tier?.name}</div><div style={{ width: 40 }} /></div>
      <div className="center col" style={{ gap: 4, alignItems: 'center' }}>
        <h1 className="h1">{title}</h1>
        <span className="muted" style={{ fontSize: 14 }}>{sub}</span>
      </div>
      <div className="row" style={{ justifyContent: 'center', gap: 8 }}>
        <span className="pill" style={{ color: 'var(--yellow-500)', borderColor: 'rgba(212,160,23,.45)' }}>{v.isFree ? 'Mesa grátis' : `Pote ${fmtBC(v.pot)} BC`}</span>
        <span className="pill">{seated} de {n} jogadores na mesa</span>
      </div>
      <div className="table-wood" style={{ height: 300 }}>
        <div className="table-felt" style={{ height: '100%' }}>
          {n === 4 ? (<>
            <Seat i={rel(2)} label="parceiro" style={{ left: '50%', marginLeft: -48, top: 14 }} />
            <Seat i={rel(3)} label="oeste" style={{ left: 8, top: 104 }} />
            <Seat i={rel(1)} label="leste" style={{ right: 8, top: 104 }} />
            <Seat i={me} label="sul" style={{ left: '50%', marginLeft: -48, bottom: 12 }} />
          </>) : (<>
            <Seat i={rel(1)} label="adversário" style={{ left: '50%', marginLeft: -48, top: 20 }} />
            <Seat i={me} label="você" style={{ left: '50%', marginLeft: -48, bottom: 16 }} />
          </>)}
          <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', zIndex: 2 }} className="row">
            {ready ? <div className="col center" style={{ alignItems: 'center' }}><span className="display" style={{ fontSize: 34, color: 'var(--yellow-500)' }}>{mmss(Math.max(0, deadline - now))}</span><span className="tiny" style={{ color: '#CFE6DA' }}>↺ anti-horário</span></div>
              : <div className="row" style={{ gap: 4 }}>{[0, 1, 2].map((k) => <div key={k} className="shuffle-tile" style={{ animationDelay: k * 0.15 + 's' }}><TileBack u={18} /></div>)}</div>}
          </div>
        </div>
      </div>
      {ready && n === 4 && (
        <div className="row" style={{ gap: 8 }}>
          {[v.myTeam, 1 - v.myTeam].map((t) => (
            <div key={t} className="card tight grow col" style={{ gap: 2, border: t === v.myTeam ? '1px solid rgba(61,219,95,.35)' : undefined }}>
              <span className="tiny" style={{ color: t === v.myTeam ? 'var(--green-500)' : undefined }}>{t === v.myTeam ? 'NÓS' : 'ELES'}</span>
              <b style={{ fontSize: 13 }}>{v.seats.map((s, i) => (s.team === t ? (i === me ? 'Você' : s.name) : null)).filter(Boolean).join(' + ')}</b>
            </div>
          ))}
        </div>
      )}
      {reserved && (
        <div className="card col center" style={{ alignItems: 'center', gap: 8 }}>
          <span className="display" style={{ fontSize: 28, color: 'var(--yellow-500)' }}>{mmss(partyWait)}</span>
          <span className="cap">Seu parceiro tem 2 minutos para aceitar</span>
          <Btn block onClick={() => shareLink(appLink('p_' + v.inviteCode), `Bora jogar dominó em dupla comigo na ${v.tier?.name}?`)}><Icon name="send" size={16} color="#1A1400" />Convidar no Telegram</Btn>
        </div>
      )}
      <div className="grow" />
      {ready ? (
        <>
          {!v.isFree && <p className="cap center" style={{ margin: 0 }}>{fmtBC(v.stake)} BC reservados do seu saldo · sai de vez só quando a primeira peça cair</p>}
          <Btn size="lg" block kind="g" disabled={v.seats[me]?.ready} onClick={() => { haptic('medium'); act({ type: 'ready' }); }}>{v.seats[me]?.ready ? 'Aguardando os outros…' : 'Estou pronto'}</Btn>
          <p className="cap center" style={{ margin: 0 }}>{missing.length ? `Faltam ${missing.join(' e ')}. ` : ''}Se alguém sair agora, ninguém perde nada.</p>
        </>
      ) : (
        <>
          <div className="row" style={{ gap: 8 }}>
            <Btn kind="s" className="grow" onClick={leave}>Cancelar busca</Btn>
            {v.tier?.bot_allowed && <Btn className="grow" disabled={!v.canFillBots} onClick={() => act({ type: 'fill_bots' })}>
              {v.canFillBots ? 'Completar com Bot' : `Bot em ${Math.max(0, v.maxWaitS - waitedS)} s`}</Btn>}
          </div>
          <p className="tiny center" style={{ margin: 0 }}>Jogadores Bot aparecem sempre com a etiqueta BOT na mesa.</p>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Fim da partida / Resultado 1v1 / Anulada
function Result({ v, n, xpGain }) {
  const { reset, go, toast, me } = useApp();
  const r = v.result || {};
  const annulled = v.status === 'annulled';
  const won = !annulled && r.winnerTeam === v.myTeam;
  const us = v.myTeam ?? 0;
  const mySeat = v.mySeat;
  const partner = n === 4 ? v.seats[(mySeat + 2) % 4] : null;
  const [showSeeds, setShowSeeds] = useState(false);
  const nameOf = (i) => (i === mySeat ? 'você' : v.seats[i]?.name);
  const teamNames = (t) => v.seats.map((s, i) => (s.team === t ? nameOf(i) : null)).filter(Boolean).join(' + ');
  const reason = annulled ? 'Um jogador de cada dupla caiu e a mesa não pôde continuar. As apostas voltaram.'
    : r.type === 'desistencia' ? `${r.loserSeat === mySeat ? 'Você desistiu' : `${r.loserName} desistiu`} — conta como derrota.`
      : r.type === 'queda' ? `${r.loserSeat === mySeat ? 'Você caiu' : `${r.loserName} caiu`} e não voltou a tempo.`
        : r.type === 'abandono' ? `${r.loserSeat === mySeat ? 'Você' : r.loserName} ficou sem jogar ${3} vezes seguidas.`
          : won ? `Chegaram a ${v.state?.rules?.target || ''} pontos primeiro.` : `${n === 4 ? 'Eles chegaram' : 'O adversário chegou'} a ${v.state?.rules?.target || ''} pontos primeiro.`;
  const headline = annulled ? 'Ninguém perdeu' : won ? (n === 4 ? 'Vitória da dupla!' : 'Você venceu!') : 'Não foi dessa vez';
  const myNet = annulled || v.isFree ? 0 : won ? r.perWinner - v.stake : -v.stake;
  async function again() {
    try { const x = await api('match/join', { method: 'POST', body: { tierId: v.tier.id, stake: v.stake } }); reset('mesa', { id: x.id }); }
    catch (e) { if (e.code === 'insufficient_balance') { reset('home'); go('aposta', { tierId: v.tier.id, insufficient: v.stake }); } else toast(e.message, 'error'); }
  }
  const canRematch = !v.isFree && v.tier;
  return (
    <div className="screen full dark" style={{ gap: 12 }}>
      {won && <Confetti />}
      <div className="row" style={{ justifyContent: 'center', marginTop: 12 }}><Onca pose={annulled ? 'surprised' : won ? 'celebrate' : 'sad'} size={124} /></div>
      {annulled && <div className="row" style={{ justifyContent: 'center' }}><span className="tag flat red">PARTIDA ANULADA</span></div>}
      <h1 className="h1 center" style={{ color: won ? 'var(--yellow-500)' : '#fff' }}>{headline}</h1>
      <p className="muted center" style={{ margin: 0 }}>{reason}</p>
      <div className="card row" style={{ justifyContent: 'space-around' }}>
        <div className="col center" style={{ gap: 2 }}><span className="tiny" style={{ color: 'var(--green-500)' }}>{n === 4 ? 'NÓS' : 'VOCÊ'}</span><span className="display" style={{ fontSize: 32 }}>{r.scores?.[us] ?? 0}</span><span className="tiny">{teamNames(us)}</span></div>
        <span className="display" style={{ fontSize: 20, color: 'var(--text-3)' }}>×</span>
        <div className="col center" style={{ gap: 2 }}><span className="tiny">{n === 4 ? 'ELES' : 'RIVAL'}</span><span className="display" style={{ fontSize: 32 }}>{r.scores?.[1 - us] ?? 0}</span><span className="tiny">{teamNames(1 - us)}</span></div>
      </div>
      {!v.isFree && (
        <div className="card felt col" style={{ gap: 8 }}>
          <span className="cap" style={{ color: '#CFE6DA' }}>{annulled ? `Pote de ${fmtBC(v.pot)} BC devolvido na hora · sem comissão` : won ? `Pote de ${fmtBC(v.pot)} BC − ${v.commissionPct}% de comissão` : `O pote de ${fmtBC(v.pot)} BC ficou com ${n === 4 ? 'eles' : 'o adversário'}`}</span>
          <div className="row"><b className="grow">Você</b><span className="display" style={{ fontSize: 24, color: myNet > 0 ? 'var(--green-500)' : myNet < 0 ? '#FF8A90' : '#fff' }}>{annulled ? '+' + fmtBC(v.stake) : signed(myNet)} BC</span></div>
          {partner && <div className="row"><span className="grow cap" style={{ color: '#CFE6DA' }}>{partner.name}, seu parceiro</span><b>{annulled ? '+' + fmtBC(v.stake) : signed(myNet)} BC</b></div>}
        </div>
      )}
      {v.isFree && <div className="card felt center" style={{ padding: 14 }}><b>Mesa de estreia</b><div className="cap" style={{ color: '#CFE6DA' }}>Valeu XP e ranking. Seu bônus de boas-vindas já está na carteira.</div></div>}
      {(r.history || []).length > 0 && (
        <div className="card tight col" style={{ gap: 8 }}>
          <span className="tiny">RODADA A RODADA</span>
          <div className="row wrap" style={{ gap: 6 }}>
            {r.history.map((h) => (
              <span key={h.round} className="pill" style={{ background: 'var(--surface-2)', color: h.team == null ? 'var(--text-2)' : h.team === us ? 'var(--green-500)' : '#FF8A90' }}>
                R{h.round}{h.type === 'fechamento' ? ' fech' : h.mult > 1 ? ' ×' + h.mult : ''} <b>{h.team == null ? '0' : (h.team === us ? '+' : '−') + h.points}</b>
              </span>
            ))}
          </div>
        </div>
      )}
      {!annulled && (
        <div className="card tight row">
          <span className="tag flat y">XP</span><span className="grow cap">{xpGain == null ? 'Somando…' : `Nível ${me.levelInfo.level} · ${fmtBC(me.levelInfo.xp - me.levelInfo.from)}/${fmtBC(me.levelInfo.to - me.levelInfo.from)}`}</span>
          <b className="yellow">+{xpGain ?? 0} XP</b>
        </div>
      )}
      <button className="link" onClick={() => setShowSeeds(!showSeeds)}>{showSeeds ? 'Ocultar' : 'Verificar'} embaralhamento ({(v.seedLog || []).length} rodadas)</button>
      {showSeeds && (
        <div className="card tight col" style={{ gap: 6, fontSize: 10, wordBreak: 'break-all' }}>
          <span className="cap">Cada rodada foi embaralhada com uma semente secreta; o hash SHA-256 foi fixado antes da rodada começar. Confira: sha256(semente) = hash.</span>
          {(v.seedLog || []).map((s) => <div key={s.round}><b>R{s.round}</b> hash: <span className="dim">{s.hash}</span><br />semente: <span className="dim">{s.seed || '—'}</span></div>)}
        </div>
      )}
      <div className="grow" />
      {canRematch && <Btn size="lg" block onClick={again}>{annulled ? 'Jogar de novo' : n === 4 ? 'Revanche' : 'Revanche'}</Btn>}
      <Btn kind="s" block onClick={() => { reset('home'); go('salas'); }}>Voltar para as salas</Btn>
      {won && !v.isFree && <button className="link" onClick={() => shareLink(appLink('ref_' + me.referralCode), `Ganhei ${fmtBC(r.perWinner)} BC no dominó em dupla na BoraBet! Bora jogar?`)}>Compartilhar vitória</button>}
    </div>
  );
}
export { Lobby, Result };
