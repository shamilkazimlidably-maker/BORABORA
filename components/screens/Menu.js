import { useState } from 'react';
import { useApp } from '../AppContext';
import { Avatar, Btn, GlossIcon, Icon, Sheet, Toggle, TopBar } from '../ui';
import { api } from '../../lib/client/api';
import { fmtBC } from '../../lib/format';
import { setSound } from '../../lib/client/sound';
import { setHaptics, openLink } from '../../lib/client/tg';

export function Menu() {
  const { me, go, unread, settings } = useApp();
  const Row = ({ icon, title, sub, to, onClick, badge }) => (
    <button className="list-row press" style={{ color: '#fff', cursor: 'pointer', textAlign: 'left' }} onClick={onClick || (() => go(to))}>
      <GlossIcon name={icon} size={38} /><div className="grow col" style={{ gap: 1 }}><b style={{ fontSize: 14 }}>{title}</b>{sub && <span className="cap">{sub}</span>}</div>
      {badge ? <span className="tag flat red">{badge}</span> : null}<Icon name="chevron" color="var(--text-3)" />
    </button>
  );
  return (
    <div className="screen">
      <TopBar me={me} onDeposit={() => go('depositar')} onBell={() => go('notificacoes')} unread={unread} />
      <button className="card row pressable" style={{ color: '#fff', textAlign: 'left' }} onClick={() => go('perfil')}>
        <Avatar name={me.name} color={me.color} photo={me.photo} size={52} />
        <div className="grow col" style={{ gap: 2 }}><span className="display" style={{ fontSize: 20 }}>{me.name}</span><span className="cap">Nível {me.levelInfo.level} · {me.levelInfo.tier.name}</span></div>
        <Icon name="chevron" />
      </button>
      <div className="col">
        <Row icon="wallet" title="Carteira" sub={`${fmtBC(me.balances.total, 2)} BC`} to="carteira" />
        <Row icon="trophy" title="Ranking das duplas" to="ranking" />
        <Row icon="users" title="Amigos" sub="Convide e ganhem os dois" to="amigos" />
        <Row icon="chat" title="Chat ao vivo" to="chat" />
        <Row icon="star" title="Notificações" to="notificacoes" badge={unread || null} />
        <Row icon="help" title="Regras e glossário" to="glossario" />
        <Row icon="shield" title="Jogo responsável" sub="Limites, pausa e ajuda" to="responsavel" />
        <Row icon="lock" title="Configurações" to="config" />
        {settings?.support_url && <Row icon="phone" title="Suporte" sub="Fale com a gente no Telegram" onClick={() => openLink(settings.support_url)} />}
      </div>
      <p className="tiny center"><span className="tag flat red" style={{ marginRight: 6 }}>18+</span>{settings?.license_text}</p>
    </div>
  );
}

export function Config() {
  const { me, setMe, back, toast } = useApp();
  const prefs = me.prefs || {};
  async function set(k, v) {
    const next = { ...prefs, [k]: v };
    setMe({ ...me, prefs: next });
    if (k === 'sound') setSound(v);
    if (k === 'haptics') setHaptics(v);
    try { await api('account', { method: 'POST', body: { action: 'prefs', prefs: { [k]: v } } }); } catch (e) { toast(e.message, 'error'); }
  }
  const Row = ({ k, title, sub, def = true }) => (
    <div className="list-row"><div className="grow col" style={{ gap: 1 }}><b style={{ fontSize: 14 }}>{title}</b>{sub && <span className="cap">{sub}</span>}</div>
      <Toggle on={prefs[k] ?? def} onChange={(v) => set(k, v)} label={title} /></div>
  );
  return (
    <div className="screen">
      <TopBar onBack={back} title="Configurações" />
      <h2 className="section-title">Mesa</h2>
      <Row k="sound" title="Som" sub="Madeira, cerâmica e moedas" />
      <Row k="haptics" title="Vibração" sub="Toque ao jogar e quando é sua vez" />
      <Row k="reduced" title="Menos animação" sub="Para aparelhos mais simples" def={false} />
      <h2 className="section-title">Privacidade</h2>
      <Row k="hide_name" title="Esconder meu nome no chat" def={false} />
      <Row k="tg_notify" title="Avisos pelo Telegram" sub="Depósito, saque e convite de parceiro" />
      <h2 className="section-title">Conta</h2>
      <div className="list-row"><div className="grow col" style={{ gap: 1 }}><b style={{ fontSize: 14 }}>Idioma</b><span className="cap">Português (Brasil)</span></div></div>
      <div className="list-row"><div className="grow col" style={{ gap: 1 }}><b style={{ fontSize: 14 }}>Verificação</b><span className="cap">Nível {me.kycLevel}</span></div></div>
      <p className="tiny center">BoraBet · Termos de uso · Política de privacidade</p>
    </div>
  );
}

