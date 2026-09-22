import { useEffect, useState } from 'react';
import { useApp } from '../AppContext';
import { Avatar, BotTag, Btn, GlossIcon, Icon, Onca, Sheet, Tile, TopBar } from '../ui';
import { api } from '../../lib/client/api';
import { fmtBC, fmtBRL } from '../../lib/format';
import { shareLink, appLink } from '../../lib/client/tg';
import { netPerWinner, useQuickJoin } from './Home';

function ruleChips(t, s) {
  const out = [`${t.target} pontos`, t.mode === '1v1' ? 'Com dorme' : 'Sem dorme'];
  if (t.mode === '1v1') out.push('Compra até poder jogar');
  else {
    out.push(`Carroça ×${s?.mult_carroca || 2}`, `Lá e lô ×${s?.mult_laelo || 3}`);
    if (t.saida66 === 'always') out.push('Saída 6-6');
    out.push(t.tie_rule === 'anula' ? 'Empate: anula a rodada' : 'Empate: quem não fechou');
  }
  out.push(`${t.turn_seconds} s`);
  return out;
}
const Chips = ({ list }) => <div className="row wrap" style={{ gap: 6 }}>{list.map((c) => <span key={c} className="pill" style={{ height: 24, fontSize: 11, background: 'var(--surface-2)' }}>{c}</span>)}</div>;

export function Salas({ tab: tab0 = '2v2' }) {
  const { me, tiers, settings, go, unread } = useApp();
  const [tab, setTab] = useState(tab0);
  const [lobby, setLobby] = useState({});
  useEffect(() => { const l = () => api('lobby').then((r) => setLobby(r.tiers)).catch(() => {}); l(); const id = setInterval(l, 8000); return () => clearInterval(id); }, []);
  const pct = Number(settings?.commission_pct || 10);
  const list = tiers.filter((t) => (tab === '1v1' ? t.mode === '1v1' : t.mode === '2v2' && !t.is_free));
  return (
    <div className="screen">
      <TopBar me={me} onBack={() => go('home')} title="Salas" onDeposit={() => go('depositar')} />
      <div className="chips">
        {[['2v2', 'Dupla 2v2'], ['1v1', '1v1'], ['treino', 'Treino'], ['amigos', 'Amigos']].map(([k, l]) => (
          <button key={k} className={`chip ${tab === k ? 'on' : ''}`} onClick={() => (k === 'treino' ? go('tutorial', { replay: true }) : k === 'amigos' ? go('parceiro', {}) : setTab(k))}>{l}</button>
        ))}
      </div>
      {list.map((t) => {
        const L = lobby[t.id] || {};
        const n = t.mode === '1v1' ? 2 : 4;
        const stake = Math.min(...t.stakes);
        const locked = (me.levelInfo.level || 1) < (t.vip_min_level || 0);
        return (
          <div key={t.id} className={`card col ${t.vip_min_level ? '' : ''}`} style={{ gap: 10, border: t.vip_min_level ? '1px solid rgba(139,77,255,.45)' : undefined }}>
            <div className="row">
              <span className="display" style={{ fontSize: 20 }}>{t.name}</span>
              {t.vip_min_level ? <span className="tag p">VIP</span> : <span className="pill" style={{ height: 22, fontSize: 10, color: '#FF8A90' }}>AO VIVO</span>}
              <div className="grow" />
              <button className="iconbtn" style={{ width: 32, height: 32 }} aria-label="Regras" onClick={() => go('regras', { tierId: t.id })}><Icon name="help" size={16} /></button>
            </div>
            <span className="cap">
              {t.mode === '1v1' ? `Um contra um · com dorme · ${L.open || 0} mesas abertas` : L.best ? `Dupla 2v2 · ${L.best} de ${n} jogadores` : `Dupla 2v2 · ${L.playing || 0} mesas jogando`}
              {t.target <= 100 && t.mode !== '1v1' ? ' · ~6 min' : ''}
            </span>
            <Chips list={ruleChips(t, settings)} />
            <div className="sep" />
            <div className="row">
              <div className="grow col" style={{ gap: 2 }}>
                <span style={{ fontSize: 13 }}>Aposta <b>{fmtBC(stake)}{t.stakes.length > 1 ? '+' : ''} BC</b> · pote {fmtBC(stake * n)} BC</span>
                <span className="cap green">{n === 4 ? 'Cada vencedor leva' : 'Vencedor leva'} {fmtBC(netPerWinner(stake, n, pct))} BC</span>
              </div>
              {locked ? <Btn kind="s" size="sm" disabled><Icon name="lock" size={14} />Nível {t.vip_min_level}</Btn>
                : <Btn size="sm" onClick={() => go('aposta', { tierId: t.id })}>Entrar</Btn>}
            </div>
          </div>
        );
      })}
      {!list.length && <div className="empty"><Onca pose="surprised" size={90} />Nenhuma mesa nesta categoria agora.</div>}
    </div>
  );
}

