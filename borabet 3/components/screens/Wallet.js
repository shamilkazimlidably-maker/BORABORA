import { useEffect, useState } from 'react';
import { useApp } from '../AppContext';
import { Bar, Btn, GlossIcon, Icon, Onca, Sheet, TopBar, useInterval, useNow } from '../ui';
import { api } from '../../lib/client/api';
import { fmtBC, fmtBRL, hhmm, mmss, signed } from '../../lib/format';
import { copyText, openLink } from '../../lib/client/tg';
import { sfx } from '../../lib/client/sound';

const LEDGER_LABEL = {
  stake: 'Aposta', win: 'Vitória', refund: 'Partida anulada · devolvido', deposit: 'Depósito creditado', deposit_bonus: 'Bônus de depósito',
  withdraw: 'Saque solicitado', withdraw_refund: 'Saque devolvido', welcome: 'Bônus de boas-vindas', daily: 'Recompensa diária',
  mission: 'Missão concluída', level_up: 'Subiu de nível', referral: 'Bônus de indicação', rain: 'Chuva de moedas', bonus_release: 'Bônus liberado', admin: 'Ajuste BoraBet',
};
const EXPLORER = { usdt_trc20: (h) => `https://tronscan.org/#/transaction/${h}`, ton: (h) => `https://tonviewer.com/transaction/${h}` };

