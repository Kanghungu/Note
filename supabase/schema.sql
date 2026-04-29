create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Untitled',
  icon text not null default '◇',
  summary text not null default '',
  blocks jsonb not null default '[]'::jsonb,
  favorited boolean not null default false,
  folder text not null default 'Inbox',
  tags text[] not null default '{}'::text[],
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.notes enable row level security;

create policy "Users can read their notes"
  on public.notes
  for select
  using (auth.uid() = user_id);

create policy "Public notes can be read anonymously"
  on public.notes
  for select
  using (is_public = true);

create policy "Users can insert their notes"
  on public.notes
  for insert
  with check (auth.uid() = user_id);

create policy "Users can update their notes"
  on public.notes
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their notes"
  on public.notes
  for delete
  using (auth.uid() = user_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists notes_set_updated_at on public.notes;

create trigger notes_set_updated_at
before update on public.notes
for each row
execute function public.set_updated_at();

create index if not exists notes_user_updated_idx
  on public.notes (user_id, updated_at desc);

create index if not exists notes_user_folder_idx
  on public.notes (user_id, folder);

create index if not exists notes_tags_idx
  on public.notes using gin (tags);
