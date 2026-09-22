-- =====================================================================
-- BoraBet — Dominó Dupla 2v2 · Supabase şeması
-- Supabase > SQL Editor içinde BU DOSYANIN TAMAMINI bir kez çalıştırın.
-- (Tekrar çalıştırmak güvenlidir: IF NOT EXISTS / ON CONFLICT kullanır.)
-- =====================================================================
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- players
create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  telegram_id bigint unique,
  is_bot boolean not null default false,
  username text,
  first_name text,
  display_name text not null,
  avatar_color text default 'linear-gradient(140deg,#3B7BFF,#8B4DFF)',
  photo_url text,
  bot_skill int not null default 3 check (bot_skill between 1 and 5),
  bot_speed_min_ms int not null default 1600,
  bot_speed_max_ms int not null default 4800,
  bot_active boolean not null default true,
  bot_note text,
  balance_real numeric(14,2) not null default 0 check (balance_real >= 0),
  balance_bonus numeric(14,2) not null default 0 check (balance_bonus >= 0),
  balance_pending numeric(14,2) not null default 0 check (balance_pending >= 0),
  wager_remaining numeric(14,2) not null default 0 check (wager_remaining >= 0),
  xp bigint not null default 0,
  level int not null default 1,
  matches_played int not null default 0,
  matches_won int not null default 0,
  rounds_won int not null default 0,
  biggest_pot numeric(14,2) not null default 0,
  win_streak int not null default 0,
  best_streak int not null default 0,
  carrocas int not null default 0,
  laelos int not null default 0,
  fechamentos int not null default 0,
  forfeits int not null default 0,
  total_won numeric(14,2) not null default 0,
  daily_streak int not null default 0,
  last_daily_claim date,
  onboarding jsonb not null default '{}'::jsonb,
  welcome_given boolean not null default false,
  referral_code text unique,
  referred_by uuid references players(id),
  referral_rewarded boolean not null default false,
  kyc_level int not null default 0,
  kyc jsonb,
  limits jsonb not null default '{}'::jsonb,
  prefs jsonb not null default '{}'::jsonb,
  paused_until timestamptz,
  banned boolean not null default false,
  chat_muted_until timestamptz,
  last_seen timestamptz default now(),
  created_at timestamptz not null default now()
);
create index if not exists players_bot_idx on players(is_bot, bot_active);

create table if not exists settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz default now()
);

create table if not exists tiers (
  id serial primary key,
  name text not null unique,
  mode text not null default '2v2' check (mode in ('2v2','1v1')),
  stakes numeric[] not null default '{100}',
  target int not null default 200,
  tie_rule text not null default 'nao_fechou' check (tie_rule in ('nao_fechou','anula')),
  saida66 text not null default 'first' check (saida66 in ('first','always')),
  turn_seconds int not null default 20,
  is_free boolean not null default false,
  vip_min_level int not null default 0,
  bot_allowed boolean not null default true,
  active boolean not null default true,
  sort int not null default 0,
  subtitle text
);

