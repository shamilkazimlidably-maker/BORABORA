import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../AppContext';
import { Btn, Icon, Logo, Onca, Tile } from '../ui';
import MatchTable from '../MatchTable';
import { RoundResult } from '../MatchExtras';
import { api } from '../../lib/client/api';
import { createMatch, startRound, applyAction, viewFor, legalMoves } from '../../lib/domino';
import { chooseAction } from '../../lib/botAI';

export function Splash() {
  return (
    <div style={{ minHeight: '100vh', background: 'radial-gradient(120% 70% at 50% 42%, #101830 0%, #070A14 62%)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 22, position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', left: '50%', top: '42%', width: 420, height: 420, margin: '-210px 0 0 -210px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,217,61,0.16) 0%, rgba(255,217,61,0) 62%)' }} />
      <div style={{ animation: 'placeIn .3s ease-out' }}><Logo /></div>
      <div className="display" style={{ fontSize: 46, lineHeight: '46px', textShadow: '0 0 22px rgba(255,217,61,0.45)', animation: 'fade .5s ease-out .12s both' }}>BoraBet</div>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 2, background: 'rgba(255,255,255,.06)' }}>
        <div style={{ height: 2, background: 'linear-gradient(90deg,#F2B705,#FFE66D)', boxShadow: '0 0 12px rgba(255,217,61,.6)', animation: 'grow .6s ease-out forwards', width: 0 }} />
      </div>
      <style>{'@keyframes grow{to{width:100%}}'}</style>
    </div>
  );
}

