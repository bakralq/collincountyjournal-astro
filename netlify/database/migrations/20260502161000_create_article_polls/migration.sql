create table if not exists article_polls (
  id bigserial primary key,
  slug text not null unique,
  question text not null,
  status text not null default 'active',
  baseline_for integer not null default 0,
  baseline_against integer not null default 0,
  baseline_not_sure integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint article_polls_status_check
    check (status in ('active', 'closed', 'hidden'))
);

create table if not exists article_poll_votes (
  id uuid primary key,
  poll_id bigint not null references article_polls(id) on delete cascade,
  slug text not null,
  email_hash text not null,
  email_domain text,
  choice text not null,
  comment text,
  ip_hash text,
  user_agent text,
  created_at timestamptz not null default now(),
  constraint article_poll_votes_choice_check
    check (choice in ('for', 'against', 'not_sure')),
  constraint article_poll_votes_one_email_per_poll
    unique (poll_id, email_hash)
);

create index if not exists article_poll_votes_poll_id_idx
  on article_poll_votes (poll_id);

create index if not exists article_poll_votes_slug_idx
  on article_poll_votes (slug);

insert into article_polls (
  slug,
  question,
  baseline_for,
  baseline_against,
  baseline_not_sure
)
values (
  'epic-city-the-meadow-still-moving-forward-2026',
  'Should The Meadow / EPIC City move forward?',
  4448,
  7329,
  0
)
on conflict (slug) do update set
  question = excluded.question,
  baseline_for = excluded.baseline_for,
  baseline_against = excluded.baseline_against,
  baseline_not_sure = excluded.baseline_not_sure,
  updated_at = now();
