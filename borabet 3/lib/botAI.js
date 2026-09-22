// BoraBet — Bot brain. Usa SOMENTE informação que um humano naquela cadeira teria:
// a própria mão, a mesa, as contagens de peças e o registro de passes. Nunca olha mãos alheias.
import {
  legalMoves, canDraw, canPass, parseTile, tileId, pips, isDouble, hasNum,
  teamOf, partnerOf, missingNumbers, allTiles,
} from './domino.js';

function unseenCounts(state, seat) {
  const seen = new Set();
  for (const c of state.chain) seen.add(tileId([c.a, c.b]));
  for (const t of state.hands[seat]) seen.add(tileId(t));
  const counts = [0, 0, 0, 0, 0, 0, 0];
  for (const t of allTiles()) {
    if (seen.has(tileId(t))) continue;
    counts[t[0]] += 1;
    if (t[0] !== t[1]) counts[t[1]] += 1;
  }
  return counts;
}

function endsAfter(state, move) {
  const t = parseTile(move.tile);
  if (!state.ends) return [t[0], t[1]];
  const [L, R] = state.ends;
  if (move.side === 'L') return [t[0] === L ? t[1] : t[0], R];
  return [L, t[0] === R ? t[1] : t[0]];
}

// skill 1..5  (1 = iniciante, 5 = mestre)
export function chooseAction(state, seat, skill = 3, rand = Math.random) {
  const moves = legalMoves(state, seat);
  if (!moves.length) {
    if (canDraw(state, seat)) return { type: 'draw' };
    if (canPass(state, seat)) return { type: 'pass' };
    return null;
  }
  // dedupe (mesma peça nas duas pontas iguais)
  const uniq = [];
  const keys = new Set();
  for (const m of moves) {
    const e = endsAfter(state, m);
    const k = m.tile + ':' + [...e].sort().join(',');
    if (!keys.has(k)) { keys.add(k); uniq.push(m); }
  }
  const mistakeRate = [0, 0.45, 0.22, 0.1, 0.04, 0.01][Math.max(1, Math.min(5, skill))];
  if (uniq.length === 1 || rand() < mistakeRate) {
    return { type: 'play', ...uniq[Math.floor(rand() * uniq.length)] };
  }

  const n = state.n;
  const myTeam = teamOf(seat, n);
  const partner = partnerOf(seat, n);
  const hand = state.hands[seat];
  const unseen = unseenCounts(state, seat);
  const oppMissing = new Set();
  const partnerMissing = new Set();
  for (let i = 0; i < n; i++) {
    if (i === seat) continue;
    const miss = missingNumbers(state.passLog, i, state.round);
    if (teamOf(i, n) !== myTeam) miss.forEach((x) => oppMissing.add(x));
    else if (i === partner) miss.forEach((x) => partnerMissing.add(x));
  }
  const avgUnseenPip = 6; // média aproximada de pontos por peça escondida

  let best = null;
  for (const m of uniq) {
    const t = parseTile(m.tile);
    const rest = hand.filter((h) => tileId(h) !== m.tile);
    const [nl, nr] = endsAfter(state, m);
    let score = 0;

    if (rest.length === 0) {
      score += 1000; // bater sempre
      if (state.ends) {
        const [L, R] = state.ends;
        if (isDouble(t) && L === R) score += 300;
        else if (!isDouble(t) && L !== R && hasNum(t, L) && hasNum(t, R)) score += 200;
        else if (isDouble(t)) score += 100;
      }
    }
    score += pips(t) * 1.1;                // livra peso
    if (isDouble(t)) score += 7;           // carroça presa é perigo
    for (const e of [nl, nr]) {
      if (oppMissing.has(e)) score += 5.5; // força adversário a passar
      if (partnerMissing.has(e)) score -= 4.5; // não trave o parceiro
      score += rest.filter((h) => hasNum(h, e)).length * 1.8; // controle da ponta
    }
    if (nl === nr) score += rest.filter((h) => hasNum(h, nl)).length >= 2 ? 3 : -2;

    // Pode fechar o jogo? Avalia se fechar é bom para a dupla.
    if (skill >= 3 && rest.length > 0 && unseen[nl] === 0 && unseen[nr] === 0 &&
        !rest.some((h) => hasNum(h, nl) || hasNum(h, nr))) {
      const myP = rest.reduce((s, h) => s + pips(h), 0);
      const partnerP = partner != null ? state.hands[partner].length * avgUnseenPip : 0;
      const oppCount = state.hands.reduce((s, h, i) => s + (teamOf(i, n) !== myTeam ? h.length : 0), 0);
      const oppP = oppCount * avgUnseenPip;
      score += (oppP - (myP + partnerP)) * 0.8;
    }

    const noise = (6 - skill) * 3.2 * (rand() - 0.5);
    score += noise;
    if (!best || score > best.score) best = { m, score };
  }
  return { type: 'play', ...best.m };
}

// Tempo "humano" de reação, em ms. Jogadas óbvias saem mais rápido; muitas opções, mais lento.
export function thinkDelay(bot = {}, optionCount = 2, rand = Math.random) {
  const min = Math.max(700, Number(bot.speed_min_ms ?? 1600));
  const max = Math.max(min + 200, Number(bot.speed_max_ms ?? 4800));
  const r = (rand() + rand() + rand()) / 3; // curva em sino
  let d = min + (max - min) * r;
  if (optionCount <= 1) d *= 0.6;
  else if (optionCount >= 4) d *= 1.15;
  if (rand() < 0.07) d += 1500 + rand() * 2500; // distração ocasional
  return Math.round(Math.max(700, d));
}

export function readyDelay(rand = Math.random) {
  return Math.round(900 + rand() * 3200);
}
