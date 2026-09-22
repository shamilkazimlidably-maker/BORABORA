// BoraBet — Dominó engine (shared by server, bots and the offline training hand)
// Regras: Dupla 2v2 (sem dorme) e 1v1 (com dorme). Carroça ×2, lá e lô ×3, cruzada ×4,
// fechamento (jogo travado), saída com a carreta de seis, sentido anti-horário.

export const allTiles = () => {
  const t = [];
  for (let a = 0; a <= 6; a++) for (let b = a; b <= 6; b++) t.push([a, b]);
  return t;
};
export const tileId = (t) => `${Math.min(t[0], t[1])}-${Math.max(t[0], t[1])}`;
export const parseTile = (id) => id.split('-').map(Number);
export const pips = (t) => t[0] + t[1];
export const isDouble = (t) => t[0] === t[1];
export const handPips = (h) => (h || []).reduce((s, t) => s + pips(t), 0);
export const hasNum = (t, v) => t[0] === v || t[1] === v;

// ---------- deterministic PRNG (seeded shuffle, verifiable per round) ----------
function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}
function sfc32(a, b, c, d) {
  return () => {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}
export function seededRandom(seed) {
  const s = xmur3(String(seed));
  return sfc32(s(), s(), s(), s());
}
export function shuffle(arr, rand = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const DEFAULT_RULES = {
  mode: '2v2',          // '2v2' | '1v1'
  target: 200,          // pontos para vencer a partida
  multCarroca: 2,       // batida com carroça
  multLaelo: 3,         // batida lá e lô (encaixa nas duas pontas)
  multCruzada: 4,       // carroça que encaixa nas duas pontas iguais
  tieRule: 'nao_fechou',// 'nao_fechou' (vence quem NÃO fechou) | 'anula'
  saida66: 'first',     // 'first' (só na 1ª rodada) | 'always' (toda rodada)
  fechPoints: 'all',    // 'all' (tudo que sobrou na mesa) | 'losers'
  handSize: 7,
};

export const seatCount = (rules) => (rules.mode === '1v1' ? 2 : 4);
export const teamOf = (seat, n) => (n === 4 ? seat % 2 : seat);
export const nextSeat = (seat, n) => (seat + 1) % n; // anti-horário: sul → leste → norte → oeste
export const partnerOf = (seat, n) => (n === 4 ? (seat + 2) % 4 : null);

export function createMatch(rulesIn = {}) {
  const rules = { ...DEFAULT_RULES, ...rulesIn };
  const n = seatCount(rules);
  return {
    v: 1,
    rules,
    n,
    round: 0,
    scores: [0, 0],
    phase: 'init', // init | playing | round_end | match_end
    hands: Array.from({ length: n }, () => []),
    boneyard: [],
    chain: [],      // [{a,b,by}] em ordem esquerda→direita, chain[i].b === chain[i+1].a
    ends: null,     // [L, R]
    turn: 0,
    starter: 0,
    nextStarter: null,
    mustPlay: null,
    passes: 0,
    passLog: [],    // {seat, ends:[L,R], round}
    lastPlay: null, // {seat, tile, side, round, seq}
    seq: 0,
    roundResult: null,
    history: [],    // resumo por rodada
    stats: Array.from({ length: n }, () => ({
      tiles: 0, passes: 0, draws: 0, batidas: 0, carrocas: 0, laelos: 0, cruzadas: 0,
      fechWins: 0, oppPassesCaused: 0, roundsWon: 0,
    })),
    winnerTeam: null,
  };
}

export function startRound(state, seed) {
  const s = state;
  const n = s.n;
  const rand = seededRandom(seed);
  const deck = shuffle(allTiles(), rand);
  s.round += 1;
  s.hands = Array.from({ length: n }, (_, i) => deck.slice(i * s.rules.handSize, (i + 1) * s.rules.handSize));
  s.boneyard = s.rules.mode === '1v1' ? deck.slice(n * s.rules.handSize) : [];
  s.chain = [];
  s.origin = 0;
  s.ends = null;
  s.passes = 0;
  s.passLog = [];
  s.lastPlay = null;
  s.roundResult = null;
  s.phase = 'playing';
  s.mustPlay = null;

  const needsOpening = s.round === 1 || s.rules.saida66 === 'always' || s.nextStarter == null;
  if (needsOpening) {
    // Sai quem tem a carreta de seis; no 1v1 (6-6 pode estar no dorme) sai a maior carroça, senão a maior peça.
    let best = null;
    for (let seat = 0; seat < n; seat++) {
      for (const t of s.hands[seat]) {
        const score = (isDouble(t) ? 100 : 0) + pips(t) * 2 + Math.max(t[0], t[1]) / 10;
        if (!best || score > best.score) best = { seat, t, score };
      }
    }
    s.turn = best.seat;
    s.mustPlay = tileId(best.t);
  } else {
    s.turn = s.nextStarter;
  }
  s.starter = s.turn;
  return s;
}

export function tileFits(t, ends) {
  if (!ends) return { L: true, R: true };
  return { L: hasNum(t, ends[0]), R: hasNum(t, ends[1]) };
}

export function legalMoves(state, seat) {
  const s = state;
  if (s.phase !== 'playing' || s.turn !== seat) return [];
  const hand = s.hands[seat];
  const moves = [];
  if (!s.chain.length) {
    for (const t of hand) {
      if (s.mustPlay && tileId(t) !== s.mustPlay) continue;
      moves.push({ tile: tileId(t), side: 'R' });
    }
    return moves;
  }
  const [L, R] = s.ends;
  for (const t of hand) {
    if (hasNum(t, L)) moves.push({ tile: tileId(t), side: 'L' });
    if (hasNum(t, R)) moves.push({ tile: tileId(t), side: 'R' });
  }
  return moves;
}

export const canDraw = (state, seat) =>
  state.phase === 'playing' && state.turn === seat && state.rules.mode === '1v1' &&
  state.boneyard.length > 0 && legalMoves(state, seat).length === 0;

export const canPass = (state, seat) =>
  state.phase === 'playing' && state.turn === seat &&
  legalMoves(state, seat).length === 0 && !(state.rules.mode === '1v1' && state.boneyard.length > 0);

function anyoneCanPlay(s) {
  if (s.rules.mode === '1v1' && s.boneyard.length > 0) return true;
  if (!s.ends) return true;
  const [L, R] = s.ends;
  return s.hands.some((h) => h.some((t) => hasNum(t, L) || hasNum(t, R)));
}

function removeFromHand(hand, id) {
  const i = hand.findIndex((t) => tileId(t) === id);
  if (i < 0) return null;
  return hand.splice(i, 1)[0];
}

// action: {type:'play', tile:'a-b', side:'L'|'R'} | {type:'pass'} | {type:'draw'}
// returns {ok, error?, events:[]}
export function applyAction(state, seat, action) {
  const s = state;
  const events = [];
  if (s.phase !== 'playing') return { ok: false, error: 'not_playing' };
  if (s.turn !== seat) return { ok: false, error: 'not_your_turn' };
  s.seq += 1;

  if (action.type === 'draw') {
    if (!canDraw(s, seat)) return { ok: false, error: 'cannot_draw' };
    const t = s.boneyard.pop();
    s.hands[seat].push(t);
    s.stats[seat].draws += 1;
    events.push({ type: 'draw', seat, seq: s.seq });
    return { ok: true, events };
  }

  if (action.type === 'pass') {
    if (!canPass(s, seat)) return { ok: false, error: 'cannot_pass' };
    s.passes += 1;
    s.stats[seat].passes += 1;
    s.passLog.push({ seat, ends: s.ends ? [...s.ends] : null, round: s.round });
    if (s.lastPlay && teamOf(s.lastPlay.seat, s.n) !== teamOf(seat, s.n)) {
      s.stats[s.lastPlay.seat].oppPassesCaused += 1;
    }
    events.push({ type: 'pass', seat, ends: s.ends ? [...s.ends] : null, seq: s.seq });
    if (s.passes >= s.n) {
      endRoundBlocked(s, events);
      return { ok: true, events };
    }
    s.turn = nextSeat(seat, s.n);
    return { ok: true, events };
  }

  if (action.type !== 'play') return { ok: false, error: 'bad_action' };
  const legal = legalMoves(s, seat);
  const mv = legal.find((m) => m.tile === action.tile && (m.side === action.side || !s.chain.length));
  if (!mv) return { ok: false, error: 'illegal_move' };

  const hand = s.hands[seat];
  const t = removeFromHand(hand, action.tile);
  const dbl = isDouble(t);
  let bonus = null;
  const lastTile = hand.length === 0;

  if (!s.chain.length) {
    s.chain.push({ a: t[0], b: t[1], by: seat });
    s.ends = [t[0], t[1]];
  } else {
    const [L, R] = s.ends;
    if (lastTile) {
      if (dbl && L === R && t[0] === L) bonus = 'cruzada';
      else if (!dbl && L !== R && hasNum(t, L) && hasNum(t, R)) bonus = 'laelo';
      else if (dbl) bonus = 'carroca';
    }
    if (mv.side === 'L') {
      const other = t[0] === L ? t[1] : t[0];
      s.chain.unshift({ a: other, b: L, by: seat });
      s.origin = (s.origin || 0) + 1;
      s.ends = [other, R];
    } else {
      const other = t[0] === R ? t[1] : t[0];
      s.chain.push({ a: R, b: other, by: seat });
      s.ends = [L, other];
    }
  }
  if (lastTile && !bonus && dbl) bonus = 'carroca';
  s.mustPlay = null;
  s.passes = 0;
  s.stats[seat].tiles += 1;
  s.lastPlay = { seat, tile: tileId(t), side: mv.side, round: s.round, seq: s.seq };
  events.push({ type: 'play', seat, tile: tileId(t), side: mv.side, seq: s.seq });

  if (lastTile) {
    endRoundBatida(s, seat, t, bonus, events);
    return { ok: true, events };
  }
  if (!anyoneCanPlay(s)) {
    endRoundBlocked(s, events, seat);
    return { ok: true, events };
  }
  s.turn = nextSeat(seat, s.n);
  return { ok: true, events };
}

function teamPips(s) {
  const tp = [0, 0];
  s.hands.forEach((h, seat) => { tp[teamOf(seat, s.n)] += handPips(h); });
  return tp;
}

function finishRound(s, result, events) {
  s.roundResult = result;
  s.history.push({
    round: s.round, type: result.type, team: result.winnerTeam, points: result.points,
    mult: result.mult, label: result.label,
  });
  if (result.winnerTeam != null) s.scores[result.winnerTeam] += result.points;
  events.push({ type: 'round_end', result });
  const t = s.rules.target;
  if (s.scores[0] >= t || s.scores[1] >= t) {
    s.phase = 'match_end';
    s.winnerTeam = s.scores[0] >= t ? 0 : 1;
    events.push({ type: 'match_end', winnerTeam: s.winnerTeam });
  } else {
    s.phase = 'round_end';
  }
}

function endRoundBatida(s, seat, t, bonus, events) {
  const team = teamOf(seat, s.n);
  const tp = teamPips(s);
  const base = tp[1 - team];
  const mult =
    bonus === 'cruzada' ? s.rules.multCruzada :
    bonus === 'laelo' ? s.rules.multLaelo :
    bonus === 'carroca' ? s.rules.multCarroca : 1;
  const st = s.stats[seat];
  st.batidas += 1;
  if (bonus === 'carroca') st.carrocas += 1;
  if (bonus === 'laelo') st.laelos += 1;
  if (bonus === 'cruzada') { st.cruzadas += 1; st.carrocas += 1; st.laelos += 1; }
  for (let i = 0; i < s.n; i++) if (teamOf(i, s.n) === team) s.stats[i].roundsWon += 1;
  s.nextStarter = seat;
  finishRound(s, {
    type: 'batida', batedor: seat, tile: tileId(t), bonus, mult, base, points: base * mult,
    winnerTeam: team, teamPips: tp, hands: s.hands.map((h) => h.map(tileId)),
    label: bonus === 'cruzada' ? '×' + mult : bonus ? '×' + mult : '',
  }, events);
}

function endRoundBlocked(s, events, closerSeat) {
  const closer = closerSeat ?? (s.lastPlay ? s.lastPlay.seat : s.starter);
  const closerTeam = teamOf(closer, s.n);
  const tp = teamPips(s);
  const total = tp[0] + tp[1];
  let winnerTeam;
  if (tp[0] === tp[1]) {
    if (s.rules.tieRule === 'anula') {
      s.nextStarter = s.starter;
      finishRound(s, {
        type: 'anulada', closer, winnerTeam: null, points: 0, mult: 1, base: 0, teamPips: tp,
        hands: s.hands.map((h) => h.map(tileId)), label: 'anulada',
      }, events);
      return;
    }
    winnerTeam = 1 - closerTeam; // empate: vence quem NÃO fechou
  } else {
    winnerTeam = tp[0] < tp[1] ? 0 : 1;
  }
  const points = s.rules.fechPoints === 'all' ? total : tp[1 - winnerTeam];
  let best = null;
  for (let i = 0; i < s.n; i++) {
    if (teamOf(i, s.n) !== winnerTeam) continue;
    s.stats[i].roundsWon += 1;
    s.stats[i].fechWins += 1;
    const p = handPips(s.hands[i]);
    if (!best || p < best.p) best = { seat: i, p };
  }
  s.nextStarter = best.seat;
  finishRound(s, {
    type: 'fechamento', closer, winnerTeam, points, mult: 1, base: points, teamPips: tp,
    tie: tp[0] === tp[1], hands: s.hands.map((h) => h.map(tileId)), label: 'fech',
  }, events);
}

// Visão personalizada: nunca expõe mãos alheias nem o dorme enquanto a rodada corre.
export function viewFor(state, seat) {
  const s = state;
  const reveal = s.phase === 'round_end' || s.phase === 'match_end';
  const me = seat != null && seat >= 0 ? seat : null;
  return {
    rules: s.rules,
    n: s.n,
    round: s.round,
    scores: s.scores,
    phase: s.phase,
    turn: s.turn,
    starter: s.starter,
    chain: s.chain,
    origin: s.origin || 0,
    ends: s.ends,
    mustPlay: s.mustPlay,
    handCounts: s.hands.map((h) => h.length),
    boneyardCount: s.boneyard.length,
    passLog: s.passLog,
    lastPlay: s.lastPlay,
    seq: s.seq,
    history: s.history,
    roundResult: reveal ? s.roundResult : null,
    winnerTeam: s.winnerTeam,
    myHand: me != null ? s.hands[me].map(tileId) : null,
    legal: me != null ? legalMoves(s, me) : [],
    canDraw: me != null ? canDraw(s, me) : false,
    canPass: me != null ? canPass(s, me) : false,
  };
}

// Números que um jogador comprovadamente não tem (passou com essas pontas nesta rodada).
export function missingNumbers(passLog, seat, round) {
  const set = new Set();
  for (const p of passLog) if (p.seat === seat && p.round === round && p.ends) { set.add(p.ends[0]); set.add(p.ends[1]); }
  return [...set];
}
