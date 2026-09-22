import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Avatar, BotTag, Icon, Ring, Tile, TileBack, useNow } from './ui';
import { Snake } from './Board';
import { parseTile, isDouble, missingNumbers } from '../lib/domino';
import { fmtBC, mmss } from '../lib/format';
import { sfx } from '../lib/client/sound';
import { haptic } from '../lib/client/tg';

const REACTIONS = ['👍', '😅', '🔥', '😮', '🎲', '👏'];
const DIR = { 1: 'leste', 2: 'norte', 3: 'oeste' };

function useSize(ref) {
  const [size, setSize] = useState({ w: 358, h: 406 });
  useLayoutEffect(() => {
    if (!ref.current) return undefined;
    const el = ref.current;
    const upd = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    upd();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(upd) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [ref]);
  return size;
}

function TileCount({ n }) {
  return <span className="row" style={{ gap: 4, height: 24, padding: '0 8px', borderRadius: 999, background: '#1B2340', border: '1px solid var(--stroke)', flexShrink: 0 }}>
    <span className="mini-back" /><span className="display" style={{ fontSize: 13 }}>{n}</span></span>;
}

// view = { n, seats[], mySeat, state, turnDeadline(ms local), pot, target, reactions[], isFree, mode }
export default function MatchTable({ view, onPlay, onPass, onDraw, onReact, onBank, onExit, onRules, onMenu, refs = {}, practice }) {
  const st = view.state;
  const n = view.n;
  const me = view.mySeat >= 0 ? view.mySeat : 0;
  const now = useNow(250);
  const [sel, setSel] = useState(null);
  const felt = useRef(null);
  const size = useSize(felt);
  const rel = (k) => (me + k) % n;
  const seat = (i) => view.seats[i] || {};
  const myTurn = st.phase === 'playing' && st.turn === me;
  const legal = st.legal || [];
  const remaining = view.turnDeadline ? view.turnDeadline - now : null;
  const turnSecs = view.turnSeconds || 20;

  // sounds / haptics on new plays
  const lastSeq = useRef(st.seq);
  const lastTurn = useRef(null);
  const warned = useRef(false);
  useEffect(() => {
    if (st.seq !== lastSeq.current) {
      if (st.lastPlay && st.lastPlay.seq === st.seq) { sfx.place(); haptic('medium'); } else if (st.seq > lastSeq.current) sfx.pass();
      lastSeq.current = st.seq;
    }
    const key = st.round + ':' + st.turn + ':' + st.seq;
    if (myTurn && lastTurn.current !== key) { lastTurn.current = key; warned.current = false; sfx.turn(); haptic('light'); }
    if (!myTurn) setSel(null);
  }, [st.seq, st.turn, st.round, myTurn, st.lastPlay]);
  useEffect(() => {
    if (myTurn && remaining != null && remaining < 5000 && remaining > 0 && !warned.current) { warned.current = true; sfx.warn(); haptic('warning'); }
  }, [myTurn, remaining]);

  const playableIds = useMemo(() => new Set(legal.map((m) => m.tile)), [legal]);
  const sidesFor = (id) => [...new Set(legal.filter((m) => m.tile === id).map((m) => m.side))];

  function tapTile(id) {
    if (!myTurn || !playableIds.has(id)) return;
    const sides = sidesFor(id);
    const t = parseTile(id);
    const sameResult = sides.length === 2 && st.ends && st.ends[0] === st.ends[1];
    if (sides.length === 1 || sameResult || !st.chain.length) { setSel(null); onPlay(id, sides[0] || 'R'); return; }
    haptic('select');
    setSel(sel === id ? null : id);
    void t;
  }
  function tapEnd(side) { if (sel) { const id = sel; setSel(null); onPlay(id, side); } }

  // pass info (last pass this round)
  const passesThisRound = (st.passLog || []).filter((p) => p.round === st.round);
  const lastPass = passesThisRound[passesThisRound.length - 1];
  const nameOf = (i) => (i === me ? 'Você' : seat(i).name || '—');
  const partner = n === 4 ? rel(2) : null;
  const partnerMissing = partner != null ? missingNumbers(st.passLog || [], partner, st.round) : [];

  const myHand = st.myHand || [];
  const lastTile = myHand.length === 1 ? parseTile(myHand[0]) : null;
  const reactionsFor = (i) => (view.reactions || []).filter((r) => r.seat === i);
  const scoreUs = st.scores[view.myTeam ?? 0] ?? 0;
  const scoreThem = st.scores[1 - (view.myTeam ?? 0)] ?? 0;
  const pausedSeat = st.phase === 'playing' && !seat(st.turn).bot && seat(st.turn).connected === false && st.turn !== me ? st.turn : null;

  const timerRing = (i, size = 38, child) => {
    const active = st.phase === 'playing' && st.turn === i && remaining != null;
    const pct = active ? Math.max(0, remaining / (turnSecs * 1000)) : 0;
    return active ? <Ring size={size + 8} stroke={3} pct={pct} color={remaining < 5000 ? '#F0424B' : '#FFD93D'}>{child}</Ring> : child;
  };

  const SeatTag = ({ i, style }) => {
    const s = seat(i);
    const miss = missingNumbers(st.passLog || [], i, st.round);
    const react = reactionsFor(i);
    return (
      <div className={`seat-tag ${st.turn === i && st.phase === 'playing' ? 'turn' : ''}`} style={{ width: 'calc(50% - 12px)', ...style }}>
        {timerRing(i, 26, <Avatar name={s.name} color={s.color} bot={s.bot} size={26} />)}
        <div className="grow col" style={{ gap: 1 }}>
          <span style={{ fontSize: 11, lineHeight: '14px', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {s.name}{n === 4 ? ` · ${DIR[(i - me + n) % n]}` : ''} {s.bot && <BotTag />}
          </span>
          {miss.length ? <span style={{ fontSize: 9, lineHeight: '12px', fontWeight: 700, color: 'var(--red-500)' }}>PASSOU {miss.join(' e ')}</span>
            : <span style={{ fontSize: 9, lineHeight: '12px', color: 'var(--text-2)' }}>{st.turn === i ? 'pensando…' : rel(1) === i ? 'joga depois de você' : 'nível ' + (s.level || 1)}</span>}
        </div>
        <span className="row" style={{ gap: 3 }}><span className="mini-back" style={{ width: 9, height: 15 }} /><span className="display" style={{ fontSize: 12 }}>{st.handCounts[i]}</span></span>
        {react.map((r) => <span key={r.at} className="floating-emoji" style={{ left: 10, top: -8 }}>{r.emoji}</span>)}
      </div>
    );
  };

  const boneyard = view.mode === '1v1';
  const canBank = myTurn && (view.seats[me]?.banks || 0) > 0 && onBank;

  return (
    <div className="col" style={{ gap: 9, minHeight: '100vh', padding: 'calc(10px + var(--safe-top)) 16px calc(8px + var(--safe-bottom))' }}>
      {/* top bar */}
      <div className="row" style={{ height: 48 }}>
        <button className="iconbtn" aria-label="Sair da partida" onClick={onExit}><Icon name="back" color="#fff" /></button>
        {(
          <div className="grow row" style={{ height: 46, borderRadius: 16, padding: '0 10px', background: 'var(--surface-1)', border: '1px solid rgba(212,160,23,.35)' }}>
            <div className="grow col center" style={{ gap: 0 }}><span style={{ fontSize: 9, letterSpacing: '.1em', fontWeight: 700, color: 'var(--green-500)' }}>{n === 4 ? 'NÓS' : 'VOCÊ'}</span><span className="display" style={{ fontSize: 19 }}>{scoreUs}</span></div>
            <div className="col center" style={{ gap: 1 }}><span className="tiny">meta</span><span style={{ fontSize: 12, fontWeight: 700, color: 'var(--yellow-500)' }}>{st.rules.target}</span></div>
            <div className="grow col center" style={{ gap: 0 }}><span style={{ fontSize: 9, letterSpacing: '.1em', fontWeight: 700, color: 'var(--text-2)' }}>{n === 4 ? 'ELES' : (seat(rel(1)).name || 'RIVAL').toUpperCase().slice(0, 10)}</span><span className="display" style={{ fontSize: 19 }}>{scoreThem}</span></div>
          </div>
        )}
        <button className="iconbtn" aria-label="Opções" onClick={onMenu}><Icon name="more" /></button>
      </div>
      <div className="row" style={{ justifyContent: 'center', gap: 8, marginTop: -2 }}>
        <span className="pill" style={{ height: 22, fontSize: 10, background: 'rgba(255,217,61,.12)', borderColor: 'rgba(212,160,23,.45)', color: 'var(--yellow-500)', fontWeight: 700 }}>
          {practice ? 'Treino · sem aposta' : view.isFree ? 'Mesa de estreia · grátis' : `Pote ${fmtBC(view.pot)} BC`}</span>
        <span className="pill" style={{ height: 22, fontSize: 10, color: 'var(--text-2)' }}>Rodada {st.round}</span>
        <span className="pill" style={{ height: 22, fontSize: 10, color: 'var(--text-2)' }}>↺ anti-horário</span>
      </div>

      {/* partner (2v2) or opponent (1v1) */}
      {n === 4 ? (
        <div ref={refs.partner} className="row" style={{ height: 54, borderRadius: 18, padding: '0 14px', background: 'var(--surface-1)', border: '1px solid rgba(61,219,95,.35)', position: 'relative' }}>
          {timerRing(partner, 38, <Avatar name={seat(partner).name} color={seat(partner).color} bot={seat(partner).bot} size={38} />)}
          <div className="grow col" style={{ gap: 1 }}>
            <div className="row" style={{ gap: 6 }}><span style={{ fontSize: 13, fontWeight: 600 }}>{seat(partner).name}</span><span className="badge partner">PARCEIRO</span>{seat(partner).bot && <BotTag />}</div>
            <span style={{ fontSize: 11, color: 'var(--text-2)' }}>
              {st.turn === partner && st.phase === 'playing' ? 'pensando…' : partnerMissing.length ? `passou na ponta ${partnerMissing.join(' e ')} · rodada ${st.round}` : `na sua frente · ${st.handCounts[partner]} peças na mão`}
            </span>
          </div>
          <TileCount n={st.handCounts[partner]} />
          {reactionsFor(partner).map((r) => <span key={r.at} className="floating-emoji" style={{ left: 18, top: -10 }}>{r.emoji}</span>)}
        </div>
      ) : (
        <div className="row" style={{ height: 64, borderRadius: 18, padding: '0 14px', background: 'var(--surface-1)', border: '1px solid var(--stroke)', position: 'relative' }}>
          {timerRing(rel(1), 44, <Avatar name={seat(rel(1)).name} color={seat(rel(1)).color} bot={seat(rel(1)).bot} size={44} />)}
          <div className="grow col" style={{ gap: 2 }}>
            <div className="row" style={{ gap: 6 }}><span style={{ fontSize: 14, fontWeight: 600 }}>{seat(rel(1)).name}</span><span className="badge vip">Nv. {seat(rel(1)).level || 1}</span>{seat(rel(1)).bot && <BotTag />}</div>
            <span style={{ fontSize: 11, color: 'var(--text-2)' }}>{st.turn === rel(1) ? 'pensando…' : 'aguardando sua jogada'}</span>
          </div>
          <TileCount n={st.handCounts[rel(1)]} />
          {reactionsFor(rel(1)).map((r) => <span key={r.at} className="floating-emoji" style={{ left: 20, top: -10 }}>{r.emoji}</span>)}
        </div>
      )}

      {/* board */}
      <div className="table-wood" style={{ flex: '1 1 auto', minHeight: 330, display: 'flex' }}>
        <div ref={felt} className={`table-felt ${!myTurn ? 'dim' : ''}`} style={{ flex: 1 }}>
          {n === 4 && <><SeatTag i={rel(3)} style={{ left: 8, top: 8 }} /><SeatTag i={rel(1)} style={{ right: 8, top: 8 }} /></>}
          {st.chain.length === 0 && st.phase === 'playing' && (
            <div className="col center" style={{ position: 'absolute', inset: 0, justifyContent: 'center', alignItems: 'center', zIndex: 2, pointerEvents: 'none' }}>
              <span className="display" style={{ fontSize: 16, color: '#D8F0E2', textShadow: '0 2px 8px rgba(0,0,0,.5)' }}>
                {st.turn === me ? (st.mustPlay ? `Saia com a ${st.mustPlay.replace('-', '|')}` : 'Você começa: jogue qualquer peça') : `${nameOf(st.turn)} vai sair${st.mustPlay ? ` com a [${st.mustPlay.replace('-', '|')}]` : ''}`}
              </span>
            </div>
          )}
          <Snake chain={st.chain} origin={st.origin || 0} ends={st.ends} width={size.w} height={size.h} top={n === 4 ? 56 : 8} bottom={boneyard ? 60 : 40}
            highlight={sel ? sidesFor(sel) : null} onEnd={tapEnd} lastIdx={st.lastPlay ? st.chain.findIndex((c) => (c.a + '-' + c.b === st.lastPlay.tile || c.b + '-' + c.a === st.lastPlay.tile)) : -1} />
          {boneyard && (
            <div style={{ position: 'absolute', left: 12, bottom: 12, zIndex: 4 }} className="row">
              <div style={{ position: 'relative', filter: st.canDraw ? 'drop-shadow(0 0 12px rgba(255,217,61,.8))' : 'none' }}>
                <TileBack u={22} /><TileBack u={22} style={{ position: 'absolute', left: 5, top: -4 }} />
                <span className="pill" style={{ position: 'absolute', right: -18, top: -10, height: 20, padding: '0 7px', fontFamily: 'var(--display)' }}>{st.boneyardCount}</span>
              </div>
              {st.canDraw && <button className="btn btn-y btn-sm" style={{ marginLeft: 22 }} onClick={() => { sfx.draw(); haptic('light'); onDraw(); }}>Comprar</button>}
            </div>
          )}
          {!boneyard && lastPass && (
            <div ref={refs.passlog} className="passlog">
              <Icon name="close" size={12} color="#F0424B" stroke={2.6} />
              <span><b style={{ color: '#fff' }}>{nameOf(lastPass.seat)}</b> passou em <b style={{ color: '#fff' }}>{lastPass.ends?.[0]}</b> e <b style={{ color: '#fff' }}>{lastPass.ends?.[1]}</b> — não tem essas pontas</span>
            </div>
          )}
          {pausedSeat != null && (
            <div style={{ position: 'absolute', inset: 0, zIndex: 8, background: 'rgba(7,10,20,.7)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, textAlign: 'center', padding: 20 }}>
              <span className="tag red flat">PARTIDA PAUSADA</span>
              <span className="display" style={{ fontSize: 20 }}>{seat(pausedSeat).name} caiu</span>
              <span className="display" style={{ fontSize: 40, color: 'var(--yellow-500)' }}>{Math.max(0, Math.ceil((remaining || 0) / 1000))}</span>
              <span className="cap">segundos · o relógio só corre na vez dele. Se não voltar, a dupla dele perde.</span>
            </div>
          )}
        </div>
      </div>

      {/* turn bar */}
      <div className="turnbar">
        <span className={`turnline ${myTurn ? '' : 'off'}`} />
        <span className="display" style={{ fontSize: 14, color: myTurn ? 'var(--yellow-500)' : 'var(--text-2)' }}>
          {st.phase !== 'playing' ? 'Fim da rodada' : myTurn ? 'Sua vez' : `Vez de ${nameOf(st.turn)}`}
        </span>
        {remaining != null && st.phase === 'playing' && <span style={{ fontSize: 13, fontWeight: 600, color: myTurn && remaining < 5000 ? 'var(--red-500)' : '#fff' }}>{mmss(remaining)}</span>}
        <div className="grow" />
        {canBank && <button className="chip" style={{ height: 28, fontSize: 12 }} onClick={onBank}>+10s</button>}
        {myTurn && !st.canDraw && (
          <button className="chip" disabled={!st.canPass} onClick={() => st.canPass && onPass()} style={{ height: 28, fontSize: 12, cursor: st.canPass ? 'pointer' : 'not-allowed', color: st.canPass ? '#1A1400' : 'var(--text-3)', background: st.canPass ? 'linear-gradient(180deg,#FFE66D,#F2B705)' : undefined }}>
            {st.canPass ? 'Passar' : 'Passo'}
          </button>
        )}
      </div>
      {myTurn && st.canPass && st.ends && <div className="cap" style={{ marginTop: -6 }}>Você não tem {st.ends[0]}{st.ends[0] !== st.ends[1] ? ` nem ${st.ends[1]}` : ''}. {n === 4 ? 'Seu parceiro vai saber disso.' : ''}</div>}
      {myTurn && lastTile && isDouble(lastTile) && <div className="cap" style={{ marginTop: -6, color: 'var(--yellow-500)' }}>Sua última peça é carroça — batida vale ×{st.rules.multCarroca}</div>}

      {/* reactions */}
      {!practice && (
        <div className="row" style={{ gap: 8 }}>
          {REACTIONS.slice(0, n === 4 ? 4 : 6).map((e) => <button key={e} className="react-btn" aria-label={`Reagir ${e}`} onClick={() => { haptic('light'); onReact?.(e); }}>{e}</button>)}
          <div className="grow" />
          <button className="react-btn" style={{ width: 'auto', padding: '0 12px', fontSize: 12, fontWeight: 600, color: 'var(--text-2)' }} onClick={onRules}>Regras</button>
        </div>
      )}
      {reactionsFor(me).map((r) => <span key={r.at} className="floating-emoji" style={{ position: 'fixed', left: '50%', bottom: 140 }}>{r.emoji}</span>)}

      {/* hand */}
      <div ref={refs.hand} className="hand">
        {myHand.map((id) => {
          const [a, b] = parseTile(id);
          const playable = myTurn && playableIds.has(id);
          return (
            <Tile key={id} a={a} b={b} u={Math.min(44, Math.floor((size.w + 24) / Math.max(7, myHand.length)) - 6)}
              className={`${playable ? 'playable' : myTurn ? 'dead' : ''} ${sel === id ? 'selected' : ''}`}
              onClick={() => tapTile(id)} label={`Peça ${a}-${b}${playable ? ', jogável' : ''}`} />
          );
        })}
      </div>
    </div>
  );
}
