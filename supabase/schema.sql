-- ============================================================================
-- STOCKLY — Phase 1 database schema
-- Run this once in Supabase: Project > SQL Editor > New query > paste > Run.
-- Safe to re-run: uses "if not exists" / "or replace" everywhere it can.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. PROFILES
-- One row per customer, linked 1:1 to Supabase's built-in auth.users table.
-- This is where the "Stockly Login Word", business profile, membership,
-- and referral info live.
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  phone text,
  business_name text,
  business_type text,
  contact_person text,
  delivery_address text,
  billing_address text,
  vat_number text,
  preferred_suppliers text[],
  delivery_instructions text,
  business_notes text,
  login_word text unique,              -- e.g. "BLUE-TIGER-482"
  referral_code text unique,
  referred_by uuid references public.profiles(id),
  membership text default 'none',      -- 'none' | 'essential' | 'business' | 'pro'
  substitution_preference text default 'ask', -- 'ask' | 'similar_ok' | 'never' | 'max_extra'
  substitution_max_extra numeric,
  first_run_discount_used boolean default false,
  is_admin boolean default false,
  created_at timestamptz default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin" on public.profiles
  for select using (
    id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (id = auth.uid());

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert with check (id = auth.uid());

-- Auto-create a profile row whenever someone signs up via Supabase Auth,
-- pulling the extra fields out of the signup metadata the app sends.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, phone, business_name, referral_code)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'phone',
    new.raw_user_meta_data ->> 'business_name',
    upper(substr(regexp_replace(coalesce(new.raw_user_meta_data ->> 'business_name', 'STOCKLY'), '[^a-zA-Z]', '', 'g'), 1, 5))
      || floor(random() * 900 + 100)::text
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Looks up a referral code and returns just the referring profile's id —
-- without this, a customer couldn't look up someone ELSE's referral code
-- because the RLS policy above only lets them read their own row.
create or replace function public.lookup_referral_code(code text)
returns uuid
language sql
security definer set search_path = public
stable
as $$
  select id from public.profiles where referral_code = upper(code) limit 1;
$$;

-- ----------------------------------------------------------------------------
-- 2. SINGLE RUNS  (one-off orders — fully independent from recurring runs)
-- ----------------------------------------------------------------------------
create table if not exists public.single_runs (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'Requested', -- Requested/Confirmed/Purchasing/Collected/Out for Delivery/Delivered
  cash_and_carry text,
  delivery_address text,
  scheduled_for date,
  notes text,
  service_fee numeric default 0,
  supplier_total numeric default 0,
  discount_applied text,          -- e.g. 'first_run', 'REF-CODE123'
  discount_amount numeric default 0,
  substitution jsonb,             -- { requested, unavailable, alternative, diff, resolved }
  shopper_name text,
  driver_name text,
  receipt_uploaded boolean default false,
  pod_uploaded boolean default false,
  created_at timestamptz default now()
);

alter table public.single_runs enable row level security;

drop policy if exists "single_runs_owner_or_admin_select" on public.single_runs;
create policy "single_runs_owner_or_admin_select" on public.single_runs
  for select using (
    customer_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );

drop policy if exists "single_runs_owner_insert" on public.single_runs;
create policy "single_runs_owner_insert" on public.single_runs
  for insert with check (customer_id = auth.uid());

drop policy if exists "single_runs_owner_or_admin_update" on public.single_runs;
create policy "single_runs_owner_or_admin_update" on public.single_runs
  for update using (
    customer_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );

