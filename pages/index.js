import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppCtx } from '../components/AppContext';
import { ToastProvider, useToast, BottomNav, Onca, Btn } from '../components/ui';
import { api, startParam } from '../lib/client/api';
import { initTelegram, setBack, setHaptics } from '../lib/client/tg';
import { setSound } from '../lib/client/sound';
import { Splash, Welcome, Tutorial, Fork, Estreia } from '../components/screens/Onboarding';
import { Home, Jogos } from '../components/screens/Home';
import { Salas, Aposta, Parceiro, Glossario, Regras } from '../components/screens/Tables';
import MatchScreen from '../components/screens/Match';
import { Carteira, Depositar, Sacar, Kyc } from '../components/screens/Wallet';
import { Recompensas, Ranking } from '../components/screens/Rewards';
import { Chat, Amigos, Perfil, Notificacoes } from '../components/screens/Social';
import { Menu, Config, Responsavel } from '../components/screens/Menu';

const SCREENS = {
  home: Home, jogos: Jogos, salas: Salas, aposta: Aposta, parceiro: Parceiro, glossario: Glossario, regras: Regras,
  mesa: MatchScreen, carteira: Carteira, depositar: Depositar, sacar: Sacar, kyc: Kyc, recompensas: Recompensas,
  ranking: Ranking, chat: Chat, amigos: Amigos, perfil: Perfil, notificacoes: Notificacoes, menu: Menu, config: Config,
  responsavel: Responsavel, welcome: Welcome, tutorial: Tutorial, fork: Fork, estreia: Estreia,
};
const TABS = ['home', 'jogos', 'recompensas', 'menu'];
const NO_NAV = ['mesa', 'welcome', 'tutorial', 'fork', 'estreia', 'kyc'];

function Shell() {
  const toast = useToast();
  const [boot, setBoot] = useState({ state: 'loading' });
  const [me, setMe] = useState(null);
  const [data, setData] = useState({ settings: null, tiers: [], unread: 0, activeMatch: null });
  const [stack, setStack] = useState([{ name: 'splash' }]);
  const startHandled = useRef(false);

  const refreshMe = useCallback(async () => {
    const r = await api('me');
    setMe(r.me);
    setData({ settings: r.settings, tiers: r.tiers, unread: r.unread, activeMatch: r.activeMatch });
    setSound(r.me.prefs?.sound !== false);
    setHaptics(r.me.prefs?.haptics !== false);
    return r;
  }, []);

  const go = useCallback((name, params = {}) => {
    if (TABS.includes(name)) setStack([{ name, params }]);
    else setStack((s) => [...s, { name, params }]);
    if (typeof window !== 'undefined') window.scrollTo(0, 0);
  }, []);
  const replace = useCallback((name, params = {}) => setStack((s) => [...s.slice(0, -1), { name, params }]), []);
  const back = useCallback(() => setStack((s) => (s.length > 1 ? s.slice(0, -1) : [{ name: 'home' }])), []);
  const reset = useCallback((name = 'home', params = {}) => setStack([{ name, params }]), []);

  // boot
  useEffect(() => {
    initTelegram();
    const t0 = Date.now();
    refreshMe().then((r) => {
      const wait = Math.max(0, 650 - (Date.now() - t0));
      setTimeout(() => {
        setBoot({ state: 'ready' });
        const ob = r.me.onboarding || {};
        if (!ob.terms_at) reset('welcome');
        else if (r.activeMatch) reset('mesa', { id: r.activeMatch.id });
        else if (!ob.tutorial_done) reset('tutorial');
        else if (!ob.path) reset('fork');
        else reset('home');
      }, wait);
    }).catch((e) => setBoot({ state: 'error', error: e }));
  }, [refreshMe, reset]);

  // deep links: p_CODE (party invite), ref_ handled server side
  useEffect(() => {
    if (boot.state !== 'ready' || startHandled.current || !me?.onboarding?.terms_at) return;
    const sp = startParam();
    startHandled.current = true;
    if (sp && sp.startsWith('p_')) {
      api('match/join', { method: 'POST', body: { invite: sp.slice(2) } })
        .then((r) => reset('mesa', { id: r.id }))
        .catch((e) => toast(e.message, 'error'));
    }
  }, [boot.state, me, reset, toast]);

  // Telegram BackButton
  const top = stack[stack.length - 1];
  useEffect(() => {
    if (boot.state !== 'ready') return;
    if (stack.length > 1 && top.name !== 'mesa') setBack(back);
    else setBack(null);
  }, [stack.length, top.name, back, boot.state]);

  const ctx = useMemo(() => ({ me, setMe, ...data, setData, refreshMe, go, back, replace, reset, toast, top }),
    [me, data, refreshMe, go, back, replace, reset, toast, top]);

  if (boot.state === 'loading' || top.name === 'splash') return <Splash />;
  if (boot.state === 'error') {
    const code = boot.error?.code;
    return (
      <div className="screen full" style={{ alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
        <Onca pose={code === 'banned' ? 'sad' : 'surprised'} size={120} />
        <h1 className="h2">{code === 'unauthorized' || code === 'bad_init_data' ? 'Sessão expirada' : code === 'banned' ? 'Conta bloqueada' : code === 'maintenance' ? 'Voltamos em instantes' : 'Algo deu errado'}</h1>
        <p className="muted" style={{ margin: 0 }}>{boot.error?.message || 'Tente de novo em instantes'}</p>
        <Btn onClick={() => window.location.reload()}>Tentar de novo</Btn>
      </div>
    );
  }
  const Screen = SCREENS[top.name] || Home;
  const tab = TABS.includes(stack[0].name) ? stack[0].name : 'home';
  return (
    <AppCtx.Provider value={ctx}>
      <div className={`app ${me?.prefs?.reduced ? 'reduced' : ''}`}>
        <Screen key={stack.length + ':' + top.name + ':' + JSON.stringify(top.params || {})} {...(top.params || {})} />
        {!NO_NAV.includes(top.name) && <BottomNav tab={tab} go={go} />}
      </div>
    </AppCtx.Provider>
  );
}

export default function Index() {
  return <ToastProvider><Shell /></ToastProvider>;
}
