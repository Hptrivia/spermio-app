-- Spermio automatic backup. Paste into Supabase → SQL Editor → Run (after schema.sql).
-- Each backup is one encrypted blob. The server can't read it; it only keeps the newest 3 per owner.

create table if not exists public.backup_owners (
  id text primary key check (length(id) between 16 and 64),
  secret_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.backups (
  id bigint generated always as identity primary key,
  owner_id text not null references public.backup_owners(id) on delete cascade,
  data text not null check (length(data) < 20000000),
  created_at timestamptz not null default now()
);
create index if not exists backups_owner_idx on public.backups (owner_id, created_at desc);

alter table public.backup_owners enable row level security;
alter table public.backups enable row level security;
revoke all on public.backup_owners, public.backups from anon, authenticated;

-- Upload a backup. The first upload claims the owner id; later ones must use the same secret.
create or replace function public.put_backup(p_id text, p_secret text, p_data text)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare
  h text := encode(extensions.digest(p_secret, 'sha256'), 'hex');
  stored text;
  ts timestamptz;
begin
  if length(p_secret) < 32 then raise exception 'secret too short'; end if;
  select secret_hash into stored from backup_owners where id = p_id;
  if stored is null then
    if (select count(*) from backup_owners where created_at > now() - interval '1 hour') > 50 then raise exception 'rate limit'; end if;
    insert into backup_owners (id, secret_hash) values (p_id, h);
  elsif stored <> h then
    raise exception 'forbidden';
  end if;
  if (select count(*) from backups where owner_id = p_id and created_at > now() - interval '1 hour') >= 120 then raise exception 'rate limit'; end if;
  insert into backups (owner_id, data) values (p_id, p_data) returning created_at into ts;
  delete from backups where owner_id = p_id and id not in (select id from backups where owner_id = p_id order by created_at desc limit 3);
  return ts;
end $$;

-- Download the newest backup.
create or replace function public.get_backup(p_id text, p_secret text)
returns table (data text, created_at timestamptz) language sql security definer set search_path = public stable as $$
  select b.data, b.created_at from backups b join backup_owners o on o.id = b.owner_id
  where o.id = p_id and o.secret_hash = encode(extensions.digest(p_secret, 'sha256'), 'hex')
  order by b.created_at desc limit 1;
$$;

revoke all on function public.put_backup, public.get_backup from public;
grant execute on function public.put_backup, public.get_backup to anon;
