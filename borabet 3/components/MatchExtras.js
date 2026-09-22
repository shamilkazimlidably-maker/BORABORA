import { useEffect, useLayoutEffect, useState } from 'react';
import { Btn, Tile, Avatar, BotTag, useNow } from './ui';
import { parseTile, handPips, teamOf } from '../lib/domino';
import { mmss } from '../lib/format';

// Placar da rodada / Jogo fechado
export function RoundResult({ st, seats, mySeat, myTeam = 0, phaseDeadline, onNext, nextLabel = 'Próxima rodada', waiting }) {
  const rr = st.roundResult;
  const now = useNow(500);
  if (!rr) return null;
  const n = st.n;
  const us = myTeam;
  const won = rr.winnerTeam === us;
  const nameOf = (i) => (i === mySeat ? 'Você' : seats[i]?.name || '—');
  const teamName = (t) => (n === 4 ? (t === us ? 'Nós' : 'Eles') : t === us ? 'Você' : seats[t]?.name);
  let badge; let headline; let sub;
  if (rr.type === 'batida') {
    badge = rr.bonus === 'cruzada' ? 'CRUZADA ×' + rr.mult : rr.bonus === 'laelo' ? 'LÁ E LÔ ×' + rr.mult : rr.bonus === 'carroca' ? 'CARROÇA ×' + rr.mult : 'BATIDA';
    headline = rr.batedor === mySeat ? 'Você bateu!' : `${nameOf(rr.batedor)} bateu`;
    sub = `${teamName(rr.winnerTeam)} ${n === 4 ? 'somam' : 'soma'} os pontos que sobraram na mão ${n === 4 ? 'dos adversários' : 'do adversário'}.`;
  } else if (rr.type === 'fechamento') {
    badge = 'JOGO FECHADO';
    headline = rr.tie ? 'Empate no fechamento' : `${teamName(rr.winnerTeam)} ${n === 4 ? 'levam' : 'leva'} a mesa`;
    sub = rr.tie ? `Deu empate: vence quem não fechou (${nameOf(rr.closer)} fechou).` : 'Ninguém podia jogar. Menos pontos na mão vence e leva tudo o que sobrou.';
  } else {
    badge = 'RODADA ANULADA'; headline = 'Empate: rodada anulada'; sub = 'Na Mesa Nordeste, empate no fechamento anula a rodada.';
  }
  const hands = rr.hands || [];
  const left = phaseDeadline ? phaseDeadline - now : null;
  return (
    <div className="overlay">
      <div className="overlay-inner" style={{ justifyContent: 'center' }}>
        <div className="center col" style={{ alignItems: 'center', gap: 6 }}>
          <span className={`tag flat ${won ? '' : 'gray'}`}>{badge}</span>
          <h1 className="h1" style={{ color: rr.winnerTeam == null ? '#fff' : won ? 'var(--green-500)' : '#fff' }}>{headline}</h1>
          <p className="muted" style={{ margin: 0, fontSize: 14 }}>{sub}</p>
        </div>
        {rr.tile && <div className="row" style={{ justifyContent: 'center' }}><Tile a={parseTile(rr.tile)[0]} b={parseTile(rr.tile)[1]} u={34} orientation="h" /></div>}
        <div className="card tight col" style={{ gap: 10 }}>
          {[0, 1].map((t) => (
            <div key={t} className="col" style={{ gap: 6 }}>
              <div className="row"><span className="display" style={{ fontSize: 15, color: t === us ? 'var(--green-500)' : 'var(--text-2)' }}>{teamName(t)}</span><div className="grow" />
                <span className="cap">{rr.teamPips?.[t] ?? 0} pontos na mão</span></div>
              {hands.map((h, i) => (teamOf(i, n) === t ? (
                <div key={i} className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                  <Avatar name={seats[i]?.name} color={seats[i]?.color} bot={seats[i]?.bot} size={22} />
                  <span style={{ fontSize: 12, width: 64, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nameOf(i)}</span>
                  {h.length === 0 ? <span className="cap green">bateu</span> : h.map((id) => { const [a, b] = parseTile(id); return <Tile key={id} a={a} b={b} u={13} />; })}
                  <div className="grow" /><span className="cap">{handPips(h.map(parseTile))}</span>
                </div>) : null))}
            </div>
          ))}
        </div>
        <div className="card tight row" style={{ justifyContent: 'space-between' }}>
          <span className="cap">{rr.type === 'batida' ? `Soma ${rr.base}${rr.mult > 1 ? ` × ${rr.mult}` : ''}` : rr.type === 'fechamento' ? 'Tudo que sobrou' : 'Sem pontos'}</span>
          <span className="display" style={{ fontSize: 26, color: 'var(--yellow-500)' }}>+{rr.points} <span style={{ fontSize: 13 }}>pontos</span></span>
        </div>
        <div className="card tight row" style={{ justifyContent: 'space-around' }}>
          <div className="col center"><span className="tiny">{n === 4 ? 'NÓS' : 'VOCÊ'}</span><span className="display" style={{ fontSize: 24 }}>{st.scores[us]}</span></div>
          <div className="col center"><span className="tiny">meta</span><span className="display" style={{ fontSize: 16, color: 'var(--yellow-500)' }}>{st.rules.target}</span></div>
          <div className="col center"><span className="tiny">{n === 4 ? 'ELES' : 'RIVAL'}</span><span className="display" style={{ fontSize: 24 }}>{st.scores[1 - us]}</span></div>
        </div>
        {onNext && <Btn size="lg" block onClick={onNext} disabled={waiting}>{waiting ? 'Aguardando a mesa…' : nextLabel}{left != null && left > 0 ? ` · ${mmss(left)}` : ''}</Btn>}
      </div>
    </div>
  );
}

// Coach marks: spotlight on a ref + one bubble at a time
export function CoachMarks({ steps, onDone }) {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState(null);
  const step = steps[i];
  useLayoutEffect(() => {
    const el = step?.ref?.current;
    if (!el) { setRect(null); return; }
    const r = el.getBoundingClientRect();
    setRect({ left: r.left - 6, top: r.top - 6, width: r.width + 12, height: r.height + 12 });
  }, [i, step]);
  useEffect(() => { if (!step) onDone?.(); }, [step, onDone]);
  if (!step) return null;
  const below = rect ? rect.top + rect.height + 12 : 120;
  const placeAbove = rect && rect.top > window.innerHeight * 0.55;
  return (
    <>
      {rect ? <div className="coach-hole" style={rect} /> : <div className="backdrop" style={{ zIndex: 70 }} />}
      <div className="coach-bubble" style={placeAbove ? { bottom: window.innerHeight - rect.top + 12 } : { top: below }}>
        <div className="row"><span className="tiny">DICA {i + 1} DE {steps.length}</span><div className="grow" /><button className="link" onClick={onDone}>Pular dicas</button></div>
        <div className="display" style={{ fontSize: 18, margin: '4px 0' }}>{step.title}</div>
        <div className="muted" style={{ fontSize: 14, lineHeight: '20px' }}>{step.body}</div>
        <div className="row" style={{ marginTop: 12, justifyContent: 'flex-end' }}>
          <Btn size="sm" onClick={() => setI(i + 1)}>{i === steps.length - 1 ? 'Bora jogar' : 'Entendi'}</Btn>
        </div>
      </div>
    </>
  );
}

export { BotTag };