-- ----------------------------------------------------------------------------
-- 3. RECURRING RUNS  (the customer's standing/scheduled orders)
-- ----------------------------------------------------------------------------
create table if not exists public.recurring_runs (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,               -- e.g. "Tuesday Takeaway Run"
  frequency text not null,          -- 'weekly' | 'biweekly' | 'monthly' | 'custom'
  day_of_week text,                 -- e.g. 'Tuesday'
  cash_and_carry text,
  active boolean default true,
  created_at timestamptz default now()
);

alter table public.recurring_runs enable row level security;

drop policy if exists "recurring_runs_owner_or_admin_select" on public.recurring_runs;
create policy "recurring_runs_owner_or_admin_select" on public.recurring_runs
  for select using (
    customer_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );

drop policy if exists "recurring_runs_owner_all" on public.recurring_runs;
create policy "recurring_runs_owner_insert" on public.recurring_runs
  for insert with check (customer_id = auth.uid());
create policy "recurring_runs_owner_update" on public.recurring_runs
  for update using (customer_id = auth.uid());
create policy "recurring_runs_owner_delete" on public.recurring_runs
  for delete using (customer_id = auth.uid());

-- ----------------------------------------------------------------------------
-- 4. RUN ITEMS  (shared line-item table for both single & recurring runs)
-- ----------------------------------------------------------------------------
create table if not exists public.run_items (
  id uuid primary key default gen_random_uuid(),
  run_type text not null check (run_type in ('single', 'recurring')),
  run_id uuid not null,
  product text not null,
  brand text,
  qty numeric default 1,
  unit text default 'Units',
  barcode text,
  category text,
  image_url text,
  notes text,
  created_at timestamptz default now()
);

alter table public.run_items enable row level security;

-- A run_item is visible if the run it belongs to is visible to this user.
drop policy if exists "run_items_via_single_run" on public.run_items;
create policy "run_items_via_single_run" on public.run_items
  for all using (
    (run_type = 'single' and exists (
      select 1 from public.single_runs r where r.id = run_id
      and (r.customer_id = auth.uid() or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin))
    ))
    or
    (run_type = 'recurring' and exists (
      select 1 from public.recurring_runs r where r.id = run_id
      and (r.customer_id = auth.uid() or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin))
    ))
  );

-- ----------------------------------------------------------------------------
-- 5. SAVED SHOPPING LISTS
-- ----------------------------------------------------------------------------
create table if not exists public.saved_lists (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,               -- e.g. "Monday Essentials"
  items jsonb not null default '[]', -- [{ product, brand, qty, unit }]
  created_at timestamptz default now()
);

alter table public.saved_lists enable row level security;

drop policy if exists "saved_lists_owner_all" on public.saved_lists;
create policy "saved_lists_owner_all" on public.saved_lists
  for all using (customer_id = auth.uid()) with check (customer_id = auth.uid());

-- ----------------------------------------------------------------------------
-- 6. WEEKLY DEALS (cash & carry deal flyers/images)
-- Manually uploaded by the Stockly team each week — a photo/scan of each
-- cash & carry's current deals sheet, shown publicly on the website.
-- To add one: Supabase > Storage > create a public bucket called
-- "weekly-deals" (once), upload the image there, copy its public URL, then
-- add a row here via Table Editor with that URL.
-- ----------------------------------------------------------------------------
create table if not exists public.weekly_deals (
  id uuid primary key default gen_random_uuid(),
  supplier_name text not null,        -- e.g. "Bestway", "Booker", "Costco Trade"
  image_url text not null,            -- public URL of the uploaded deal image
  caption text,                       -- optional, e.g. "Deals w/c 1 Sept"
  week_start date default current_date,
  created_at timestamptz default now()
);

alter table public.weekly_deals enable row level security;

-- Anyone (including logged-out visitors) can view deal images — it's
-- public marketing content, not customer data.
drop policy if exists "weekly_deals_public_read" on public.weekly_deals;
create policy "weekly_deals_public_read" on public.weekly_deals
  for select using (true);

-- Only admins can add/edit/remove deal images.
drop policy if exists "weekly_deals_admin_write" on public.weekly_deals;
create policy "weekly_deals_admin_write" on public.weekly_deals
  for all using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));

create index if not exists idx_weekly_deals_supplier on public.weekly_deals(supplier_name, week_start desc);

-- ----------------------------------------------------------------------------
-- Helpful indexes
-- ----------------------------------------------------------------------------
create index if not exists idx_single_runs_customer on public.single_runs(customer_id);
create index if not exists idx_recurring_runs_customer on public.recurring_runs(customer_id);
create index if not exists idx_run_items_run on public.run_items(run_type, run_id);
create index if not exists idx_saved_lists_customer on public.saved_lists(customer_id);