export function Carteira() {
  const { me, go, back, refreshMe } = useApp();
  const [unit, setUnit] = useState('BC');
  const [filter, setFilter] = useState('');
  const [w, setW] = useState(null);
  const [info, setInfo] = useState(false);
  const [receipt, setReceipt] = useState(null);
  useEffect(() => { api('wallet' + (filter ? '?filter=' + filter : '')).then(setW).catch(() => {}); refreshMe().catch(() => {}); }, [filter]); // eslint-disable-line
  const b = me.balances;
  const fmt = (v) => (unit === 'BC' ? fmtBC(v, 2) + ' BC' : fmtBRL(v));
  const openWd = (w?.withdrawals || []).find((x) => ['requested', 'review', 'sent'].includes(x.status));
  function exportCsv() {
    const rows = [['data', 'tipo', 'real', 'bonus', 'ref']].concat((w?.ledger || []).map((l) => [l.created_at, l.type, l.amount_real, l.amount_bonus, l.ref || '']));
    const csv = rows.map((r) => r.join(',')).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'borabet-extrato.csv'; a.click();
  }
  return (
    <div className="screen">
      <TopBar onBack={back} title="Carteira" />
      <div className="seg" style={{ alignSelf: 'flex-end', width: 120, marginTop: -48 }}>{['BC', 'R$'].map((u) => <button key={u} className={unit === u ? 'on' : ''} onClick={() => setUnit(u)}>{u}</button>)}</div>
      <div className="card felt col" style={{ gap: 4, borderRadius: 28 }}>
        <span className="cap" style={{ color: '#CFE6DA' }}>Saldo para jogar e sacar</span>
        <span className="display" style={{ fontSize: 34 }}>{fmt(b.real)}</span>
        {b.bonus > 0 && (
          <div className="col" style={{ gap: 6, marginTop: 8 }}>
            <div className="row"><span className="cap grow" style={{ color: '#CFE6DA' }}>Bônus a liberar <button className="link" onClick={() => setInfo(true)} style={{ padding: 0 }}>(?)</button></span><b>{fmt(b.bonus)}</b></div>
            <Bar value={Math.max(0, 1 - b.wager / Math.max(b.wager, b.bonus * 3))} max={1} />
            <span className="tiny" style={{ color: '#CFE6DA' }}>faltam {fmtBC(b.wager, 2)} BC apostados para liberar</span>
          </div>
        )}
        {b.pending > 0 && <div className="row" style={{ marginTop: 6 }}><span className="cap grow" style={{ color: '#CFE6DA' }}>Saque em análise</span><b>{fmt(b.pending)}</b></div>}
      </div>
      <span className="tiny center">100 BC = R$ 1,00 · cotação fixa e publicada</span>
      <div className="row" style={{ gap: 8 }}>
        <Btn className="grow" onClick={() => go('depositar')}><Icon name="arrowDown" size={16} color="#1A1400" stroke={3} />Depositar</Btn>
        <Btn kind="s" className="grow" onClick={() => go('sacar')}><Icon name="arrowUp" size={16} />Sacar</Btn>
      </div>
      {openWd && <div className="list-row press" onClick={() => go('sacar')}><GlossIcon name="wallet" size={36} /><div className="grow col" style={{ gap: 2 }}><b>Saque em andamento</b><span className="cap">{fmtBC(openWd.amount_bc)} BC · {openWd.status === 'sent' ? 'enviado' : 'em análise'}</span></div><Icon name="chevron" /></div>}
      <div className="row"><h2 className="section-title grow">Extrato</h2><button className="link" onClick={exportCsv}>Exportar CSV</button></div>
      <div className="chips">{[['', 'Tudo'], ['partidas', 'Partidas'], ['depositos', 'Depósitos'], ['saques', 'Saques'], ['bonus', 'Bônus']].map(([k, l]) => <button key={k} className={`chip ${filter === k ? 'on' : ''}`} onClick={() => setFilter(k)}>{l}</button>)}</div>
      <div className="col">
        {!w && <div className="empty"><span className="spinner" /></div>}
        {w?.ledger?.map((l) => {
          const amt = Number(l.amount_real) + Number(l.amount_bonus);
          return (
            <div key={l.id} className="list-row press" onClick={() => setReceipt(l)}>
              <div className="grow col" style={{ gap: 2 }}>
                <b style={{ fontSize: 14 }}>{LEDGER_LABEL[l.type] || l.type}{l.meta?.tier ? ' · ' + l.meta.tier : ''}</b>
                <span className="cap">{new Date(l.created_at).toLocaleDateString('pt-BR')}, {hhmm(l.created_at)}{l.meta?.asset ? ' · ' + l.meta.asset : ''}{Number(l.amount_bonus) && !Number(l.amount_real) ? ' · bônus' : ''}</span>
              </div>
              <b className={amt >= 0 ? 'green' : ''}>{signed(amt)}</b>
            </div>
          );
        })}
        {w && !w.ledger.length && <div className="empty"><Onca pose="idle" size={80} />Nada por aqui ainda.</div>}
      </div>
      <span className="tiny center">Toque em qualquer linha para ver o recibo com hash e horários.</span>
      <Sheet open={info} onClose={() => setInfo(false)}>
        <div className="col" style={{ gap: 10, paddingTop: 8 }}>
          <h2 className="h2">Como o bônus libera</h2>
          <p className="muted" style={{ margin: 0, lineHeight: '20px' }}>Bônus é saldo para jogar. Ele vira saldo sacável depois que você aposta o valor pedido em dominó. O saldo real sempre sai primeiro nas apostas.</p>
        </div>
      </Sheet>
      <Sheet open={!!receipt} onClose={() => setReceipt(null)}>
        {receipt && <div className="col" style={{ gap: 8, paddingTop: 8 }}>
          <h2 className="h2">{LEDGER_LABEL[receipt.type] || receipt.type}</h2>
          <div className="row"><span className="grow muted">Valor real</span><b>{signed(receipt.amount_real)} BC</b></div>
          <div className="row"><span className="grow muted">Valor bônus</span><b>{signed(receipt.amount_bonus)} BC</b></div>
          <div className="row"><span className="grow muted">Data</span><b>{new Date(receipt.created_at).toLocaleString('pt-BR')}</b></div>
          <div className="row"><span className="grow muted">Referência</span><span className="cap" style={{ wordBreak: 'break-all' }}>{receipt.ref || receipt.id}</span></div>
          {receipt.meta?.tx && <div className="row"><span className="grow muted">Hash</span><span className="cap" style={{ wordBreak: 'break-all' }}>{receipt.meta.tx}</span></div>}
        </div>}
      </Sheet>
    </div>
  );
}

