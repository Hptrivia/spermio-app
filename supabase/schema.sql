-- Spermio intake mailbox. Paste into Supabase → SQL Editor → Run.
-- The server only ever stores encrypted forms. Nothing here is readable patient data.
-- All access goes through the functions below; the tables themselves are closed to the public.

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_cron;

create table if not exists public.inboxes (
  id text primary key check (length(id) between 16 and 64),
  public_key jsonb not null,
  secret_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.intake_submissions (
  id uuid primary key default gen_random_uuid(),
  inbox_id text not null references public.inboxes(id) on delete cascade,
  ephemeral_public_key jsonb not null,
  iv text not null check (length(iv) < 64),
  ciphertext text not null check (length(ciphertext) < 100000),
  created_at timestamptz not null default now()
);
create index if not exists intake_submissions_inbox_idx on public.intake_submissions (inbox_id, created_at);

-- RLS on, no policies: nobody can touch the tables directly.
alter table public.inboxes enable row level security;
alter table public.intake_submissions enable row level security;
revoke all on public.inboxes, public.intake_submissions from anon, authenticated;

-- Midwife's app creates its mailbox (random id + public key + hash of a private secret).
create or replace function public.register_inbox(p_id text, p_public_key jsonb, p_secret text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if length(p_secret) < 32 then raise exception 'secret too short'; end if;
  if (select count(*) from inboxes where created_at > now() - interval '1 hour') > 50 then
    raise exception 'rate limit';
  end if;
  insert into inboxes (id, public_key, secret_hash)
  values (p_id, p_public_key, encode(extensions.digest(p_secret, 'sha256'), 'hex'));
end $$;

-- Patient form fetches the midwife's public key.
create or replace function public.inbox_public_key(p_id text)
returns jsonb language sql security definer set search_path = public stable as $$
  select public_key from inboxes where id = p_id;
$$;

-- Patient form drops an encrypted submission. Size- and rate-limited.
create or replace function public.submit_intake(p_inbox_id text, p_ephemeral_public_key jsonb, p_iv text, p_ciphertext text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from inboxes where id = p_inbox_id) then raise exception 'unknown inbox'; end if;
  if (select count(*) from intake_submissions where inbox_id = p_inbox_id and created_at > now() - interval '1 hour') >= 20 then
    raise exception 'rate limit';
  end if;
  if (select count(*) from intake_submissions where created_at > now() - interval '1 minute') >= 60 then
    raise exception 'rate limit';
  end if;
  insert into intake_submissions (inbox_id, ephemeral_public_key, iv, ciphertext)
  values (p_inbox_id, p_ephemeral_public_key, p_iv, p_ciphertext);
end $$;

-- Midwife's app reads its own submissions (needs the private secret).
create or replace function public.list_intake(p_inbox_id text, p_secret text)
returns setof intake_submissions language sql security definer set search_path = public stable as $$
  select s.* from intake_submissions s join inboxes i on i.id = s.inbox_id
  where i.id = p_inbox_id and i.secret_hash = encode(extensions.digest(p_secret, 'sha256'), 'hex')
  order by s.created_at;
$$;

-- Midwife's app deletes a submission as soon as it's imported.
create or replace function public.delete_intake(p_inbox_id text, p_secret text, p_id uuid)
returns void language sql security definer set search_path = public as $$
  delete from intake_submissions s using inboxes i
  where s.id = p_id and s.inbox_id = i.id and i.id = p_inbox_id
    and i.secret_hash = encode(extensions.digest(p_secret, 'sha256'), 'hex');
$$;

revoke all on function public.register_inbox, public.inbox_public_key, public.submit_intake, public.list_intake, public.delete_intake from public;
grant execute on function public.register_inbox, public.inbox_public_key, public.submit_intake, public.list_intake, public.delete_intake to anon;

-- Anything not picked up within 14 days is deleted (runs nightly at 03:00 UTC).
select cron.unschedule('spermio-cleanup') where exists (select 1 from cron.job where jobname = 'spermio-cleanup');
select cron.schedule('spermio-cleanup', '0 3 * * *', $$delete from public.intake_submissions where created_at < now() - interval '14 days'$$);