export function Aposta({ tierId, insufficient }) {
  const { me, tiers, settings, go, back, toast } = useApp();
  const tier = tiers.find((t) => t.id === Number(tierId)) || tiers[0];
  const n = tier.mode === '1v1' ? 2 : 4;
  const pct = Number(settings?.commission_pct || 10);
  const affordable = tier.stakes.filter((s) => s <= me.balances.total);
  const [sel, setSel] = useState(insufficient ? Number(insufficient) : affordable.length ? affordable[affordable.length - 1] : tier.stakes[0]);
  const [lobby, setLobby] = useState(null);
  const [lack, setLack] = useState(insufficient ? Number(insufficient) : null);
  const [busy, setBusy] = useState(false);
  const join = useQuickJoin();
  useEffect(() => { api('lobby').then((r) => setLobby(r.tiers[tier.id] || {})).catch(() => {}); }, [tier.id]);

  async function find() {
    if (me.balances.total < sel) { setLack(sel); return; }
    setBusy(true);
    try { const r = await api('match/join', { method: 'POST', body: { tierId: tier.id, stake: sel } }); go('mesa', { id: r.id }); }
    catch (e) { if (e.code === 'insufficient_balance') setLack(sel); else toast(e.message, 'error'); setBusy(false); }
  }
  const cheaper = tiers.filter((t) => !t.is_free && t.mode === tier.mode && t.id !== tier.id).map((t) => ({ t, s: Math.min(...t.stakes) })).filter((x) => x.s <= me.balances.total).sort((a, b) => a.s - b.s)[0];

  return (
    <div className="screen">
      <TopBar me={me} onBack={back} title={tier.name} />
      <span className="cap" style={{ marginTop: -8 }}>{tier.mode === '1v1' ? 'Um contra um' : 'Dupla 2v2'} · {tier.target} pontos</span>
      <Chips list={ruleChips(tier, settings)} />
      <h2 className="section-title">Quanto cada um aposta</h2>
      <div className="col">
        {tier.stakes.map((s) => (
          <button key={s} onClick={() => setSel(s)} className="list-row press" style={{ border: sel === s ? '1px solid var(--yellow-500)' : undefined, background: sel === s ? 'rgba(255,217,61,.08)' : undefined, color: '#fff', textAlign: 'left', cursor: 'pointer' }}>
            <span className="coin" /><div className="grow col" style={{ gap: 2 }}><span className="display" style={{ fontSize: 18 }}>{fmtBC(s)} BC</span><span className="cap">pote {fmtBC(s * n)} BC · ≈ {fmtBRL(s)}</span></div>
            {s > me.balances.total && <span className="tag flat gray">SALDO</span>}
            {lobby?.byStake?.[String(s)] ? <span className="cap green">{lobby.byStake[String(s)]} mesa(s) formando</span> : null}
          </button>
        ))}
      </div>
      <div className="card felt col" style={{ gap: 6 }}>
        <div className="row"><span className="cap" style={{ color: '#CFE6DA' }}>Pote da mesa</span><div className="grow" /><span className="display" style={{ fontSize: 26, color: 'var(--yellow-500)' }}>{fmtBC(sel * n)} BC</span></div>
        <span className="cap" style={{ color: '#CFE6DA' }}>{n} jogadores × {fmtBC(sel)} · comissão {pct}%</span>
        <span className="display" style={{ fontSize: 16, color: 'var(--green-500)' }}>{n === 4 ? 'Cada vencedor leva' : 'Vencedor leva'} {fmtBC(netPerWinner(sel, n, pct))} BC</span>
      </div>
      <Btn size="lg" block onClick={find} disabled={busy}>{n === 4 ? 'Procurar dupla' : 'Procurar adversário'}</Btn>
      {n === 4 && <Btn kind="s" block onClick={() => go('parceiro', { tierId: tier.id, stake: sel })}><Icon name="users" size={18} />Chamar parceiro</Btn>}
      <Btn kind="s" block onClick={() => go('tutorial', { replay: true })}>Treino <span className="badge bot">BOT</span></Btn>
      <p className="cap center">{lobby ? `${lobby.searching || 0} jogadores procurando agora` : ''}</p>
      <p className="tiny center"><span className="tag flat red" style={{ marginRight: 6 }}>18+</span>Jogue com responsabilidade · <button className="link" onClick={() => go('responsavel')}>defina seus limites</button></p>

      <Sheet open={!!lack} onClose={() => setLack(null)}>
        <div className="col" style={{ gap: 12, alignItems: 'center', textAlign: 'center', paddingTop: 8 }}>
          <Onca pose="point" size={96} />
          <h2 className="h1">Faltam {fmtBC(Math.max(0, (lack || 0) - me.balances.total), 2)} BC</h2>
          <p className="muted" style={{ margin: 0 }}>A {tier.name} cobra {fmtBC(lack)} BC de cada jogador. Você tem {fmtBC(me.balances.total, 2)} BC.</p>
          <div className="row" style={{ width: '100%', gap: 8 }}>
            <div className="card tight grow center"><b>{fmtBC(me.balances.total, 2)} BC</b><div className="tiny">no saldo</div></div>
            <div className="card tight grow center"><b>{fmtBC(lack)} BC</b><div className="tiny">para entrar</div></div>
          </div>
          {cheaper && (
            <div className="card s2 row" style={{ width: '100%', textAlign: 'left' }}>
              <div className="grow col" style={{ gap: 2 }}><div className="row"><b>{cheaper.t.name}</b><span className="tag flat">DÁ PRA ENTRAR</span></div><span className="cap">{fmtBC(cheaper.s)} BC · {cheaper.t.target} pontos</span></div>
              <Btn kind="g" size="sm" onClick={() => { setLack(null); join(cheaper.t, cheaper.s); }}>Entrar</Btn>
            </div>
          )}
          <Btn block size="lg" onClick={() => { setLack(null); go('depositar'); }}>Depositar</Btn>
          <Btn kind="s" block onClick={() => { setLack(null); go('salas'); }}>Ver outras mesas</Btn>
          <p className="tiny"><span className="tag flat red" style={{ marginRight: 6 }}>18+</span>Deposite só o que você pode perder. <button className="link" onClick={() => { setLack(null); go('responsavel'); }}>Defina um limite</button>.</p>
        </div>
      </Sheet>
    </div>
  );
}