export function Depositar() {
  const { me, settings, back, go, toast, refreshMe } = useApp();
  const [step, setStep] = useState(0);
  const [asset, setAsset] = useState('usdt_trc20');
  const [amount, setAmount] = useState(5000);
  const [dep, setDep] = useState(null);
  const [tx, setTx] = useState('');
  const now = useNow(1000);
  const bonusPct = Number(settings?.deposit_bonus_pct || 0);
  const bonus = Math.floor((amount * bonusPct) / 100);
  const presets = [100, 500, 1000, 5000];
  useInterval(async () => {
    if (!dep || dep.status === 'credited') return;
    try {
      const w = await api('wallet');
      const d = w.deposits.find((x) => x.id === dep.id);
      if (d) { if (d.status === 'credited' && dep.status !== 'credited') { sfx.win(); toast('Depósito creditado!'); refreshMe(); } setDep(d); }
    } catch (e) { /* noop */ }
  }, step === 2 ? 6000 : null);
  async function create() {
    try { const r = await api('wallet', { method: 'POST', body: { action: 'deposit', asset, amount } }); setDep(r.deposit); setStep(2); } catch (e) { toast(e.message, 'error'); }
  }
  async function paid() {
    try { const r = await api('wallet', { method: 'POST', body: { action: 'deposit_paid', id: dep.id, tx_hash: tx } }); setDep(r.deposit); toast('Recebido! Estamos acompanhando'); } catch (e) { toast(e.message, 'error'); }
  }
  async function requote() { try { const r = await api('wallet', { method: 'POST', body: { action: 'deposit_requote', id: dep.id } }); setDep(r.deposit); } catch (e) { toast(e.message, 'error'); } }
  const expiresIn = dep ? Date.parse(dep.quote_expires_at) - now : 0;
  const Net = ({ k, sym, title, sub }) => (
    <button className="list-row press" onClick={() => setAsset(k)} style={{ color: '#fff', cursor: 'pointer', textAlign: 'left', border: asset === k ? '1px solid var(--yellow-500)' : undefined, background: asset === k ? 'rgba(255,217,61,.08)' : undefined }}>
      <span className="avatar" style={{ width: 44, height: 44, background: k === 'ton' ? 'linear-gradient(140deg,#3B7BFF,#0088CC)' : 'linear-gradient(140deg,#26A17B,#1A7A5C)', fontSize: 20 }}>{sym}</span>
      <div className="grow col" style={{ gap: 2 }}><b>{title}</b><span className="cap">{sub}</span></div>
      {asset === k && <Icon name="check" color="#FFD93D" stroke={3} />}
    </button>
  );
  const steps = ['Rede', 'Valor', 'Pagamento'];
  return (
    <div className="screen">
      <TopBar onBack={() => (step > 0 && step < 2 ? setStep(step - 1) : back())} title="Depositar" me={me} />
      <div className="row" style={{ gap: 6 }}>{steps.map((s, i) => <div key={s} className="grow col" style={{ gap: 4 }}><div className="bar sm"><i style={{ width: i <= step ? '100%' : '0%' }} /></div><span className="tiny" style={{ color: i === step ? '#fff' : undefined }}>{s}</span></div>)}</div>
      {step === 0 && (<>
        <h2 className="h2">De onde vem o dinheiro?</h2>
        <Net k="usdt_trc20" sym="₮" title="USDT" sub="Rede TRON (TRC-20) · taxa baixa" />
        <Net k="ton" sym="◆" title="TON" sub="Rede TON · direto da carteira do Telegram" />
        <div className="card tight row" style={{ gap: 10, border: '1px solid rgba(240,66,75,.4)' }}><Icon name="shield" color="#F0424B" /><span className="cap" style={{ color: '#FFB3B7' }}>Mandar na rede errada perde o dinheiro. O endereço da próxima tela só serve para a rede que você escolher aqui.</span></div>
        <div className="grow" /><Btn size="lg" block onClick={() => setStep(1)}>Continuar</Btn>
      </>)}
      {step === 1 && (<>
        <h2 className="h2">Quanto você quer pôr?</h2>
        <span className="cap">Valor em BoraCoins</span>
        <div style={{ position: 'relative' }}><input className="input big" inputMode="numeric" value={amount} onChange={(e) => setAmount(Math.max(0, Number(e.target.value.replace(/\D/g, '')) || 0))} /><span className="display" style={{ position: 'absolute', right: 18, top: 20, color: 'var(--text-2)' }}>BC</span></div>
        <div className="row" style={{ gap: 6 }}>{presets.map((p) => <button key={p} className={`chip grow ${amount === p ? 'on' : ''}`} onClick={() => setAmount(p)}>{fmtBC(p)}</button>)}</div>
        <div className="card felt col" style={{ gap: 6 }}>
          <div className="row"><span className="cap grow" style={{ color: '#CFE6DA' }}>Você recebe</span><span className="display" style={{ fontSize: 26, color: 'var(--yellow-500)' }}>{fmtBC(amount + bonus)} BC</span></div>
          <div className="row"><span className="cap grow" style={{ color: '#CFE6DA' }}>{fmtBC(amount)} BC = {fmtBRL(amount)}</span>{bonus > 0 && <span className="tag flat">+{bonusPct}% de bônus</span>}</div>
        </div>
        {bonus > 0 && <p className="cap" style={{ margin: 0 }}>Os {fmtBC(bonus)} BC de bônus liberam para saque depois de {fmtBC(bonus * Number(settings?.wagering_multiplier || 3))} BC apostados em dominó. O saldo real sai primeiro.</p>}
        <span className="tiny">100 BC = R$ 1,00 · cotação fixa · mínimo {fmtBC(settings?.min_deposit)} BC</span>
        <div className="grow" /><Btn size="lg" block disabled={amount < Number(settings?.min_deposit || 0)} onClick={create}>Gerar endereço</Btn>
      </>)}
      {step === 2 && dep && (<>
        <div className="card col" style={{ gap: 10 }}>
          <div className="row"><span className="pill">{dep.asset} · {dep.network === 'ton' ? 'TON' : 'TRON'}</span><div className="grow" /><span className="cap">envie exatamente</span></div>
          <span className="display" style={{ fontSize: 30, color: 'var(--yellow-500)' }}>{fmtBRL(dep.amount_bc)}</span>
          <div className="row" style={{ gap: 8, background: 'var(--surface-2)', borderRadius: 14, padding: 12 }}>
            <span className="grow" style={{ fontFamily: 'monospace', fontSize: 13, wordBreak: 'break-all' }}>{dep.address}</span>
            <Btn size="xs" kind="s" onClick={() => copyText(dep.address).then(() => toast('Endereço copiado'))}><Icon name="copy" size={14} />Copiar</Btn>
          </div>
          {dep.status === 'awaiting' && (expiresIn > 0 ? <span className="cap">Cotação válida por <b style={{ color: '#fff' }}>{mmss(expiresIn)}</b></span>
            : <div className="row"><span className="cap grow red">Cotação expirou</span><Btn size="xs" kind="s" onClick={requote}><Icon name="refresh" size={14} />Renovar</Btn></div>)}
        </div>
        <h2 className="section-title">Acompanhando seu depósito</h2>
        {[
          ['Pagamento recebido', dep.tx_hash || dep.status !== 'awaiting', dep.tx_hash ? 'Hash informado · aguardando rede' : 'Assim que você enviar'],
          ['Confirmando na rede', ['detected', 'credited'].includes(dep.status), dep.confirmations ? `${dep.confirmations} confirmações · normalmente 2 min` : 'normalmente 2 min'],
          ['Creditado na carteira', dep.status === 'credited', `${fmtBC(Number(dep.amount_bc) + Number(dep.bonus_bc))} BC entram no seu saldo`],
        ].map(([t, done, sub], i) => (
          <div key={t} className="row" style={{ gap: 12 }}>
            <span style={{ width: 26, height: 26, borderRadius: '50%', flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: done ? 'var(--green-500)' : 'var(--surface-2)', border: done ? 0 : '1px solid var(--stroke)' }}>
              {done ? <Icon name="check" size={14} color="#06220F" stroke={3} /> : <span className="tiny">{i + 1}</span>}</span>
            <div className="col grow" style={{ gap: 1 }}><b style={{ fontSize: 14, color: done ? '#fff' : 'var(--text-2)' }}>{t}</b><span className="cap">{sub}</span></div>
          </div>
        ))}
        {dep.status === 'awaiting' && !dep.tx_hash && (
          <div className="col" style={{ gap: 8 }}>
            <input className="input" placeholder="Hash da transação (opcional)" value={tx} onChange={(e) => setTx(e.target.value)} />
            <Btn block size="lg" onClick={paid}>Já paguei</Btn>
          </div>
        )}
        {dep.tx_hash && EXPLORER[dep.network] && <button className="link" onClick={() => openLink(EXPLORER[dep.network](dep.tx_hash))}>Ver no explorer</button>}
        <p className="cap center">Pode fechar o app. A gente avisa quando cair.</p>
        <Btn kind="s" block onClick={() => (dep.status === 'credited' ? go('home') : back())}>{dep.status === 'credited' ? 'Bora jogar' : 'Fechar'}</Btn>
      </>)}
    </div>
  );
}

