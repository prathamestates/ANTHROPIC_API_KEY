-- STOCKLY PHASE 11 — REAL OPS ROLES, ASSIGNMENTS AND RUN EVENTS
-- Run after the existing schema.sql in Supabase SQL Editor.
-- Safe to re-run.

-- ------------------------------------------------------------
-- 1. OPS ROLES
-- ------------------------------------------------------------

alter table public.profiles
  add column if not exists is_shopper boolean not null default false,
  add column if not exists is_driver boolean not null default false;

-- ------------------------------------------------------------
-- 2. ASSIGNMENT COLUMNS
-- ------------------------------------------------------------

alter table public.single_runs
  add column if not exists assigned_shopper uuid
    references public.profiles(id)
    on delete set null,

  add column if not exists assigned_driver uuid
    references public.profiles(id)
    on delete set null;

create index if not exists idx_single_runs_assigned_shopper
  on public.single_runs(assigned_shopper);

create index if not exists idx_single_runs_assigned_driver
  on public.single_runs(assigned_driver);

-- ------------------------------------------------------------
-- 3. RUN EVENTS / AUDIT TRAIL
-- ------------------------------------------------------------

create table if not exists public.run_events (
  id uuid primary key default gen_random_uuid(),

  run_id uuid not null
    references public.single_runs(id)
    on delete cascade,

  event_type text not null,

  from_value text,

  to_value text,

  note text,

  actor_id uuid
    references public.profiles(id)
    on delete set null,

  actor_label text,

  created_at timestamptz not null default now()
);

alter table public.run_events enable row level security;

create index if not exists idx_run_events_run_created
  on public.run_events(run_id, created_at desc);

-- Users can read events for runs they are allowed to see.

drop policy if exists "run_events_select_visible_runs"
on public.run_events;

create policy "run_events_select_visible_runs"
on public.run_events
for select
using (
  exists (
    select 1
    from public.single_runs r
    where r.id = run_events.run_id
      and (
        r.customer_id = auth.uid()

        or r.assigned_shopper = auth.uid()

        or r.assigned_driver = auth.uid()

        or exists (
          select 1
          from public.profiles p
          where p.id = auth.uid()
            and p.is_admin
        )
      )
  )
);

-- Direct event inserts are deliberately blocked.
-- The RPC below is the controlled write path so the actor
-- is always derived from auth.uid().

drop policy if exists "run_events_no_direct_insert"
on public.run_events;

create policy "run_events_no_direct_insert"
on public.run_events
for insert
with check (false);

-- ------------------------------------------------------------
-- 4. TIGHTEN OPS ACCESS TO SINGLE RUNS
-- ------------------------------------------------------------

drop policy if exists "single_runs_ops_select"
on public.single_runs;

create policy "single_runs_ops_select"
on public.single_runs
for select
using (
  customer_id = auth.uid()

  or assigned_shopper = auth.uid()

  or assigned_driver = auth.uid()

  or exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_admin
  )
);

-- Remove the broad customer/admin update policy from the
-- original schema.
--
-- Customers should not be able to alter operational fields
-- such as status, assignments or receipt/POD flags.

drop policy if exists "single_runs_owner_or_admin_update"
on public.single_runs;

drop policy if exists "single_runs_ops_update"
on public.single_runs;

create policy "single_runs_ops_update"
on public.single_runs
for update
using (
  assigned_shopper = auth.uid()

  or assigned_driver = auth.uid()

  or exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_admin
  )
)
with check (
  customer_id is not null

  and (
    assigned_shopper = auth.uid()

    or assigned_driver = auth.uid()

    or exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.is_admin
    )
  )
);

-- The customer still needs to create runs.

drop policy if exists "single_runs_owner_insert"
on public.single_runs;

create policy "single_runs_owner_insert"
on public.single_runs
for insert
with check (
  customer_id = auth.uid()
);

-- ------------------------------------------------------------
-- 5. OPS ACCESS TO RUN ITEMS
-- ------------------------------------------------------------

drop policy if exists "run_items_via_single_run"
on public.run_items;

drop policy if exists "run_items_via_visible_run"
on public.run_items;

create policy "run_items_visible_to_run_participants"
on public.run_items
for select
using (
  (
    run_type = 'single'
    and exists (
      select 1
      from public.single_runs r
      where r.id = run_id
        and (
          r.customer_id = auth.uid()

          or r.assigned_shopper = auth.uid()

          or r.assigned_driver = auth.uid()

          or exists (
            select 1
            from public.profiles p
            where p.id = auth.uid()
              and p.is_admin
          )
        )
    )
  )

  or

  (
    run_type = 'recurring'
    and exists (
      select 1
      from public.recurring_runs r
      where r.id = run_id
        and (
          r.customer_id = auth.uid()

          or exists (
            select 1
            from public.profiles p
            where p.id = auth.uid()
              and p.is_admin
          )
        )
    )
  )
);