create table if not exists matches (
  id uuid primary key default gen_random_uuid(),
  tier_id int references tiers(id),
  mode text not null,
  stake numeric(14,2) not null default 0,
  pot numeric(14,2) not null default 0,
  commission_pct numeric(5,2) not null default 10,
  status text not null default 'forming'
    check (status in ('forming','ready','playing','finished','annulled','cancelled')),
  is_free boolean not null default false,
  is_private boolean not null default false,
  invite_code text unique,
  seats jsonb not null default '[]'::jsonb,
  state jsonb,
  meta jsonb not null default '{}'::jsonb,
  version int not null default 0,
  turn_deadline timestamptz,
  bot_due_at timestamptz,
  phase_deadline timestamptz,
  settled boolean not null default false,
  result jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists matches_status_idx on matches(status, tier_id, stake);
create index if not exists matches_updated_idx on matches(updated_at);

create table if not exists match_players (
  match_id uuid references matches(id) on delete cascade,
  player_id uuid references players(id) on delete cascade,
  seat int not null,
  team int not null,
  is_bot boolean not null default false,
  partner_id uuid,
  result text,
  net numeric(14,2) default 0,
  score_us int, score_them int,
  tier_name text,
  finished_at timestamptz,
  primary key (match_id, player_id)
);
create index if not exists match_players_player_idx on match_players(player_id, finished_at desc);
create index if not exists match_players_finished_idx on match_players(finished_at desc);

create table if not exists signals (
  channel text primary key,
  version bigint not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists ledger (
  id bigserial primary key,
  player_id uuid references players(id) on delete cascade,
  type text not null,
  amount_real numeric(14,2) not null default 0,
  amount_bonus numeric(14,2) not null default 0,
  balance_real_after numeric(14,2),
  balance_bonus_after numeric(14,2),
  ref text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists ledger_player_idx on ledger(player_id, created_at desc);
create index if not exists ledger_type_idx on ledger(type, created_at desc);

create table if not exists house_ledger (
  id bigserial primary key,
  type text not null,
  amount numeric(14,2) not null,
  ref text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists house_ledger_idx on house_ledger(type, created_at desc);

create table if not exists deposits (
  id uuid primary key default gen_random_uuid(),
  player_id uuid references players(id) on delete cascade,
  asset text not null, network text not null,
  amount_bc numeric(14,2) not null,
  bonus_bc numeric(14,2) not null default 0,
  address text,
  tx_hash text,
  status text not null default 'awaiting'
    check (status in ('awaiting','detected','credited','expired','rejected')),
  confirmations int default 0,
  quote_expires_at timestamptz,
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  credited_at timestamptz
);
create index if not exists deposits_status_idx on deposits(status, created_at desc);

create table if not exists wallet_addresses (
  id uuid primary key default gen_random_uuid(),
  player_id uuid references players(id) on delete cascade,
  label text, asset text not null, address text not null,
  available_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (player_id, asset, address)
);

create table if not exists withdrawals (
  id uuid primary key default gen_random_uuid(),
  player_id uuid references players(id) on delete cascade,
  asset text not null, network text not null, address text not null,
  amount_bc numeric(14,2) not null,
  fee_bc numeric(14,2) not null default 0,
  status text not null default 'requested'
    check (status in ('requested','review','sent','completed','rejected','cancelled')),
  tx_hash text,
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists withdrawals_status_idx on withdrawals(status, created_at desc);

create table if not exists mission_templates (
  id serial primary key,
  code text unique not null,
  scope text not null check (scope in ('daily','weekly','level','achievement')),
  metric text not null,
  agg text not null default 'sum' check (agg in ('sum','max')),
  title_pt text not null,
  title_tr text not null,
  icon text default 'domino',
  base_target numeric not null default 1,
  target_per_level numeric not null default 0,
  target_growth numeric not null default 1.0,
  target_variance numeric not null default 0.15,
  target_round int not null default 1,
  reward_bc_base numeric not null default 0,
  reward_bc_per_level numeric not null default 0,
  reward_xp_base numeric not null default 0,
  reward_xp_per_level numeric not null default 0,
  reward_growth numeric not null default 1.0,
  min_level int not null default 1,
  max_level int not null default 999,
  weight int not null default 10,
  active boolean not null default true,
  created_at timestamptz default now()
);

create table if not exists player_missions (
  id uuid primary key default gen_random_uuid(),
  player_id uuid references players(id) on delete cascade,
  template_id int references mission_templates(id) on delete cascade,
  scope text not null,
  metric text not null,
  agg text not null default 'sum',
  title text not null,
  icon text,
  target numeric not null,
  progress numeric not null default 0,
  reward_bc numeric not null default 0,
  reward_xp numeric not null default 0,
  period_key text not null,
  chain_index int not null default 0,
  status text not null default 'active' check (status in ('active','completed','claimed','expired')),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  claimed_at timestamptz
);
create index if not exists pm_player_idx on player_missions(player_id, status);
create unique index if not exists pm_unique_period on player_missions(player_id, template_id, period_key, chain_index);

create table if not exists chat_messages (
  id bigserial primary key,
  player_id uuid references players(id) on delete set null,
  name text not null,
  role text,
  text text not null,
  deleted boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists chat_idx on chat_messages(created_at desc);

create table if not exists coin_rains (
  id serial primary key,
  pool numeric(14,2) not null,
  remaining numeric(14,2) not null,
  max_per_user numeric(14,2) not null,
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  created_at timestamptz default now()
);
create table if not exists rain_claims (
  rain_id int references coin_rains(id) on delete cascade,
  player_id uuid references players(id) on delete cascade,
  amount numeric(14,2) not null,
  created_at timestamptz default now(),
  primary key (rain_id, player_id)
);

create table if not exists notifications (
  id bigserial primary key,
  player_id uuid references players(id) on delete cascade,
  kind text not null,
  title text not null,
  body text,
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists notif_idx on notifications(player_id, created_at desc);

create table if not exists admin_log (
  id bigserial primary key,
  action text not null,
  meta jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

-- =====================================================================
-- RPC: atomik cüzdan işlemleri
-- =====================================================================
create or replace function wallet_apply(
  p_player uuid, p_real numeric, p_bonus numeric, p_type text,
  p_ref text default null, p_meta jsonb default '{}'::jsonb, p_wager_add numeric default 0
) returns jsonb language plpgsql as $$
declare r players%rowtype;
begin
  select * into r from players where id = p_player for update;
  if not found then raise exception 'player_not_found'; end if;
  if r.balance_real + p_real < 0 or r.balance_bonus + p_bonus < 0 then
    raise exception 'insufficient_balance';
  end if;
  update players set
    balance_real = balance_real + p_real,
    balance_bonus = balance_bonus + p_bonus,
    wager_remaining = greatest(0, wager_remaining + p_wager_add)
  where id = p_player returning * into r;
  insert into ledger(player_id,type,amount_real,amount_bonus,balance_real_after,balance_bonus_after,ref,meta)
  values (p_player,p_type,p_real,p_bonus,r.balance_real,r.balance_bonus,p_ref,coalesce(p_meta,'{}'::jsonb));
  return jsonb_build_object('real',r.balance_real,'bonus',r.balance_bonus,'wager',r.wager_remaining);
end $$;

create or replace function wallet_stake(p_player uuid, p_amount numeric, p_ref text, p_meta jsonb default '{}'::jsonb)
returns jsonb language plpgsql as $$
declare r players%rowtype; take_real numeric; take_bonus numeric; released numeric := 0;
begin
  select * into r from players where id = p_player for update;
  if not found then raise exception 'player_not_found'; end if;
  if r.balance_real + r.balance_bonus < p_amount then raise exception 'insufficient_balance'; end if;
  take_real := least(r.balance_real, p_amount);
  take_bonus := p_amount - take_real;
  update players set
    balance_real = balance_real - take_real,
    balance_bonus = balance_bonus - take_bonus,
    wager_remaining = greatest(0, wager_remaining - p_amount)
  where id = p_player returning * into r;
  insert into ledger(player_id,type,amount_real,amount_bonus,balance_real_after,balance_bonus_after,ref,meta)
  values (p_player,'stake',-take_real,-take_bonus,r.balance_real,r.balance_bonus,p_ref,p_meta);
  if r.wager_remaining = 0 and r.balance_bonus > 0 then
    released := r.balance_bonus;
    update players set balance_real = balance_real + released, balance_bonus = 0
      where id = p_player returning * into r;
    insert into ledger(player_id,type,amount_real,amount_bonus,balance_real_after,balance_bonus_after,ref,meta)
    values (p_player,'bonus_release',released,-released,r.balance_real,r.balance_bonus,p_ref,'{}'::jsonb);
  end if;
  return jsonb_build_object('real',take_real,'bonus',take_bonus,'released',released);
end $$;

create or replace function match_debit(p_match uuid, p_entries jsonb) returns jsonb
language plpgsql as $$
declare e jsonb; r players%rowtype; res jsonb := '[]'::jsonb; part jsonb;
begin
  for e in select * from jsonb_array_elements(p_entries) loop
    select * into r from players where id = (e->>'pid')::uuid for update;
    if not found or r.banned or r.balance_real + r.balance_bonus < (e->>'amount')::numeric then
      return jsonb_build_object('ok',false,'pid',e->>'pid');
    end if;
  end loop;
  for e in select * from jsonb_array_elements(p_entries) loop
    part := wallet_stake((e->>'pid')::uuid,(e->>'amount')::numeric,p_match::text,
                         jsonb_build_object('match',p_match));
    res := res || jsonb_build_array(jsonb_build_object('pid',e->>'pid','real',part->'real','bonus',part->'bonus'));
  end loop;
  return jsonb_build_object('ok',true,'parts',res);
end $$;


-- Maç başlangıcı: versiyon kontrolü + tüm insanlardan birlikte kesinti (biri yetmezse hiçbiri).
create or replace function start_match(
  p_match uuid, p_version int, p_entries jsonb, p_seats jsonb, p_state jsonb, p_meta jsonb,
  p_turn_deadline timestamptz, p_bot_due timestamptz, p_pot numeric
) returns jsonb language plpgsql as $$
declare e jsonb; r players%rowtype; res jsonb := '[]'::jsonb; part jsonb; found_row uuid;
begin
  for e in select * from jsonb_array_elements(coalesce(p_entries,'[]'::jsonb)) loop
    select * into r from players where id = (e->>'pid')::uuid for update;
    if not found or r.banned or r.balance_real + r.balance_bonus < (e->>'amount')::numeric then
      return jsonb_build_object('ok',false,'pid',e->>'pid');
    end if;
  end loop;
  update matches set status='playing', seats=p_seats, state=p_state, meta=p_meta,
    turn_deadline=p_turn_deadline, bot_due_at=p_bot_due, pot=p_pot, phase_deadline=null,
    version=version+1, started_at=now(), updated_at=now()
  where id=p_match and version=p_version and status='ready'
  returning id into found_row;
  if found_row is null then return jsonb_build_object('ok',false,'conflict',true); end if;
  for e in select * from jsonb_array_elements(coalesce(p_entries,'[]'::jsonb)) loop
    part := wallet_stake((e->>'pid')::uuid,(e->>'amount')::numeric,p_match::text,jsonb_build_object('match',p_match));
    res := res || jsonb_build_array(jsonb_build_object('pid',e->>'pid','real',part->'real','bonus',part->'bonus'));
  end loop;
  update matches set meta = meta || jsonb_build_object('paid',res) where id=p_match;
  return jsonb_build_object('ok',true,'parts',res);
end $$;

create or replace function settle_match(p_match uuid, p_payouts jsonb, p_house jsonb)
returns boolean language plpgsql as $$
declare e jsonb; done boolean;
begin
  update matches set settled = true where id = p_match and settled = false returning settled into done;
  if done is null then return false; end if;
  for e in select * from jsonb_array_elements(coalesce(p_payouts,'[]'::jsonb)) loop
    perform wallet_apply((e->>'pid')::uuid, coalesce((e->>'real')::numeric,0), coalesce((e->>'bonus')::numeric,0),
      e->>'type', p_match::text, coalesce(e->'meta','{}'::jsonb), 0);
  end loop;
  for e in select * from jsonb_array_elements(coalesce(p_house,'[]'::jsonb)) loop
    insert into house_ledger(type,amount,ref,meta)
    values (e->>'type',(e->>'amount')::numeric,p_match::text,coalesce(e->'meta','{}'::jsonb));
  end loop;
  return true;
end $$;

create or replace function player_progress(p_player uuid, p jsonb) returns jsonb
language plpgsql as $$
declare r players%rowtype;
  won boolean := coalesce((p->>'won')::boolean,false);
  counted boolean := coalesce((p->>'counted')::boolean,true);
begin
  update players set
    xp = xp + coalesce((p->>'xp')::int,0),
    matches_played = matches_played + case when counted then 1 else 0 end,
    matches_won = matches_won + case when won then 1 else 0 end,
    rounds_won = rounds_won + coalesce((p->>'rounds_won')::int,0),
    carrocas = carrocas + coalesce((p->>'carrocas')::int,0),
    laelos = laelos + coalesce((p->>'laelos')::int,0),
    fechamentos = fechamentos + coalesce((p->>'fechamentos')::int,0),
    forfeits = forfeits + coalesce((p->>'forfeit')::int,0),
    total_won = total_won + greatest(0,coalesce((p->>'net')::numeric,0)),
    biggest_pot = greatest(biggest_pot, case when won then coalesce((p->>'pot')::numeric,0) else 0 end),
    best_streak = greatest(best_streak, case when won then win_streak + 1 else 0 end),
    win_streak = case when not counted then win_streak when won then win_streak + 1 else 0 end
  where id = p_player returning * into r;
  return jsonb_build_object('xp',r.xp,'level',r.level,'win_streak',r.win_streak);
end $$;


create or replace function pending_add(p_player uuid, p_amount numeric) returns void language sql as $$
  update players set balance_pending = greatest(0, balance_pending + p_amount) where id = p_player;
$$;

create or replace function rain_take(p_rain int, p_amount numeric) returns numeric language plpgsql as $$
declare r numeric; got numeric;
begin
  select remaining into r from coin_rains
   where id = p_rain and now() between starts_at and ends_at for update;
  if r is null or r <= 0 then return 0; end if;
  got := least(r, p_amount);
  update coin_rains set remaining = remaining - got where id = p_rain;
  return got;
end $$;

create or replace function bump_signal(p_channel text) returns void language sql as $$
  insert into signals(channel,version,updated_at) values (p_channel,1,now())
  on conflict (channel) do update set version = signals.version + 1, updated_at = now();
$$;

create or replace function leaderboard(p_since timestamptz, p_bots boolean, p_limit int)
returns table(player_id uuid, display_name text, avatar_color text, is_bot boolean, level int, wins bigint, played bigint)
language sql stable as $$
  select p.id, p.display_name, p.avatar_color, p.is_bot, p.level,
         count(*) filter (where mp.result = 'win') as wins,
         count(*) as played
  from match_players mp join players p on p.id = mp.player_id
  where mp.finished_at >= p_since and mp.result in ('win','loss','forfeit')
    and (p_bots or not p.is_bot)
  group by p.id
  order by wins desc, played asc
  limit p_limit;
$$;

-- =====================================================================
-- RLS: her şey sunucu (service role) üzerinden. Tarayıcı sadece "signals" okuyabilir.
-- =====================================================================
alter table players enable row level security;
alter table settings enable row level security;
alter table tiers enable row level security;
alter table matches enable row level security;
alter table match_players enable row level security;
alter table signals enable row level security;
alter table ledger enable row level security;
alter table house_ledger enable row level security;
alter table deposits enable row level security;
alter table wallet_addresses enable row level security;
alter table withdrawals enable row level security;
alter table mission_templates enable row level security;
alter table player_missions enable row level security;
alter table chat_messages enable row level security;
alter table coin_rains enable row level security;
alter table rain_claims enable row level security;
alter table notifications enable row level security;
alter table admin_log enable row level security;

drop policy if exists signals_read on signals;
create policy signals_read on signals for select using (true);

do $$ begin
  begin
    alter publication supabase_realtime add table signals;
  exception when others then null;
  end;
end $$;

-- =====================================================================
-- SEED
-- =====================================================================
insert into settings(key,value) values
 ('commission_pct','10'),
 ('mult_carroca','2'),
 ('mult_laelo','3'),
 ('mult_cruzada','4'),
 ('bot_fill_probability','70'),
 ('bot_fill_delay_min_s','4'),
 ('bot_fill_delay_max_s','14'),
 ('matchmaking_max_wait_s','25'),
 ('allow_manual_bot_fill','true'),
 ('bots_in_ranking','false'),
 ('bots_in_ticker','false'),
 ('ready_check_s','12'),
 ('round_break_s','7'),
 ('time_bank_count','2'),
 ('time_bank_s','10'),
 ('max_timeouts','3'),
 ('reconnect_grace_s','20'),
 ('welcome_bonus','200'),
 ('wagering_multiplier','3'),
 ('deposit_bonus_pct','10'),
 ('min_deposit','100'),
 ('max_deposit','500000'),
 ('quote_minutes','15'),
 ('deposit_addresses','{"usdt_trc20":"","ton":""}'),
 ('withdraw_fee','{"usdt_trc20":120,"ton":50}'),
 ('min_withdraw','1000'),
 ('new_address_delay_h','24'),
 ('kyc2_threshold','10000'),
 ('daily_rewards','[50,75,100,150,200,300,500]'),
 ('reward_balance','"bonus"'),
 ('reward_wager_mult','1'),
 ('missions_daily_count','3'),
 ('missions_weekly_count','3'),
 ('missions_level_slots','2'),
 ('xp_base','100'),
 ('xp_exp','1.45'),
 ('xp_match','20'),
 ('xp_win','30'),
 ('xp_round_won','3'),
 ('level_up_bonus','25'),
 ('level_tiers','[{"name":"Novato","min":1},{"name":"Parceiro","min":5},{"name":"Craque","min":12},{"name":"Fera","min":25},{"name":"Lenda","min":40}]'),
 ('referral_bonus','500'),
 ('chat_slow_mode_s','3'),
 ('maintenance','false'),
 ('timezone','"America/Sao_Paulo"'),
 ('license_text','"Licença [Nº DA LICENÇA]"'),
 ('support_url','"https://t.me/"')
on conflict (key) do nothing;

insert into tiers(name,mode,stakes,target,tie_rule,saida66,turn_seconds,is_free,vip_min_level,sort,subtitle) values
 ('Mesa de estreia','2v2','{0}',100,'nao_fechou','first',20,true,0,0,'Primeira mesa grátis · 100 pontos'),
 ('Mesa Rápida','2v2','{50,100,250}',100,'nao_fechou','first',20,false,0,1,'Dupla 2v2 · ~6 min'),
 ('Mesa Clássica','2v2','{100,250,500,1000,2500}',200,'nao_fechou','first',20,false,0,2,'Dupla 2v2 · 200 pontos'),
 ('Mesa Nordeste','2v2','{500,1000,2500,5000}',200,'anula','always',20,false,12,3,'Saída 6-6 toda rodada · VIP'),
 ('Mesa 1v1','1v1','{50,100,250,500,1000}',100,'nao_fechou','first',20,false,0,4,'Um contra um · com dorme')
on conflict (name) do nothing;

insert into mission_templates(code,scope,metric,agg,title_pt,title_tr,icon,base_target,target_per_level,target_growth,target_variance,target_round,reward_bc_base,reward_bc_per_level,reward_xp_base,reward_xp_per_level,reward_growth,min_level,weight) values
 ('d_play','daily','matches_played','sum','Jogue {n} partidas','{n} maç oyna','domino',3,0.08,1,0.2,1,40,3,20,1,1,1,20),
 ('d_win','daily','matches_won','sum','Vença {n} partidas','{n} maç kazan','trophy',1,0.05,1,0.2,1,60,4,30,2,1,1,16),
 ('d_tiles','daily','tiles_played','sum','Jogue {n} peças','{n} taş oyna','domino',30,2,1,0.2,5,30,2,15,1,1,1,14),
 ('d_rounds','daily','rounds_won','sum','Ganhe {n} rodadas','{n} el kazan','star',4,0.3,1,0.2,1,40,3,20,1,1,1,14),
 ('d_batida','daily','batidas','sum','Bata {n} vezes','{n} kez bitir (batida)','fire',2,0.1,1,0.2,1,50,3,25,1,1,2,12),
 ('d_carroca','daily','carrocas','sum','Bata com carroça {n}x','{n} kez çift taşla bitir (carroça)','crown',1,0,1,0,1,90,5,40,2,1,3,6),
 ('d_pass','daily','opp_passes','sum','Faça o adversário passar {n}x','Rakibi {n} kez pas geçmeye zorla','shield',5,0.3,1,0.2,1,45,3,20,1,1,2,10),
 ('d_points','daily','points_scored','sum','Marque {n} pontos','{n} puan topla','coin',150,10,1,0.2,10,50,3,25,1,1,1,12),
 ('d_streak','daily','win_streak','max','Vença {n} seguidas','Üst üste {n} maç kazan','fire',2,0.04,1,0,1,120,6,50,2,1,4,6),
 ('d_login','daily','daily_claim','sum','Resgate a recompensa diária','Günlük ödülü al','gift',1,0,1,0,1,20,0,10,0,1,1,8),
 ('d_chat','daily','chat_messages','sum','Mande {n} mensagens no chat','Sohbete {n} mesaj yaz','chat',3,0,1,0,1,15,0,10,0,1,1,4),
 ('w_play','weekly','matches_played','sum','Jogue {n} partidas na semana','Haftada {n} maç oyna','domino',15,0.5,1,0.15,1,250,15,120,5,1,1,20),
 ('w_win','weekly','matches_won','sum','Vença {n} partidas na semana','Haftada {n} maç kazan','trophy',7,0.3,1,0.15,1,350,20,160,6,1,1,18),
 ('w_laelo','weekly','laelos','sum','Bata lá e lô {n}x','{n} kez lá e lô ile bitir','gem',1,0.05,1,0,1,300,15,120,5,1,3,8),
 ('w_fech','weekly','fechamentos','sum','Vença {n} fechamentos','{n} kapanan oyun (fechamento) kazan','shield',3,0.1,1,0.15,1,220,10,100,4,1,2,10),
 ('w_bc','weekly','bc_won','sum','Ganhe {n} BC em mesas','Masalarda {n} BC kazan','coin',1000,80,1,0.15,100,300,15,120,5,1,2,10),
 ('l_play','level','matches_played','sum','Jogue {n} partidas','{n} maç oyna (seviye zinciri)','domino',5,0.4,1.3,0.1,1,80,6,60,3,1.2,1,20),
 ('l_win','level','matches_won','sum','Vença {n} partidas','{n} maç kazan (seviye zinciri)','trophy',3,0.25,1.3,0.1,1,120,8,80,4,1.2,1,18),
 ('l_points','level','points_scored','sum','Marque {n} pontos','{n} puan topla (seviye zinciri)','coin',300,25,1.35,0.1,10,100,6,70,3,1.2,1,14),
 ('l_tiles','level','tiles_played','sum','Jogue {n} peças','{n} taş oyna (seviye zinciri)','domino',60,5,1.3,0.1,5,70,5,50,3,1.2,1,12),
 ('a_carroca','achievement','carrocas','sum','Conquista: {n} carroças batidas','Başarım: {n} carroça','crown',5,0,2.5,0,1,200,0,150,0,1.8,1,10),
 ('a_laelo','achievement','laelos','sum','Conquista: {n} lá e lô','Başarım: {n} lá e lô','gem',3,0,2.5,0,1,250,0,180,0,1.8,1,10),
 ('a_wins','achievement','matches_won','sum','Conquista: {n} vitórias','Başarım: {n} galibiyet','trophy',10,0,2.5,0,1,300,0,200,0,1.8,1,10),
 ('a_streak','achievement','win_streak','max','Conquista: {n} vitórias seguidas','Başarım: üst üste {n} galibiyet','fire',3,0,1.6,0,1,250,0,200,0,1.6,1,10),
 ('a_fech','achievement','fechamentos','sum','Conquista: {n} fechamentos vencidos','Başarım: {n} fechamento','shield',10,0,2.5,0,1,200,0,150,0,1.8,1,10)
on conflict (code) do nothing;

insert into players(is_bot,display_name,username,avatar_color,bot_skill,bot_speed_min_ms,bot_speed_max_ms,level,xp)
select * from (values
 (true,'Tião','tiao_bot','linear-gradient(140deg,#3DDB5F,#0E7A4B)',3,1800,5200,8,1400),
 (true,'Jow','jow_bot','linear-gradient(140deg,#F2B705,#F0424B)',4,1500,4400,14,3600),
 (true,'Bia','bia_bot','linear-gradient(140deg,#8B4DFF,#3B7BFF)',3,2000,5600,10,2100),
 (true,'Cris','cris_bot','linear-gradient(140deg,#FF7A59,#F2B705)',2,2200,6000,5,700),
 (true,'Léo','leo_bot','linear-gradient(140deg,#3B7BFF,#0E7A4B)',4,1400,4200,16,4200),
 (true,'Rafa','rafa_bot','linear-gradient(140deg,#F0424B,#8B4DFF)',5,1600,4600,22,7200),
 (true,'Dona Zefa','zefa_bot','linear-gradient(140deg,#D4A017,#7A4A1E)',4,2600,6800,19,5600),
 (true,'Seu Zé','seuze_bot','linear-gradient(140deg,#A9B0C6,#3B2414)',3,2400,6400,11,2400),
 (true,'Nando','nando_bot','linear-gradient(140deg,#12925B,#3B7BFF)',2,1900,5400,4,500),
 (true,'Paty','paty_bot','linear-gradient(140deg,#FF6FB5,#8B4DFF)',3,1700,5000,7,1100)
) v(is_bot,display_name,username,avatar_color,bot_skill,bot_speed_min_ms,bot_speed_max_ms,level,xp)
where not exists (select 1 from players where is_bot);