export function Sacar() {
  const { me, settings, back, go, toast, refreshMe } = useApp();
  const [w, setW] = useState(null);
  const [addrSheet, setAddrSheet] = useState(false);
  const [sel, setSel] = useState(null);
  const [amount, setAmount] = useState('');
  const [newAddr, setNewAddr] = useState({ asset: 'usdt_trc20', address: '', label: '' });
  const [busy, setBusy] = useState(false);
  const load = () => api('wallet').then((r) => { setW(r); const ok = r.addresses.find((a) => new Date(a.available_at) <= new Date()); setSel((s) => s || ok?.id || r.addresses[0]?.id || null); }).catch(() => {});
  useEffect(() => { load(); }, []);
  const b = me.balances;
  const open = (w?.withdrawals || []).find((x) => ['requested', 'review', 'sent'].includes(x.status));
  const addr = w?.addresses?.find((a) => a.id === sel);
  const fee = addr ? Number(settings?.withdraw_fee?.[addr.asset] || 0) : 0;
  const amt = Number(amount) || 0;

  if (me.kycLevel < 1) {
    return (
      <div className="screen">
        <TopBar onBack={back} title="Sacar" me={me} />
        <div className="row" style={{ justifyContent: 'center' }}><Onca pose="idle" size={110} /></div>
        <h2 className="h1 center">Verifique a conta antes</h2>
        <p className="muted center" style={{ margin: 0 }}>É uma vez só, leva cerca de 60 segundos e libera o saque para sempre.</p>
        {[['Nível 0 · conta criada', 'já pode jogar e depositar', true], ['Nível 1 · nome, nascimento e CPF', 'é o que falta para sacar', false], ['Nível 2 · documento com foto', `só para saques acima de ${fmtBC(settings?.kyc2_threshold)} BC`, false]].map(([t, s, done], i) => (
          <div key={t} className="list-row" style={{ border: i === 1 ? '1px solid rgba(255,217,61,.5)' : undefined }}>
            <span style={{ width: 26, height: 26, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: done ? 'var(--green-500)' : 'var(--surface-2)' }}>{done ? <Icon name="check" size={14} color="#06220F" stroke={3} /> : <span className="tiny">{i}</span>}</span>
            <div className="grow col" style={{ gap: 2 }}><b style={{ fontSize: 14 }}>{t}</b><span className="cap">{s}</span></div>
          </div>
        ))}
        <div className="grow" /><Btn size="lg" block onClick={() => go('kyc')}>Verificar agora</Btn>
      </div>
    );
  }

  if (open) {
    const order = ['requested', 'review', 'sent', 'completed'];
    const idx = order.indexOf(open.status);
    return (
      <div className="screen">
        <TopBar onBack={back} title="Sacar" me={me} />
        <div className="card col center" style={{ alignItems: 'center', gap: 4 }}><span className="cap">Saque em andamento</span><span className="display" style={{ fontSize: 32 }}>{fmtBC(open.amount_bc)} BC</span><span className="cap">{open.asset} · {open.address.slice(0, 6)}…{open.address.slice(-6)}</span></div>
        {[['Solicitado', `${new Date(open.created_at).toLocaleDateString('pt-BR')} às ${hhmm(open.created_at)}`], ['Em análise', 'normalmente até 15 min'], ['Enviado', 'com o hash da transação'], ['Concluído', 'confirmado na rede']].map(([t, s], i) => (
          <div key={t} className="row" style={{ gap: 12 }}>
            <span style={{ width: 26, height: 26, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: i <= Math.max(idx, open.status === 'requested' ? 0 : idx) ? 'var(--green-500)' : 'var(--surface-2)' }}>{i <= idx ? <Icon name="check" size={14} color="#06220F" stroke={3} /> : <span className="tiny">{i + 1}</span>}</span>
            <div className="col grow" style={{ gap: 1 }}><b style={{ fontSize: 14 }}>{t}</b><span className="cap">{i === 2 && open.tx_hash ? open.tx_hash.slice(0, 18) + '…' : s}</span></div>
          </div>
        ))}
        {open.tx_hash && EXPLORER[open.network] && <button className="link" onClick={() => openLink(EXPLORER[open.network](open.tx_hash))}>Ver no explorer</button>}
        <div className="grow" />
        {['requested', 'review'].includes(open.status) && <Btn kind="s" block onClick={async () => { try { await api('wallet', { method: 'POST', body: { action: 'withdraw_cancel', id: open.id } }); await refreshMe(); load(); toast('Saque cancelado, valor devolvido'); } catch (e) { toast(e.message, 'error'); } }}>Cancelar saque</Btn>}
        <p className="cap center">Dá para cancelar enquanto estiver em análise. Depois de enviado, não tem volta.</p>
      </div>
    );
  }

  async function addAddress() {
    try { await api('wallet', { method: 'POST', body: { action: 'address', ...newAddr } }); setAddrSheet(false); setNewAddr({ asset: 'usdt_trc20', address: '', label: '' }); load(); toast('Endereço salvo · libera em 24 h'); } catch (e) { toast(e.message, 'error'); }
  }
  async function submit() {
    setBusy(true);
    try { await api('wallet', { method: 'POST', body: { action: 'withdraw', address_id: sel, amount: amt } }); await refreshMe(); load(); toast('Saque solicitado'); } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  }
  return (
    <div className="screen">
      <TopBar onBack={back} title="Sacar" me={me} />
      <h2 className="section-title">Para onde vai?</h2>
      {(w?.addresses || []).map((a) => {
        const unlocked = new Date(a.available_at) <= new Date();
        return (
          <button key={a.id} className="list-row press" onClick={() => setSel(a.id)} style={{ color: '#fff', textAlign: 'left', cursor: 'pointer', border: sel === a.id ? '1px solid var(--yellow-500)' : undefined }}>
            <span className="avatar" style={{ width: 40, height: 40, background: a.asset === 'ton' ? 'linear-gradient(140deg,#3B7BFF,#0088CC)' : 'linear-gradient(140deg,#26A17B,#1A7A5C)' }}>{a.asset === 'ton' ? '◆' : '₮'}</span>
            <div className="grow col" style={{ gap: 2 }}><div className="row"><b>{a.label || (a.asset === 'ton' ? 'Carteira TON' : 'Carteira USDT')}</b><span className={`tag flat ${unlocked ? '' : 'y'}`}>{unlocked ? 'LIBERADO' : 'LIBERA EM 24 H'}</span></div>
              <span className="cap">{a.address.slice(0, 6)}…{a.address.slice(-6)} · {a.asset === 'ton' ? 'TON' : 'TRON'}</span></div>
          </button>
        );
      })}
      <Btn kind="s" block onClick={() => setAddrSheet(true)}><Icon name="plus" size={16} />Novo endereço</Btn>
      <span className="cap">Endereço novo só sai depois de 24 horas. É o que protege sua conta se alguém entrar nela.</span>
      <h2 className="section-title">Quanto você tira?</h2>
      <div style={{ position: 'relative' }}><input className="input big" inputMode="decimal" placeholder="0" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} />
        <button className="chip" style={{ position: 'absolute', right: 10, top: 14, height: 36 }} onClick={() => setAmount(String(b.real))}>Máx</button></div>
      <div className="card tight col" style={{ gap: 8 }}>
        <div className="row"><span className="grow cap">Você tira</span><b>{fmtBC(amt, 2)} BC</b></div>
        <div className="row"><span className="grow cap">Equivale a</span><b>{fmtBRL(amt)}</b></div>
        <div className="row"><span className="grow cap">Taxa da rede</span><b>− {fmtBC(fee)} BC</b></div>
        <div className="sep" /><div className="row"><span className="grow cap">Chega na sua carteira</span><b className="green">{fmtBRL(Math.max(0, amt - fee))}</b></div>
      </div>
      {b.bonus > 0 && <p className="cap" style={{ margin: 0 }}>Dos seus {fmtBC(b.total, 2)} BC, <b style={{ color: '#fff' }}>{fmtBC(b.bonus, 2)} BC são bônus</b> e ainda não saem. Faltam {fmtBC(b.wager, 2)} BC apostados para liberar.</p>}
      <Btn size="lg" block disabled={busy || !addr || new Date(addr.available_at) > new Date() || amt < Number(settings?.min_withdraw || 0) || amt > b.real} onClick={submit}>Sacar {amt ? fmtBC(amt) + ' BC' : ''}</Btn>
      <span className="tiny center">Mínimo {fmtBC(settings?.min_withdraw)} BC · saques acima de {fmtBC(settings?.kyc2_threshold)} BC pedem Nível 2</span>
      <Sheet open={addrSheet} onClose={() => setAddrSheet(false)}>
        <div className="col" style={{ gap: 10, paddingTop: 8 }}>
          <h2 className="h2">Novo endereço</h2>
          <div className="seg">{[['usdt_trc20', 'USDT · TRON'], ['ton', 'TON']].map(([k, l]) => <button key={k} className={newAddr.asset === k ? 'on' : ''} onClick={() => setNewAddr({ ...newAddr, asset: k })}>{l}</button>)}</div>
          <input className="input" placeholder="Endereço da carteira" value={newAddr.address} onChange={(e) => setNewAddr({ ...newAddr, address: e.target.value.trim() })} />
          <input className="input" placeholder="Apelido (ex.: Minha Binance)" value={newAddr.label} onChange={(e) => setNewAddr({ ...newAddr, label: e.target.value })} />
          <p className="cap" style={{ margin: 0 }}>Confira a rede: mandar para a rede errada perde o dinheiro.</p>
          <Btn block onClick={addAddress}>Salvar endereço</Btn>
        </div>
      </Sheet>
    </div>
  );
}