export function Parceiro({ tierId, stake }) {
  const { me, tiers, go, back, replace, toast } = useApp();
  const tier = tiers.find((t) => t.id === Number(tierId)) || tiers.find((t) => t.mode === '2v2' && !t.is_free);
  const st = tier?.is_free ? 0 : Number(stake || Math.min(...(tier?.stakes || [0])));
  const [partners, setPartners] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api('profile').then((r) => setPartners(r.partners)).catch(() => setPartners([])); }, []);
  async function invite() {
    setBusy(true);
    try {
      const r = await api('match/join', { method: 'POST', body: { tierId: tier.id, stake: st, party: true } });
      shareLink(appLink('p_' + r.code), `Bora jogar dominó em dupla comigo na ${tier.name}? Senta na minha frente!`);
      replace('mesa', { id: r.id });
    } catch (e) {
      if (e.code === 'insufficient_balance') go('aposta', { tierId: tier.id, insufficient: st });
      else toast(e.message, 'error');
      setBusy(false);
    }
  }
  async function random() {
    try { const r = await api('match/join', { method: 'POST', body: { tierId: tier.id, stake: st } }); replace('mesa', { id: r.id }); } catch (e) { toast(e.message, 'error'); }
  }
  if (!tier) return null;
  return (
    <div className="screen">
      <TopBar onBack={back} title="Chamar parceiro" />
      <span className="cap" style={{ marginTop: -8 }}>{tier.name} · {tier.is_free ? 'grátis' : `${fmtBC(st)} BC cada`}</span>
      <div className="card col center" style={{ alignItems: 'center', gap: 10 }}>
        <div className="row" style={{ gap: 0 }}>
          <Avatar name={me.name} color={me.color} size={56} ring="#3DDB5F" />
          <div style={{ width: 40, height: 2, background: 'repeating-linear-gradient(90deg,#FFD93D 0 6px,transparent 6px 10px)' }} />
          <span className="avatar" style={{ width: 56, height: 56, border: '2px dashed rgba(255,217,61,.6)', background: 'transparent' }}><Icon name="plus" color="#FFD93D" /></span>
        </div>
        <h2 className="h2">Jogue com quem você confia</h2>
        <p className="muted" style={{ margin: 0, fontSize: 14 }}>Em dupla, metade do jogo é o parceiro. Chame o seu e sentem de frente um para o outro.</p>
        <Btn block size="lg" onClick={invite} disabled={busy}><Icon name="send" size={18} color="#1A1400" />Convidar no Telegram</Btn>
        <span className="cap">Ele tem 2 minutos para aceitar. Sua aposta só sai do saldo quando os quatro estiverem prontos.</span>
      </div>
      {partners && partners.length > 0 && (
        <>
          <h2 className="section-title">Seus parceiros</h2>
          {partners.map((p) => (
            <div key={p.name} className="list-row">
              <Avatar name={p.name} color={p.color} bot={p.bot} size={40} />
              <div className="grow col" style={{ gap: 2 }}><div className="row"><b>{p.name}</b>{p.rate >= 55 && <span className="badge partner">{p.rate}% JUNTOS</span>}{p.bot && <BotTag />}</div><span className="cap">{p.games} partidas com você</span></div>
              <Btn size="xs" kind="s" onClick={invite}>Chamar</Btn>
            </div>
          ))}
        </>
      )}
      <Btn kind="s" block onClick={random}>Deixar a mesa sortear meu parceiro</Btn>
    </div>
  );
}

