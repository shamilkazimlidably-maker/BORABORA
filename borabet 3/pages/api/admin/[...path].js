import { handler, db, q, rpc, ApiError, signal } from '../../../lib/server/db';
import { requireAdmin, checkPassword, issue, clear } from '../../../lib/server/adminAuth';
import { getSettings, invalidateSettings, DEFAULTS } from '../../../lib/server/settings';
import { getTiers, invalidateTiers, invalidateBots, mutateMatch, annulMatch, clientView, sweepStale, seatOf } from '../../../lib/server/game';
import { adminCreateRoom, adminAddBot } from '../../../lib/server/matchmaking';
import { instantiate, invalidateTemplates, ensureMissions } from '../../../lib/server/missions';
import { confirmDeposit, setWithdrawal } from '../../../lib/server/finance';
import { levelInfo, notify, applyLevelUps } from '../../../lib/server/progression';
import { dayStart } from '../../../lib/server/time';
import { tgSend } from '../../../lib/server/telegram';

const FIRST = ['Tião', 'Jow', 'Bia', 'Cris', 'Léo', 'Rafa', 'Nando', 'Paty', 'Duda', 'Gui', 'Lari', 'Malu', 'Caio', 'Juju', 'Beto', 'Dani', 'Rê', 'Fabinho', 'Neide', 'Toninho', 'Zé', 'Marquinhos', 'Lu', 'Dedé', 'Carol', 'Vini', 'Mari', 'Tati', 'Binho', 'Nena', 'Juca', 'Sandra', 'Kiko', 'Fê', 'Leca', 'Tuca', 'Rô', 'Vavá', 'Didi', 'Nina'];
const SUFFIX = ['', '', '', '_Domina', '.Carreta', 'da Bahia', 'do Recife', 'SP', 'RJ', '77', '_BR', 'Lá&Lô', 'Carroção', '10', 'PE', 'Nordeste'];
const COLORS = ['linear-gradient(140deg,#3DDB5F,#0E7A4B)', 'linear-gradient(140deg,#F2B705,#F0424B)', 'linear-gradient(140deg,#8B4DFF,#3B7BFF)', 'linear-gradient(140deg,#FF7A59,#F2B705)', 'linear-gradient(140deg,#3B7BFF,#0E7A4B)', 'linear-gradient(140deg,#F0424B,#8B4DFF)', 'linear-gradient(140deg,#D4A017,#7A4A1E)', 'linear-gradient(140deg,#12925B,#3B7BFF)', 'linear-gradient(140deg,#FF6FB5,#8B4DFF)'];
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const num = (v, d = 0) => (v === '' || v == null || isNaN(Number(v)) ? d : Number(v));
const log = (action, meta) => db().from('admin_log').insert({ action, meta }).then(() => {});

const BOT_FIELDS = ['display_name', 'username', 'avatar_color', 'bot_skill', 'bot_speed_min_ms', 'bot_speed_max_ms', 'bot_active', 'bot_note', 'level', 'xp'];
const TIER_FIELDS = ['name', 'mode', 'stakes', 'target', 'tie_rule', 'saida66', 'turn_seconds', 'is_free', 'vip_min_level', 'bot_allowed', 'active', 'sort', 'subtitle'];
const TPL_FIELDS = ['code', 'scope', 'metric', 'agg', 'title_pt', 'title_tr', 'icon', 'base_target', 'target_per_level', 'target_growth', 'target_variance', 'target_round', 'reward_bc_base', 'reward_bc_per_level', 'reward_xp_base', 'reward_xp_per_level', 'reward_growth', 'min_level', 'max_level', 'weight', 'active'];
const only = (obj, fields) => Object.fromEntries(Object.entries(obj || {}).filter(([k]) => fields.includes(k)));

function sumBy(rows, key = 'amount') { return rows.reduce((a, r) => a + Number(r[key] || 0), 0); }