export function Kyc() {
  const { back, toast, refreshMe, replace } = useApp();
  const [f, setF] = useState({ name: '', birth: '', cpf: '' });
  const [busy, setBusy] = useState(false);
  const cpfMask = (v) => v.replace(/\D/g, '').slice(0, 11).replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  async function submit() {
    setBusy(true);
    try { await api('account', { method: 'POST', body: { action: 'kyc', ...f } }); await refreshMe(); toast('Conta verificada!'); replace('sacar'); } catch (e) { toast(e.message, 'error'); setBusy(false); }
  }
  return (
    <div className="screen full">
      <TopBar onBack={back} title="Verificar conta" />
      <p className="muted" style={{ margin: 0 }}>Nível 1 · nome, nascimento e CPF. Seus dados ficam protegidos e só servem para liberar o saque.</p>
      <label className="cap">Nome completo</label><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoComplete="name" />
      <label className="cap">Data de nascimento</label><input className="input" type="date" value={f.birth} onChange={(e) => setF({ ...f, birth: e.target.value })} />
      <label className="cap">CPF</label><input className="input" inputMode="numeric" value={f.cpf} onChange={(e) => setF({ ...f, cpf: cpfMask(e.target.value) })} placeholder="000.000.000-00" />
      <div className="grow" />
      <Btn size="lg" block disabled={busy || !f.name || !f.birth || f.cpf.length < 14} onClick={submit}>Verificar</Btn>
      <p className="tiny center">18+ · Um CPF por conta</p>
    </div>
  );
}