create policy "run_items_customer_or_admin_insert"
on public.run_items
for insert
with check (
  (
    run_type = 'single'
    and exists (
      select 1
      from public.single_runs r
      where r.id = run_id
        and (
          r.customer_id = auth.uid()

          or exists (
            select 1
            from public.profiles p
            where p.id = auth.uid()
              and p.is_admin
          )
        )
    )
  )

  or

  (
    run_type = 'recurring'
    and exists (
      select 1
      from public.recurring_runs r
      where r.id = run_id
        and (
          r.customer_id = auth.uid()

          or exists (
            select 1
            from public.profiles p
            where p.id = auth.uid()
              and p.is_admin
          )
        )
    )
  )
);

create policy "run_items_customer_or_admin_update"
on public.run_items
for update
using (
  (
    run_type = 'single'
    and exists (
      select 1
      from public.single_runs r
      where r.id = run_id
        and (
          r.customer_id = auth.uid()

          or exists (
            select 1
            from public.profiles p
            where p.id = auth.uid()
              and p.is_admin
          )
        )
    )
  )

  or

  (
    run_type = 'recurring'
    and exists (
      select 1
      from public.recurring_runs r
      where r.id = run_id
        and (
          r.customer_id = auth.uid()

          or exists (
            select 1
            from public.profiles p
            where p.id = auth.uid()
              and p.is_admin
          )
        )
    )
  )
)
with check (
  (
    run_type = 'single'
    and exists (
      select 1
      from public.single_runs r
      where r.id = run_id
        and (
          r.customer_id = auth.uid()

          or exists (
            select 1
            from public.profiles p
            where p.id = auth.uid()
              and p.is_admin
          )
        )
    )
  )

  or

  (
    run_type = 'recurring'
    and exists (
      select 1
      from public.recurring_runs r
      where r.id = run_id
        and (
          r.customer_id = auth.uid()

          or exists (
            select 1
            from public.profiles p
            where p.id = auth.uid()
              and p.is_admin
          )
        )
    )
  )
);

create policy "run_items_customer_or_admin_delete"
on public.run_items
for delete
using (
  (
    run_type = 'single'
    and exists (
      select 1
      from public.single_runs r
      where r.id = run_id
        and (
          r.customer_id = auth.uid()

          or exists (
            select 1
            from public.profiles p
            where p.id = auth.uid()
              and p.is_admin
          )
        )
    )
  )

  or

  (
    run_type = 'recurring'
    and exists (
      select 1
      from public.recurring_runs r
      where r.id = run_id
        and (
          r.customer_id = auth.uid()

          or exists (
            select 1
            from public.profiles p
            where p.id = auth.uid()
              and p.is_admin
          )
        )
    )
  )
);

-- ------------------------------------------------------------
-- 6. CONTROLLED EVENT LOGGER
-- ------------------------------------------------------------

create or replace function public.log_run_event(
  p_run_id uuid,
  p_event_type text,
  p_to_value text default null,
  p_note text default null,
  p_actor_label text default null,
  p_from_value text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$

declare
  v_id uuid;

  v_actor_label text;

  v_allowed boolean := false;

begin

  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select exists (
    select 1
    from public.single_runs r
    where r.id = p_run_id
      and (
        r.customer_id = auth.uid()

        or r.assigned_shopper = auth.uid()

        or r.assigned_driver = auth.uid()

        or exists (
          select 1
          from public.profiles p
          where p.id = auth.uid()
            and p.is_admin
        )
      )
  )
  into v_allowed;

  if not v_allowed then
    raise exception 'You do not have access to this run';
  end if;

  select coalesce(
    nullif(trim(p_actor_label), ''),
    nullif(trim(full_name), ''),
    email,
    'Stockly'
  )
  into v_actor_label

  from public.profiles

  where id = auth.uid();

  insert into public.run_events (
    run_id,
    event_type,
    from_value,
    to_value,
    note,
    actor_id,
    actor_label
  )

  values (
    p_run_id,
    p_event_type,
    p_from_value,
    p_to_value,
    p_note,
    auth.uid(),
    v_actor_label
  )

  returning id
  into v_id;

  return v_id;

end;
$$;

revoke all
on function public.log_run_event(
  uuid,
  text,
  text,
  text,
  text,
  text
)
from public;

grant execute
on function public.log_run_event(
  uuid,
  text,
  text,
  text,
  text,
  text
)
to authenticated;