export default handler(['GET', 'POST', 'PATCH', 'DELETE'], async (req, res) => {
  const path = [].concat(req.query.path || []);
  const [r0, r1, r2] = path;
  const M = req.method;
  const b = req.body || {};
  const sb = db();

  if (r0 === 'login' && M === 'POST') {
    if (!checkPassword(b.password)) throw new ApiError(401, 'bad_password', 'Şifre hatalı');
    issue(res);
    return { ok: true };
  }
  if (r0 === 'logout') { clear(res); return { ok: true }; }
  requireAdmin(req);
  const s = await getSettings();

  // ------------------------------------------------ dashboard
  if (r0 === 'dashboard') {
    const today = dayStart(s.timezone).toISOString();
    const week = new Date(Date.now() - 7 * 86400000).toISOString();
    const [humans, bots, live, finishedToday, houseToday, houseWeek, pendDep, pendWd, balances, newToday, humanMatchesToday] = await Promise.all([
      sb.from('players').select('id', { count: 'exact', head: true }).eq('is_bot', false),
      sb.from('players').select('id', { count: 'exact', head: true }).eq('is_bot', true).eq('bot_active', true),
      q(sb.from('matches').select('status,seats').in('status', ['forming', 'ready', 'playing'])),
      sb.from('matches').select('id', { count: 'exact', head: true }).eq('status', 'finished').gte('finished_at', today),
      q(sb.from('house_ledger').select('type,amount').gte('created_at', today)),
      q(sb.from('house_ledger').select('type,amount').gte('created_at', week)),
      sb.from('deposits').select('id', { count: 'exact', head: true }).in('status', ['awaiting', 'detected']).not('tx_hash', 'is', null),
      sb.from('withdrawals').select('id', { count: 'exact', head: true }).in('status', ['requested', 'review']),
      q(sb.from('players').select('balance_real,balance_bonus,balance_pending').eq('is_bot', false)),
      sb.from('players').select('id', { count: 'exact', head: true }).eq('is_bot', false).gte('created_at', today),
      q(sb.from('match_players').select('is_bot,result').gte('finished_at', today)),
    ]);
    const byType = (rows) => rows.reduce((a, r) => { a[r.type] = (a[r.type] || 0) + Number(r.amount); return a; }, {});
    const online = (await q(sb.from('players').select('id').eq('is_bot', false).gte('last_seen', new Date(Date.now() - 120000).toISOString()))).length;
    const seatsHuman = live.reduce((a, m) => a + (m.seats || []).filter((x) => x && !x.bot && !x.reserved).length, 0);
    const seatsBot = live.reduce((a, m) => a + (m.seats || []).filter((x) => x && x.bot).length, 0);
    return {
      humans: humans.count || 0, bots: bots.count || 0, online, newToday: newToday.count || 0,
      live: { forming: live.filter((m) => m.status === 'forming').length, ready: live.filter((m) => m.status === 'ready').length, playing: live.filter((m) => m.status === 'playing').length, seatsHuman, seatsBot },
      finishedToday: finishedToday.count || 0,
      botShareToday: humanMatchesToday.length ? Math.round((humanMatchesToday.filter((x) => x.is_bot).length / humanMatchesToday.length) * 100) : 0,
      houseToday: byType(houseToday), houseWeek: byType(houseWeek),
      netToday: sumBy(houseToday), netWeek: sumBy(houseWeek),
      pendingDeposits: pendDep.count || 0, pendingWithdrawals: pendWd.count || 0,
      liabilities: { real: sumBy(balances, 'balance_real'), bonus: sumBy(balances, 'balance_bonus'), pending: sumBy(balances, 'balance_pending') },
    };
  }

  // ------------------------------------------------ bots
  if (r0 === 'bots') {
    if (M === 'GET' && !r1) {
      const rows = await q(sb.from('players').select('id,display_name,username,avatar_color,bot_skill,bot_speed_min_ms,bot_speed_max_ms,bot_active,bot_note,level,xp,matches_played,matches_won,created_at')
        .eq('is_bot', true).order('created_at', { ascending: false }));
      const live = await q(sb.from('matches').select('id,status,seats').in('status', ['forming', 'ready', 'playing']));
      const busy = {};
      for (const m of live) for (const x of m.seats || []) if (x?.bot) busy[x.pid] = { match: m.id, status: m.status };
      const since = new Date(Date.now() - 30 * 86400000).toISOString();
      const mp = await q(sb.from('match_players').select('player_id,result,net').eq('is_bot', true).gte('finished_at', since));
      const perf = {};
      for (const r of mp) { const p = (perf[r.player_id] = perf[r.player_id] || { w: 0, l: 0 }); r.result === 'win' ? p.w++ : p.l++; }
      return { bots: rows.map((r) => ({ ...r, busy: busy[r.id] || null, last30: perf[r.id] || { w: 0, l: 0 } })) };
    }
    if (M === 'POST' && r1 === 'generate') {
      const count = Math.min(50, Math.max(1, num(b.count, 5)));
      const used = new Set((await q(sb.from('players').select('display_name').eq('is_bot', true))).map((x) => x.display_name));
      const rows = [];
      for (let i = 0; i < count; i++) {
        let name = '';
        for (let k = 0; k < 30; k++) { name = (pick(FIRST) + ' ' + pick(SUFFIX)).trim().replace(' _', '_').replace(' .', '.'); if (!used.has(name)) break; }
        used.add(name);
        const skill = b.skill ? num(b.skill, 3) : 1 + Math.floor(Math.random() * 5);
        const base = num(b.speed_min_ms, 1400 + Math.floor(Math.random() * 1200));
        const level = Math.max(1, Math.round(num(b.level, 3 + Math.random() * 20)));
        rows.push({
          is_bot: true, display_name: name, username: name.toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, '') + '_bot',
          avatar_color: pick(COLORS), bot_skill: Math.min(5, Math.max(1, skill)), bot_speed_min_ms: base,
          bot_speed_max_ms: num(b.speed_max_ms, base + 2500 + Math.floor(Math.random() * 2500)), level, xp: Math.round(100 * Math.pow(level - 1, 1.45)),
        });
      }
      await q(sb.from('players').insert(rows).select('id'));
      invalidateBots(); log('bots.generate', { count });
      return { created: rows.length };
    }
    if (M === 'POST' && !r1) {
      if (!String(b.display_name || '').trim()) throw new ApiError(400, 'name', 'İsim zorunlu');
      const row = { is_bot: true, avatar_color: pick(COLORS), ...only(b, BOT_FIELDS) };
      if (row.bot_speed_max_ms <= row.bot_speed_min_ms) throw new ApiError(400, 'speed', 'Maksimum süre minimumdan büyük olmalı');
      const out = await q(sb.from('players').insert(row).select('*'));
      invalidateBots(); log('bots.create', { name: row.display_name });
      return { bot: out[0] };
    }
    if (M === 'PATCH' && r1) {
      const patch = only(b, BOT_FIELDS);
      if (patch.bot_speed_min_ms != null && patch.bot_speed_max_ms != null && Number(patch.bot_speed_max_ms) <= Number(patch.bot_speed_min_ms)) {
        throw new ApiError(400, 'speed', 'Maksimum süre minimumdan büyük olmalı');
      }
      const out = await q(sb.from('players').update(patch).eq('id', r1).eq('is_bot', true).select('*'));
      invalidateBots();
      return { bot: out[0] };
    }
    if (M === 'DELETE' && r1) {
      const live = await q(sb.from('matches').select('id').in('status', ['forming', 'ready', 'playing']).filter('seats', 'cs', JSON.stringify([{ pid: r1 }])));
      if (live.length) throw new ApiError(400, 'busy', 'Bot şu an bir masada. Önce pasif yapın veya maçın bitmesini bekleyin.');
      const hist = await q(sb.from('match_players').select('match_id').eq('player_id', r1).limit(1));
      if (hist.length) { await sb.from('players').update({ bot_active: false }).eq('id', r1); invalidateBots(); return { deactivated: true }; }
      await sb.from('players').delete().eq('id', r1).eq('is_bot', true);
      invalidateBots();
      return { deleted: true };
    }
  }

  // ------------------------------------------------ tiers (salonlar)
  if (r0 === 'tiers') {
    if (M === 'GET') return { tiers: await getTiers(true) };
    const data = only(b, TIER_FIELDS);
    if (data.stakes) data.stakes = [].concat(data.stakes).map(Number).filter((x) => x >= 0);
    if (M === 'POST') { const out = await q(sb.from('tiers').insert(data).select('*')); invalidateTiers(); return { tier: out[0] }; }
    if (M === 'PATCH' && r1) { const out = await q(sb.from('tiers').update(data).eq('id', r1).select('*')); invalidateTiers(); log('tiers.update', { id: r1, data }); return { tier: out[0] }; }
  }

  // ------------------------------------------------ rooms / matches
  if (r0 === 'matches') {
    if (M === 'GET' && !r1) {
      const status = b.status || req.query.status || 'live';
      let mq = sb.from('matches').select('id,tier_id,mode,stake,pot,status,is_free,is_private,seats,created_at,started_at,finished_at,result,meta,state').order('created_at', { ascending: false }).limit(80);
      mq = status === 'live' ? mq.in('status', ['forming', 'ready', 'playing']) : mq.in('status', ['finished', 'annulled', 'cancelled']);
      const rows = await q(mq);
      const tiers = await getTiers();
      return {
        matches: rows.map((m) => ({
          id: m.id, tier: tiers.find((t) => t.id === m.tier_id)?.name, tier_id: m.tier_id, mode: m.mode, stake: Number(m.stake), pot: Number(m.pot), status: m.status,
          is_free: m.is_free, is_private: m.is_private, created_at: m.created_at, started_at: m.started_at, finished_at: m.finished_at,
          adminRoom: !!m.meta?.adminRoom,
          seats: (m.seats || []).map((x) => x && { name: x.reserved ? '(davetli bekleniyor)' : x.name, bot: !!x.bot, reserved: !!x.reserved, ready: !!x.ready, pid: x.pid }),
          scores: m.state?.scores || null, round: m.state?.round || null, result: m.result && { type: m.result.type, winnerTeam: m.result.winnerTeam, commission: m.result.commission },
        })),
      };
    }
    if (M === 'GET' && r1) {
      const m = (await q(sb.from('matches').select('*').eq('id', r1).limit(1)))[0];
      if (!m) throw new ApiError(404, 'not_found', 'Maç bulunamadı');
      return { match: m };
    }
    if (M === 'POST' && r1 === 'room') {
      const id = await adminCreateRoom({ tierId: b.tierId, stake: b.stake, botIds: b.botIds || [], botCount: b.botCount }, s);
      log('rooms.create', { id, ...b });
      return { id };
    }
    if (M === 'POST' && r1 && r2 === 'add-bot') {
      const name = await adminAddBot(r1, b.seat, b.botId || null);
      log('rooms.add_bot', { match: r1, name });
      return { added: name };
    }
    if (M === 'POST' && r1 && r2 === 'kick') {
      await mutateMatch(r1, async (m) => {
        if (!['forming', 'ready'].includes(m.status)) throw new ApiError(400, 'state', 'Sadece bekleyen odalarda koltuk boşaltılabilir');
        const i = Number(b.seat);
        m.seats[i] = null;
        if (m.status === 'ready') { m.status = 'forming'; m.phase_deadline = null; m.meta.fill = {}; m.seats.forEach((x) => { if (x) x.ready = false; }); }
        return { changed: true };
      });
      return { ok: true };
    }
    if (M === 'POST' && r1 && r2 === 'cancel') {
      await mutateMatch(r1, async (m) => {
        if (m.status === 'playing') { annulMatch(m, 'admin'); return { changed: true }; }
        if (['forming', 'ready'].includes(m.status)) { m.status = 'cancelled'; return { changed: true }; }
        throw new ApiError(400, 'state', 'Maç zaten bitmiş');
      });
      log('matches.cancel', { id: r1 });
      return { ok: true };
    }
    if (M === 'POST' && r1 === 'sweep') return { swept: await sweepStale(50) };
  }

  // ------------------------------------------------ settings
  if (r0 === 'settings') {
    if (M === 'GET') return { settings: await getSettings(true), defaults: DEFAULTS };
    if (M === 'PATCH' || M === 'POST') {
      const rows = Object.entries(b.values || {}).filter(([k]) => k in DEFAULTS || k.startsWith('mult_')).map(([key, value]) => ({ key, value, updated_at: new Date().toISOString() }));
      if (rows.length) await q(sb.from('settings').upsert(rows).select('key'));
      invalidateSettings(); log('settings.update', { keys: rows.map((r) => r.key) });
      return { settings: await getSettings(true) };
    }
  }

  // ------------------------------------------------ missions
  if (r0 === 'missions') {
    if (M === 'GET' && !r1) {
      const tpls = await q(sb.from('mission_templates').select('*').order('scope').order('id'));
      const stats = await q(sb.from('player_missions').select('template_id,status').gte('created_at', new Date(Date.now() - 7 * 86400000).toISOString()));
      const agg = {};
      for (const r of stats) { const a = (agg[r.template_id] = agg[r.template_id] || { given: 0, done: 0 }); a.given++; if (r.status === 'completed' || r.status === 'claimed') a.done++; }
      return { templates: tpls.map((t) => ({ ...t, stats: agg[t.id] || { given: 0, done: 0 } })) };
    }
    if (M === 'POST' && r1 === 'preview') {
      const t = { ...b.template };
      const levels = [1, 5, 10, 20, 40];
      const chain = t.scope === 'level' || t.scope === 'achievement' ? [0, 1, 2, 3, 4] : [0];
      let seed = 0.5;
      const rand = () => seed; // deterministic (no variance) preview
      return { rows: levels.map((L) => ({ level: L, items: chain.map((k) => ({ k, ...instantiate(t, L, k, rand) })) })) };
    }
    if (M === 'POST' && r1 === 'player') {
      const pl = (await q(sb.from('players').select('*').eq('id', b.playerId).limit(1)))[0];
      if (!pl) throw new ApiError(404, 'not_found');
      await ensureMissions(pl, s);
      return { missions: await q(sb.from('player_missions').select('*').eq('player_id', pl.id).order('created_at', { ascending: false }).limit(100)) };
    }
    if (M === 'POST' && r1 === 'reset-player') {
      await sb.from('player_missions').update({ status: 'expired' }).eq('player_id', b.playerId).in('status', ['active', 'completed']).in('scope', b.scopes || ['daily', 'weekly']);
      const pl = (await q(sb.from('players').select('*').eq('id', b.playerId).limit(1)))[0];
      await ensureMissions(pl, s);
      return { ok: true };
    }
    const data = only(b, TPL_FIELDS);
    if (M === 'POST' && !r1) {
      if (!data.code || !data.title_pt || !data.metric || !data.scope) throw new ApiError(400, 'fields', 'Kod, kapsam, metrik ve başlık zorunlu');
      const out = await q(sb.from('mission_templates').insert(data).select('*'));
      invalidateTemplates(); log('missions.create', { code: data.code });
      return { template: out[0] };
    }
    if (M === 'PATCH' && r1) { const out = await q(sb.from('mission_templates').update(data).eq('id', r1).select('*')); invalidateTemplates(); return { template: out[0] }; }
    if (M === 'DELETE' && r1) { await sb.from('mission_templates').update({ active: false }).eq('id', r1); invalidateTemplates(); return { ok: true }; }
  }

  // ------------------------------------------------ players
  if (r0 === 'players') {
    if (M === 'GET' && !r1) {
      const term = String(req.query.q || '').trim();
      let pq = sb.from('players').select('id,telegram_id,display_name,username,level,xp,balance_real,balance_bonus,balance_pending,matches_played,matches_won,banned,kyc_level,created_at,last_seen,paused_until')
        .eq('is_bot', false).order('last_seen', { ascending: false }).limit(100);
      if (term) {
        if (/^\d+$/.test(term)) pq = pq.eq('telegram_id', Number(term));
        else pq = pq.or(`display_name.ilike.%${term.replace(/[%,()]/g, '')}%,username.ilike.%${term.replace(/[%,()]/g, '')}%`);
      }
      return { players: await q(pq) };
    }
    if (M === 'GET' && r1) {
      const [pl, ledger, matches, missions] = await Promise.all([
        q(sb.from('players').select('*').eq('id', r1).limit(1)),
        q(sb.from('ledger').select('*').eq('player_id', r1).order('created_at', { ascending: false }).limit(60)),
        q(sb.from('match_players').select('*').eq('player_id', r1).order('finished_at', { ascending: false }).limit(30)),
        q(sb.from('player_missions').select('*').eq('player_id', r1).in('status', ['active', 'completed']).order('created_at', { ascending: false })),
      ]);
      if (!pl[0]) throw new ApiError(404, 'not_found', 'Oyuncu bulunamadı');
      return { player: { ...pl[0], levelInfo: levelInfo(pl[0].xp, s) }, ledger, matches, missions };
    }
    if (M === 'POST' && r1 && r2 === 'balance') {
      const amount = num(b.amount);
      if (!amount) throw new ApiError(400, 'amount', 'Tutar girin');
      const bonus = b.bucket === 'bonus';
      await rpc('wallet_apply', { p_player: r1, p_real: bonus ? 0 : amount, p_bonus: bonus ? amount : 0, p_type: 'admin', p_ref: 'admin', p_meta: { note: b.note || '' }, p_wager_add: bonus && amount > 0 ? amount * num(b.wager_mult, 0) : 0 });
      await sb.from('house_ledger').insert({ type: 'admin_adjust', amount: -amount, ref: r1, meta: { note: b.note || '', bucket: b.bucket } });
      if (b.notify && amount > 0) await notify(r1, 'reward', 'Presente da BoraBet', `${amount} BC foram adicionados ao seu saldo.`);
      log('players.balance', { id: r1, amount, bucket: b.bucket, note: b.note });
      return { ok: true };
    }
    if (M === 'POST' && r1 && r2 === 'xp') {
      await rpc('player_progress', { p_player: r1, p: { xp: Math.round(num(b.xp)), counted: false } });
      await applyLevelUps(r1, s);
      return { ok: true };
    }
    if (M === 'POST' && r1 && r2 === 'flags') {
      const patch = {};
      if ('banned' in b) patch.banned = !!b.banned;
      if ('kyc_level' in b) patch.kyc_level = num(b.kyc_level);
      if ('mute_minutes' in b) patch.chat_muted_until = num(b.mute_minutes) > 0 ? new Date(Date.now() + num(b.mute_minutes) * 60000).toISOString() : null;
      if ('unpause' in b && b.unpause) patch.paused_until = null;
      await q(sb.from('players').update(patch).eq('id', r1).select('id'));
      log('players.flags', { id: r1, patch });
      return { ok: true };
    }
    if (M === 'POST' && r1 && r2 === 'message') {
      await notify(r1, 'system', String(b.title || 'BoraBet'), String(b.body || ''));
      const pl = (await q(sb.from('players').select('telegram_id').eq('id', r1).limit(1)))[0];
      if (b.telegram && pl?.telegram_id) await tgSend(pl.telegram_id, `<b>${b.title || 'BoraBet'}</b>\n${b.body || ''}`);
      return { ok: true };
    }
  }

  // ------------------------------------------------ finance
  if (r0 === 'deposits') {
    if (M === 'GET') {
      const st = req.query.status || 'open';
      let dq = sb.from('deposits').select('*, players(display_name,telegram_id)').order('created_at', { ascending: false }).limit(100);
      dq = st === 'open' ? dq.in('status', ['awaiting', 'detected']) : dq.in('status', ['credited', 'expired', 'rejected']);
      return { deposits: await q(dq) };
    }
    if (M === 'POST' && r1 && r2 === 'confirm') { const d = await confirmDeposit(r1, b.note); log('deposits.confirm', { id: r1 }); return { deposit: d }; }
    if (M === 'POST' && r1 && r2 === 'detect') {
      const out = await q(sb.from('deposits').update({ status: 'detected', confirmations: num(b.confirmations, 1), tx_hash: b.tx_hash || undefined, updated_at: new Date().toISOString() }).eq('id', r1).in('status', ['awaiting', 'expired']).select('*'));
      return { deposit: out[0] };
    }
    if (M === 'POST' && r1 && r2 === 'reject') {
      const out = await q(sb.from('deposits').update({ status: 'rejected', admin_note: b.note || null, updated_at: new Date().toISOString() }).eq('id', r1).in('status', ['awaiting', 'detected', 'expired']).select('*'));
      if (out[0]) await notify(out[0].player_id, 'deposit', 'Depósito não confirmado', b.note || 'Fale com o suporte.');
      return { deposit: out[0] };
    }
  }
  if (r0 === 'withdrawals') {
    if (M === 'GET') {
      const st = req.query.status || 'open';
      let wq = sb.from('withdrawals').select('*, players(display_name,telegram_id,kyc_level,kyc)').order('created_at', { ascending: false }).limit(100);
      wq = st === 'open' ? wq.in('status', ['requested', 'review', 'sent']) : wq.in('status', ['completed', 'rejected', 'cancelled']);
      return { withdrawals: await q(wq) };
    }
    if (M === 'POST' && r1 && r2) { const w = await setWithdrawal(r1, r2, b); log('withdrawals.' + r2, { id: r1 }); return { withdrawal: w }; }
  }

  // ------------------------------------------------ chat
  if (r0 === 'chat') {
    if (M === 'GET') {
      return {
        messages: await q(sb.from('chat_messages').select('*').order('id', { ascending: false }).limit(100)),
        rains: await q(sb.from('coin_rains').select('*').order('id', { ascending: false }).limit(10)),
      };
    }
    if (M === 'POST' && r1 === 'delete') { await sb.from('chat_messages').update({ deleted: true }).eq('id', b.id); signal('chat'); return { ok: true }; }
    if (M === 'POST' && r1 === 'announce') {
      await sb.from('chat_messages').insert({ name: 'BoraBet', role: 'MOD', text: String(b.text || '').slice(0, 300) });
      signal('chat');
      return { ok: true };
    }
    if (M === 'POST' && r1 === 'rain') {
      const pool = num(b.pool);
      const per = num(b.max_per_user);
      const secs = Math.min(600, Math.max(10, num(b.seconds, 30)));
      if (pool <= 0 || per <= 0) throw new ApiError(400, 'amount', 'Havuz ve kişi başı tutar zorunlu');
      await sb.from('coin_rains').insert({ pool, remaining: pool, max_per_user: per, ends_at: new Date(Date.now() + secs * 1000).toISOString() });
      await sb.from('chat_messages').insert({ name: 'BoraBet', role: 'MOD', text: `🌧️ Chuva de moedas! ${pool} BC para quem tocar em Pegar nos próximos ${secs} s.` });
      signal('chat'); log('chat.rain', { pool, per, secs });
      return { ok: true };
    }
  }

  // ------------------------------------------------ reports
  if (r0 === 'ledger') {
    const days = Math.min(90, num(req.query.days, 30));
    const rows = await q(sb.from('house_ledger').select('type,amount,created_at').gte('created_at', new Date(Date.now() - days * 86400000).toISOString()).limit(10000));
    const byDay = {};
    for (const r of rows) {
      const d = r.created_at.slice(0, 10);
      const x = (byDay[d] = byDay[d] || { day: d, commission: 0, bot_stake: 0, bot_win: 0, bonus: 0, admin_adjust: 0, net: 0 });
      x[r.type] = (x[r.type] || 0) + Number(r.amount);
      x.net += Number(r.amount);
    }
    return { days: Object.values(byDay).sort((a, b) => b.day.localeCompare(a.day)) };
  }
  if (r0 === 'log') return { log: await q(sb.from('admin_log').select('*').order('id', { ascending: false }).limit(100)) };

  throw new ApiError(404, 'not_found', 'Bilinmeyen admin işlemi');
});
