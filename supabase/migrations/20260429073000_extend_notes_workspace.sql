alter table public.notes
  add column if not exists folder text not null default 'Inbox',
  add column if not exists tags text[] not null default '{}'::text[],
  add column if not exists is_public boolean not null default false;

create index if not exists notes_user_folder_idx
  on public.notes (user_id, folder);

create index if not exists notes_tags_idx
  on public.notes using gin (tags);

drop policy if exists "Public notes can be read anonymously" on public.notes;
create policy "Public notes can be read anonymously"
  on public.notes
  for select
  using (is_public = true);