export function Responsavel() {
  const { me, setMe, back, toast, settings } = useApp();
  const lim = me.limits || {};
  const [dep, setDep] = useState(lim.deposit_daily || '');
  const [loss, setLoss] = useState(lim.loss_daily || '');
  const [pause, setPause] = useState(false);
  async function save() {
    try { const r = await api('account', { method: 'POST', body: { action: 'limits', deposit_daily: Number(dep) || 0, loss_daily: Number(loss) || 0 } }); setMe(r.me); toast('Limites salvos'); } catch (e) { toast(e.message, 'error'); }
  }
  async function doPause(days) {
    try { const r = await api('account', { method: 'POST', body: { action: 'pause', days } }); setMe(r.me); setPause(false); toast('Conta em pausa'); } catch (e) { toast(e.message, 'error'); }
  }
  const pending = lim.pending || {};
  return (
    <div className="screen">
      <TopBar onBack={back} title="Jogo responsável" />
      <div className="card col" style={{ gap: 8 }}>
        <span className="display" style={{ fontSize: 18 }}>Jogue pelo prazer</span>
        <span className="muted" style={{ fontSize: 14, lineHeight: '20px' }}>Deposite só o que você pode perder. Defina limites: reduzir vale na hora; aumentar só depois de 24 horas.</span>
      </div>
      {me.pausedUntil && new Date(me.pausedUntil) > new Date() && <div className="card row" style={{ border: '1px solid rgba(240,66,75,.5)' }}><Icon name="lock" color="#F0424B" /><span className="grow">Conta em pausa até {new Date(me.pausedUntil).toLocaleDateString('pt-BR')}</span></div>}
      <label className="cap">Limite de depósito por dia (BC, 0 = sem limite)</label>
      <input className="input" inputMode="numeric" value={dep} onChange={(e) => setDep(e.target.value.replace(/\D/g, ''))} />
      {pending.deposit_daily && <span className="tiny">Aumento para {fmtBC(pending.deposit_daily.value)} BC vale a partir de {new Date(pending.deposit_daily.at).toLocaleString('pt-BR')}</span>}
      <label className="cap">Limite de perda por dia (BC, 0 = sem limite)</label>
      <input className="input" inputMode="numeric" value={loss} onChange={(e) => setLoss(e.target.value.replace(/\D/g, ''))} />
      {pending.loss_daily && <span className="tiny">Aumento para {fmtBC(pending.loss_daily.value)} BC vale a partir de {new Date(pending.loss_daily.at).toLocaleString('pt-BR')}</span>}
      <Btn block onClick={save}>Salvar limites</Btn>
      <Btn kind="r" block onClick={() => setPause(true)}>Dar uma pausa</Btn>
      <div className="card tight col" style={{ gap: 4 }}>
        <b>Precisa conversar?</b>
        <span className="cap">CVV · ligue 188 (gratuito, 24 h) ou acesse cvv.org.br. Jogadores Anônimos Brasil também oferece grupos de apoio.</span>
      </div>
      <Sheet open={pause} onClose={() => setPause(false)}>
        <div className="col" style={{ gap: 10, paddingTop: 8 }}>
          <h2 className="h2">Quanto tempo de pausa?</h2>
          <p className="cap" style={{ margin: 0 }}>Durante a pausa você não entra em mesas nem deposita. Saques continuam liberados. Não dá para desfazer antes do prazo.</p>
          {[[1, '24 horas'], [7, '7 dias'], [30, '30 dias'], [180, '6 meses'], [365, '1 ano']].map(([d, l]) => <Btn key={d} kind="s" block onClick={() => doPause(d)}>{l}</Btn>)}
        </div>
      </Sheet>
      <p className="tiny center"><span className="tag flat red" style={{ marginRight: 6 }}>18+</span>{settings?.license_text}</p>
    </div>
  );
}
