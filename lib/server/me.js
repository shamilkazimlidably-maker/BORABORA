import { db, q } from './db';
import { balances } from './wallet';
import { levelInfo } from './progression';
import { localDate, yesterday } from './time';

export function dailyStatus(p, s) {
  const tz = s.timezone || 'America/Sao_Paulo';
  const today = localDate(tz);
  const last = p.last_daily_claim ? String(p.last_daily_claim).slice(0, 10) : null;
  const claimedToday = last === today;
  const continues = last === yesterday(tz) || claimedToday;
  const streak = continues ? p.daily_streak : 0;
  const rewards = s.daily_rewards || [];
  const nextDay = claimedToday ? streak : (streak % rewards.length) + 1; // 1..7
  return { streak, claimedToday, nextDay, rewards, nextReward: Number(rewards[(nextDay - 1) % rewards.length] || 0) };
}

export function playerPublic(p, s) {
  return {
    id: p.id, name: p.display_name, username: p.username, color: p.avatar_color, photo: p.photo_url,
    balances: balances(p), levelInfo: levelInfo(p.xp, s),
    stats: {
      played: p.matches_played, won: p.matches_won, biggestPot: Number(p.biggest_pot), streak: p.win_streak,
      bestStreak: p.best_streak, carrocas: p.carrocas, laelos: p.laelos, fechamentos: p.fechamentos,
      forfeits: p.forfeits, roundsWon: p.rounds_won,
    },
    onboarding: p.onboarding || {}, welcomeGiven: p.welcome_given, referralCode: p.referral_code,
    kycLevel: p.kyc_level, limits: p.limits || {}, prefs: p.prefs || {}, pausedUntil: p.paused_until,
    daily: dailyStatus(p, s),
  };
}

export async function freshPlayer(id) {
  return (await q(db().from('players').select('*').eq('id', id).limit(1)))[0];
}