const TERMS = [
  ['Carroça', '×2 AO BATER', 'Qualquer peça igual dos dois lados. A [6|6] é a carroção, a maior da mesa.', [6, 6]],
  ['Batida', null, 'Jogar a última peça da mão e encerrar a rodada. Sua dupla soma os pontos que sobraram com os adversários.', [3, 5]],
  ['Lá e lô', '×3 AO BATER', 'Também chamada de cruzada: bater com uma peça que encaixa nas duas pontas ao mesmo tempo.', [2, 4]],
  ['Fechamento', 'JOGO TRAVADO', 'Ninguém consegue jogar. Todos abrem a mão e a dupla com menos pontos leva tudo o que sobrou na mesa. Deu empate? Na Clássica vence quem não fechou; na Nordeste a rodada é anulada.', [1, 1]],
  ['Passar fome', null, 'Ficar sem peça para as duas pontas e ter que passar. Seu parceiro anota: agora ele sabe dois números que te faltam.', [0, 2]],
  ['Passo falso', 'PERDE A RODADA', 'Passar tendo peça que serve. Aqui o app não deixa: a peça jogável sempre acende na sua mão.', [4, 6]],
  ['Dormir com a peça', null, 'Segurar carroça pesada esperando a batida perfeita e acabar preso com ela quando o jogo fecha.', [5, 5]],
  ['Dorme', 'SÓ NO 1V1', 'Monte de compra. Nas mesas em dupla não existe: as 28 peças ficam todas nas mãos.', [0, 0]],
  ['Saída', null, 'Na primeira rodada sai quem tem a carreta de seis [6|6]. Depois sai quem venceu a rodada anterior.', [6, 6]],
  ['Queda', '20 S', 'Se alguém cai, a mesa pausa. Quando chega a vez dele correm os segundos; se não voltar, a dupla dele perde.', [1, 2]],
];
export function Glossario() {
  const { back } = useApp();
  const [qq, setQ] = useState('');
  const list = TERMS.filter(([t, , d]) => (t + d).toLowerCase().includes(qq.toLowerCase()));
  return (
    <div className="screen">
      <TopBar onBack={back} title="Glossário da mesa" />
      <p className="muted" style={{ margin: 0 }}>O que a rapaziada fala na mesa e o que cada coisa vale no BoraBet.</p>
      <input className="input" placeholder="Buscar termo" value={qq} onChange={(e) => setQ(e.target.value)} />
      {list.map(([t, tag, d, tile]) => (
        <div key={t} className="card tight row" style={{ alignItems: 'flex-start', gap: 12 }}>
          <Tile a={tile[0]} b={tile[1]} u={20} />
          <div className="col grow" style={{ gap: 4 }}><div className="row"><span className="display" style={{ fontSize: 17 }}>{t}</span>{tag && <span className="tag flat y">{tag}</span>}</div><span className="muted" style={{ fontSize: 13, lineHeight: '19px' }}>{d}</span></div>
        </div>
      ))}
    </div>
  );
}

