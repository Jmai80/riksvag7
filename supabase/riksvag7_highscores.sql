-- Riksväg 7: topplistan. Ligger i Supabase-projektet "cityguess" (samma som cityguess egen highscores).
-- Kör i Supabase: SQL Editor → New query → klistra in → Run.
create table public.riksvag7_highscores (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  name text not null check (char_length(name) between 1 and 16),
  car text not null check (car in ('svala', 'falk', 'lo')),
  time_ms integer not null check (time_ms between 100000 and 900000),
  position smallint check (position between 1 and 6),
  version text check (char_length(version) <= 10)
);

create index riksvag7_highscores_time_idx on public.riksvag7_highscores (time_ms);

alter table public.riksvag7_highscores enable row level security;

create policy "Alla kan läsa topplistan"
  on public.riksvag7_highscores for select
  to anon, authenticated
  using (true);

create policy "Alla kan spara en tid"
  on public.riksvag7_highscores for insert
  to anon, authenticated
  with check (true);

grant select, insert on public.riksvag7_highscores to anon, authenticated;

-- v1.3: which course the time was driven on (1 = Ekeby → Sjuby, 2 = Kvällsracet Sjuby → Ekeby).
-- Rows from before get 1.
alter table public.riksvag7_highscores
  add column track smallint not null default 1 check (track between 1 and 99);

create index riksvag7_highscores_track_time_idx
  on public.riksvag7_highscores (track, time_ms);
