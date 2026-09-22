import { db, q } from './db';

export const DEFAULTS = {
  commission_pct: 10, mult_carroca: 2, mult_laelo: 3, mult_cruzada: 4, bot_fill_probability: 70, bot_fill_delay_min_s: 4, bot_fill_delay_max_s: 14,
  matchmaking_max_wait_s: 25, allow_manual_bot_fill: true, bots_in_ranking: false, bots_in_ticker: false,
  ready_check_s: 12, round_break_s: 7, time_bank_count: 2, time_bank_s: 10, max_timeouts: 3,
  reconnect_grace_s: 20, welcome_bonus: 200, wagering_multiplier: 3, deposit_bonus_pct: 10,
  min_deposit: 100, max_deposit: 500000, quote_minutes: 15,
  deposit_addresses: { usdt_trc20: '', ton: '' }, withdraw_fee: { usdt_trc20: 120, ton: 50 },
  min_withdraw: 1000, new_address_delay_h: 24, kyc2_threshold: 10000,
  daily_rewards: [50, 75, 100, 150, 200, 300, 500], reward_balance: 'bonus', reward_wager_mult: 1,
  missions_daily_count: 3, missions_weekly_count: 3, missions_level_slots: 2,
  xp_base: 100, xp_exp: 1.45, xp_match: 20, xp_win: 30, xp_round_won: 3, level_up_bonus: 25,
  level_tiers: [
    { name: 'Novato', min: 1 }, { name: 'Parceiro', min: 5 }, { name: 'Craque', min: 12 },
    { name: 'Fera', min: 25 }, { name: 'Lenda', min: 40 },
  ],
  referral_bonus: 500, chat_slow_mode_s: 3, maintenance: false, timezone: 'America/Sao_Paulo',
  license_text: 'Licença [Nº DA LICENÇA]', support_url: 'https://t.me/',
};

let cache = null;
let cacheAt = 0;
export async function getSettings(force = false) {
  if (!force && cache && Date.now() - cacheAt < 15000) return cache;
  const rows = await q(db().from('settings').select('key,value'));
  const s = { ...DEFAULTS };
  for (const r of rows) s[r.key] = r.value;
  cache = s;
  cacheAt = Date.now();
  return s;
}
export function invalidateSettings() { cache = null; }

// Only what the mini app may see
export function publicSettings(s) {
  return {
    commission_pct: Number(s.commission_pct), welcome_bonus: Number(s.welcome_bonus),
    wagering_multiplier: Number(s.wagering_multiplier), deposit_bonus_pct: Number(s.deposit_bonus_pct),
    min_deposit: Number(s.min_deposit), max_deposit: Number(s.max_deposit), quote_minutes: Number(s.quote_minutes),
    withdraw_fee: s.withdraw_fee, min_withdraw: Number(s.min_withdraw), new_address_delay_h: Number(s.new_address_delay_h),
    kyc2_threshold: Number(s.kyc2_threshold), daily_rewards: s.daily_rewards, level_tiers: s.level_tiers,
    referral_bonus: Number(s.referral_bonus), time_bank_count: Number(s.time_bank_count),
    time_bank_s: Number(s.time_bank_s), license_text: s.license_text, support_url: s.support_url,
    maintenance: !!s.maintenance, matchmaking_max_wait_s: Number(s.matchmaking_max_wait_s),
    allow_manual_bot_fill: !!s.allow_manual_bot_fill, chat_slow_mode_s: Number(s.chat_slow_mode_s),
    mult_carroca: Number(s.mult_carroca), mult_laelo: Number(s.mult_laelo), mult_cruzada: Number(s.mult_cruzada),
    reward_balance: s.reward_balance,
  };
}