export function Regras({ tierId }) {
  const { tiers, settings, back, go } = useApp();
  const t = tiers.find((x) => x.id === Number(tierId)) || tiers.find((x) => x.mode === '2v2' && !x.is_free) || tiers[0];
  const n = t.mode === '1v1' ? 2 : 4;
  const stake = Math.min(...t.stakes);
  const pct = Number(settings?.commission_pct || 10);
  const Sec = ({ title, children }) => <div className="card col" style={{ gap: 10 }}><span className="display" style={{ fontSize: 18 }}>{title}</span>{children}</div>;
  const Item = ({ h, children }) => <div className="col" style={{ gap: 3 }}><b style={{ fontSize: 14 }}>{h}</b><span className="muted" style={{ fontSize: 13, lineHeight: '19px' }}>{children}</span></div>;
  return (
    <div className="screen">
      <TopBar onBack={back} title="Regras" />
      <div><h1 className="h2">Regras da {t.name}</h1><span className="cap">{n === 4 ? 'Dupla 2v2' : '1v1'} · {t.target} pontos · {t.is_free ? 'grátis' : `${fmtBC(stake)} BC por jogador`}</span></div>
      <Sec title="Como a mesa funciona">
        {n === 4 ? <Item h="Quatro jogadores, duas duplas">Parceiros de frente um para o outro. As 28 peças são repartidas, 7 para cada. Sem dorme: quem não tem, passa.</Item>
          : <Item h="Um contra um, com dorme">7 peças para cada, 14 ficam no dorme. Quem não tem peça compra até poder jogar; com o dorme vazio, passa.</Item>}
        <Item h="Saída com a carreta de seis">Na primeira rodada sai quem tem a [6|6]{t.saida66 === 'always' ? ' — nesta mesa, em toda rodada' : ''}. Depois sai quem venceu. O jogo corre no sentido anti-horário.</Item>
        <Item h="Quem pode jogar, joga">Passar tendo peça é passo falso. Aqui o app não deixa: a peça que serve sempre acende. A mesa anota cada passo: seu parceiro vê quais pontas te faltam.</Item>
      </Sec>
      <Sec title="Como se ganha pontos">
        <Item h="Batida">Quem joga a última peça bate. {n === 4 ? 'A dupla soma os pontos que sobraram com os adversários — os do parceiro não contam.' : 'Você soma os pontos que sobraram na mão do adversário.'}</Item>
        <div className="row wrap" style={{ gap: 6 }}><span className="tag flat y">Carroça ×{settings?.mult_carroca || 2}</span><span className="tag flat y">Lá e lô ×{settings?.mult_laelo || 3}</span><span className="tag flat y">Cruzada ×{settings?.mult_cruzada || 4}</span></div>
        <Item h="Fechamento">Ninguém pode jogar: todos abrem a mão. Vence {n === 4 ? 'a dupla' : 'quem tiver'} com menos pontos e leva tudo o que sobrou na mesa.</Item>
        <span className="pill" style={{ alignSelf: 'flex-start' }}>{t.tie_rule === 'anula' ? 'Empate → anula a rodada' : 'Empate → quem NÃO fechou'}</span>
      </Sec>
      <Sec title={`A partida vai a ${t.target} pontos`}>
        <span className="muted" style={{ fontSize: 13, lineHeight: '19px' }}>{t.is_free ? 'Mesa grátis: vale XP e ranking, não vale dinheiro.' : `${n === 4 ? 'A primeira dupla' : 'Quem primeiro'} chegar lá leva o pote de ${fmtBC(stake * n)} BC menos ${pct}% — ${fmtBC(netPerWinner(stake, n, pct))} BC ${n === 4 ? 'para cada parceiro' : 'para o vencedor'}.`}</span>
      </Sec>
      <Sec title="Se alguém cair ou sair">
        <span className="muted" style={{ fontSize: 13, lineHeight: '19px' }}>Queda de conexão pausa a mesa. Quando chega a vez de quem caiu, correm <b style={{ color: '#fff' }}>{t.turn_seconds} segundos</b>. Se não voltar, {n === 4 ? 'a dupla dele perde' : 'ele perde'} a partida e o pote vai para os adversários. Desistir vale o mesmo.</span>
        {n === 4 && <span className="muted" style={{ fontSize: 13, lineHeight: '19px' }}>Se cair um de cada dupla, a partida é anulada e as apostas voltam sem comissão.</span>}
      </Sec>
      <div className="row" style={{ gap: 8 }}><Btn kind="s" className="grow" onClick={() => go('glossario')}>Glossário</Btn><Btn className="grow" onClick={back}>Entendi, bora</Btn></div>
    </div>
  );
}