export function Welcome() {
  const { settings, refreshMe, reset, toast } = useApp();
  const [age, setAge] = useState(false);
  const [terms, setTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true);
    try {
      await api('account', { method: 'POST', body: { action: 'terms', age18: age, terms } });
      const r = await refreshMe();
      reset(r.me.onboarding?.tutorial_done ? 'home' : 'tutorial');
    } catch (e) { toast(e.message, 'error'); setBusy(false); }
  }
  const Check = ({ on, set, children }) => (
    <div className={`check ${on ? 'on' : ''}`} role="checkbox" aria-checked={on} onClick={() => set(!on)}>
      <span className="box">{on && <Icon name="check" size={16} color="#1A1400" stroke={3.4} />}</span><span>{children}</span>
    </div>
  );
  return (
    <div className="screen full" style={{ justifyContent: 'flex-end', background: 'radial-gradient(100% 60% at 50% 20%, #13203F 0%, #070A14 70%)' }}>
      <div className="grow" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Logo /></div>
      <div className="card" style={{ borderRadius: 28, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="row" style={{ justifyContent: 'center', marginTop: -70 }}><Onca pose="idle" size={110} /></div>
        <h1 className="h2 center">Bem-vindo à BoraBet</h1>
        <p className="muted center" style={{ margin: 0, fontSize: 14, lineHeight: '20px' }}>Dominó em dupla. A dupla campeã leva o pote.<br />Rápido, justo, brasileiro.</p>
        <Check on={age} set={setAge}>Tenho 18 anos ou mais</Check>
        <Check on={terms} set={setTerms}>Aceito os <a href="#" onClick={(e) => e.preventDefault()}>Termos</a> e a <a href="#" onClick={(e) => e.preventDefault()}>Política de Privacidade</a></Check>
        <p className="cap" style={{ margin: 0 }}>Você começa com uma mão de treino e uma mesa grátis. Os {settings?.welcome_bonus || 200} BC de boas-vindas são <b style={{ color: 'var(--yellow-500)' }}>saldo para jogar, não para sacar</b>.</p>
        <Btn size="lg" block disabled={!age || !terms || busy} onClick={go}>Bora!</Btn>
        <p className="tiny center" style={{ margin: 0 }}>18+ · Jogue com responsabilidade · {settings?.license_text}<br />Idioma, som e vibração ficam em Configurações.</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Mão de treino (offline, engine real)
const TUT_SEATS = [
  { name: 'Você', color: 'linear-gradient(140deg,#3B7BFF,#8B4DFF)', me: true, team: 0, connected: true },
  { name: 'Bia', color: 'linear-gradient(140deg,#8B4DFF,#3B7BFF)', bot: true, team: 1, connected: true, level: 3 },
  { name: 'Tião', color: 'linear-gradient(140deg,#3DDB5F,#0E7A4B)', bot: true, team: 0, connected: true, level: 3 },
  { name: 'Jow', color: 'linear-gradient(140deg,#F2B705,#F0424B)', bot: true, team: 1, connected: true, level: 3 },
];
const HANDS = 4;
export function Tutorial({ replay }) {
  const { refreshMe, reset, toast, back } = useApp();
  const [game] = useState(() => { const s = createMatch({ mode: '2v2', target: 999 }); startRound(s, 'treino-' + Math.random()); return s; });
  const [, setVer] = useState(0);
  const bump = () => setVer((v) => v + 1);
  const st = game;

  useEffect(() => {
    if (st.phase !== 'playing' || st.turn === 0) return undefined;
    const t = setTimeout(() => {
      const a = chooseAction(st, st.turn, 3);
      if (a) applyAction(st, st.turn, a);
      bump();
    }, 800 + Math.random() * 900);
    return () => clearTimeout(t);
  });

  async function finish() {
    if (replay) { back(); return; }
    try { await api('account', { method: 'POST', body: { action: 'tutorial_done' } }); await refreshMe(); } catch (e) { toast(e.message, 'error'); }
    reset('fork');
  }
  const view = {
    n: 4, seats: TUT_SEATS, mySeat: 0, myTeam: 0, state: viewFor(st, 0), turnDeadline: null, pot: 0, mode: '2v2', isFree: true,
  };
  const legal = st.phase === 'playing' && st.turn === 0 ? legalMoves(st, 0) : [];
  let tip;
  if (st.phase !== 'playing') tip = null;
  else if (st.turn === 0 && !st.chain.length) tip = ['Você sai jogando', st.mustPlay ? `Quem tem a carreta de seis [6|6] começa. Toque nela para abrir a mesa.` : 'Quem venceu a rodada sai com qualquer peça. Livre-se de uma pesada!'];
  else if (st.turn === 0 && legal.length) tip = ['Toque numa peça acesa', 'As peças que servem sobem e brilham. Se ela serve nas duas pontas, toque depois na ponta que brilha.'];
  else if (st.turn === 0) tip = ['Nenhuma serve: passe', 'Sem dorme na dupla: quem não tem, passa. Seu parceiro vê quais pontas te faltam.'];
  else if (st.turn === 2) tip = ['O Tião joga com você', 'Ele senta na sua frente. Quando qualquer um de vocês bate, a dupla soma os pontos dos adversários.'];
  else tip = ['Vez do adversário', 'Repare nos passes: quem passa numa ponta não tem aquele número. Use isso para trancar o jogo deles.'];

  return (
    <div style={{ position: 'relative' }}>
      <MatchTable practice view={view}
        onPlay={(tile, side) => { applyAction(st, 0, { type: 'play', tile, side }); bump(); }}
        onPass={() => { applyAction(st, 0, { type: 'pass' }); bump(); }}
        onDraw={() => {}} onExit={finish} onMenu={finish} onRules={() => {}} />
      {tip && (
        <div className="coach-bubble" style={{ top: 'calc(8px + var(--safe-top))', zIndex: 30, padding: 12 }}>
          <div className="row"><span className="tag flat y">MÃO {Math.min(st.round, HANDS)} DE {HANDS}</span><span className="tiny" style={{ marginLeft: 6 }}>Mão de treino · sem aposta</span><div className="grow" /><button className="link" onClick={finish}>Pular</button></div>
          <div className="display" style={{ fontSize: 16, marginTop: 6 }}>{tip[0]}</div>
          <div className="muted" style={{ fontSize: 13, lineHeight: '18px' }}>{tip[1]}</div>
        </div>
      )}
      {st.phase !== 'playing' && (
        <RoundResult st={viewFor(st, 0)} seats={TUT_SEATS} mySeat={0} myTeam={0}
          nextLabel={st.round >= HANDS ? 'Pronto! Bora pra mesa' : 'Próxima mão'}
          onNext={() => { if (st.round >= HANDS) finish(); else { st.phase = 'playing'; startRound(st, 'treino-' + Math.random()); bump(); } }} />
      )}
    </div>
  );
}

export function Fork() {
  const { tiers, refreshMe, reset, go, toast, me } = useApp();
  const free = tiers.find((t) => t.is_free);
  async function choose(path) {
    try { await api('account', { method: 'POST', body: { action: 'path', value: path } }); await refreshMe(); } catch (e) { toast(e.message, 'error'); return; }
    if (path === 'partner') {
      reset('home');
      if (free && !me.onboarding?.estreia_done) go('parceiro', { tierId: free.id, stake: 0 });
      else go('salas');
    } else if (free && !me.onboarding?.estreia_done) reset('estreia');
    else reset('home');
  }
  const Card = ({ tag, title, body, feats, onClick, rec }) => (
    <div className="card pressable col" style={{ gap: 10, border: rec ? '1px solid rgba(255,217,61,.45)' : undefined }} onClick={onClick}>
      <div className="row"><span className="display" style={{ fontSize: 20 }}>{title}</span><span className={`tag ${rec ? 'y' : ''}`}>{tag}</span><div className="grow" /><Icon name="chevron" color="var(--text-2)" /></div>
      <p className="muted" style={{ margin: 0, fontSize: 14, lineHeight: '20px' }}>{body}</p>
      <div className="row wrap" style={{ gap: 6 }}>{feats.map((f) => <span key={f} className="pill" style={{ background: 'var(--surface-2)' }}>{f}</span>)}</div>
    </div>
  );
  return (
    <div className="screen full">
      <span className="tiny" style={{ marginTop: 20 }}>ÚLTIMO PASSO</span>
      <h1 className="h1">Como você joga?</h1>
      <p className="muted" style={{ margin: 0 }}>Dominó em dupla é dois contra dois. Metade do jogo é quem senta na sua frente.</p>
      <Card rec tag="RECOMENDADO" title="Tenho parceiro" onClick={() => choose('partner')}
        body="Chame alguém que você conhece. Vocês sentam de frente, dividem o pote e aprendem a ler a mão um do outro." feats={['Convite pelo Telegram', 'Dupla fixa no ranking']} />
      <Card tag="MAIS RÁPIDO" title="Jogo sozinho" onClick={() => choose('solo')}
        body="A mesa sorteia seu parceiro. Entra em segundos, e se rolar química vocês jogam de novo." feats={['Espera curta', 'Pode virar dupla fixa']} />
      <p className="cap center">Dá para mudar a qualquer hora. A escolha aqui só decide por onde você entra agora.</p>
    </div>
  );
}

export function Estreia() {
  const { tiers, reset, go, toast, settings, refreshMe } = useApp();
  const free = tiers.find((t) => t.is_free);
  const [busy, setBusy] = useState(false);
  async function enter() {
    setBusy(true);
    try { const r = await api('match/join', { method: 'POST', body: { tierId: free.id, stake: 0 } }); reset('mesa', { id: r.id }); } catch (e) { toast(e.message, 'error'); setBusy(false); }
  }
  async function skip() {
    try { await api('account', { method: 'POST', body: { action: 'skip_estreia' } }); await refreshMe(); } catch (e) { /* noop */ }
    reset('home'); go('salas');
  }
  const Feat = ({ ok, title, body }) => (
    <div className="row" style={{ alignItems: 'flex-start', gap: 12 }}>
      <span style={{ width: 26, height: 26, borderRadius: '50%', flexShrink: 0, background: ok ? 'rgba(61,219,95,.18)' : 'rgba(240,66,75,.18)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={ok ? 'check' : 'close'} size={14} color={ok ? '#3DDB5F' : '#F0424B'} stroke={3} /></span>
      <div className="col" style={{ gap: 2 }}><b style={{ fontSize: 14 }}>{title}</b><span className="cap">{body}</span></div>
    </div>
  );
  if (!free) { reset('home'); return null; }
  return (
    <div className="screen full">
      <div className="row" style={{ justifyContent: 'center', marginTop: 16 }}><span className="tag y">POR NOSSA CONTA</span></div>
      <div className="row" style={{ justifyContent: 'center' }}><Onca pose="celebrate" size={120} /></div>
      <h1 className="h1 center">Sua primeira mesa<br /><span style={{ color: 'var(--yellow-500)' }}>é de graça</span></h1>
      <p className="muted center" style={{ margin: 0 }}>Regra de verdade, aposta zero.</p>
      <div className="card felt col" style={{ gap: 14 }}>
        <div className="row"><div className="col" style={{ gap: 2 }}><span className="display" style={{ fontSize: 20 }}>Mesa de estreia</span><span className="cap" style={{ color: '#CFE6DA' }}>Dupla 2v2 · {free.target} pontos</span></div><div className="grow" />
          <span className="pill">Aposta 0 BC</span></div>
        <Feat ok title={free.bot_allowed ? 'Mesa monta em segundos' : 'Jogadores de verdade'} body={free.bot_allowed ? 'Se faltar gente, completamos com Bot — sempre com a etiqueta BOT.' : 'Três pessoas como você, não bot.'} />
        <Feat ok title="Vale XP e entra no ranking" body="Carroça ×2, lá e lô ×3, fechamento — tudo conta igual." />
        <Feat title="Não vale dinheiro" body="Nem para ganhar, nem para perder. É só para você sentir a mesa." />
      </div>
      <Btn size="lg" block onClick={enter} disabled={busy}>Entrar na mesa de estreia</Btn>
      <Btn kind="s" block onClick={skip}>Ver as mesas com aposta</Btn>
      <p className="cap center">Depois dela você ganha {settings?.welcome_bonus} BC de boas-vindas — saldo para jogar, não para sacar.</p>
    </div>
  );
}
