import crypto from 'node:crypto';
import { getDatabase } from '@netlify/database';

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  },
  });

const normalizeEmail = (email = '') => email.trim().toLowerCase();

const hashValue = (value = '') =>
  crypto.createHash('sha256').update(value).digest('hex');

const toCount = (value) => {
  const count = Number(value);
  return Number.isFinite(count) ? count : 0;
};

const normalizeChoice = (choice = '') => {
  if (choice === 'for' || choice === 'against' || choice === 'not_sure') {
    return choice;
  }

  return '';
};

const getHeader = (headers, name) =>
  typeof headers?.get === 'function' ? headers.get(name) : headers?.[name];

const getClientIp = (headers) =>
  getHeader(headers, 'x-nf-client-connection-ip') ||
  getHeader(headers, 'client-ip') ||
  getHeader(headers, 'x-forwarded-for')?.split(',')[0]?.trim() ||
  '';

const ensurePollSchema = async (db) => {
  await db.sql`
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
    )
  `;

  await db.sql`
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
    )
  `;

  await db.sql`
    create index if not exists article_poll_votes_poll_id_idx
      on article_poll_votes (poll_id)
  `;

  await db.sql`
    create index if not exists article_poll_votes_slug_idx
      on article_poll_votes (slug)
  `;

  await db.sql`
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
      updated_at = now()
  `;
};

const formatResults = (poll, groupedVotes = []) => {
  const live = {
    for: 0,
    against: 0,
    not_sure: 0,
  };

  groupedVotes.forEach((row) => {
    const choice = normalizeChoice(row.choice);
    if (choice) live[choice] = toCount(row.count);
  });

  const totals = {
    for: toCount(poll.baseline_for) + live.for,
    against: toCount(poll.baseline_against) + live.against,
    not_sure: toCount(poll.baseline_not_sure) + live.not_sure,
  };

  return {
    slug: poll.slug,
    question: poll.question,
    status: poll.status,
    totals,
    totalVotes: totals.for + totals.against + totals.not_sure,
  };
};

const getPollResults = async (db, slug) => {
  const polls = await db.sql`
    select id, slug, question, status, baseline_for, baseline_against, baseline_not_sure
    from article_polls
    where slug = ${slug}
    limit 1
  `;

  const poll = polls[0];

  if (!poll || poll.status !== 'active') {
    return null;
  }

  const groupedVotes = await db.sql`
    select choice, count(*)::int as count
    from article_poll_votes
    where poll_id = ${poll.id}
    group by choice
  `;

  return formatResults(poll, groupedVotes);
};

export default async function handler(request) {
  const url = new URL(request.url);

  if (request.method === 'OPTIONS') {
    return json(204, {});
  }

  try {
    const db = getDatabase();
    await ensurePollSchema(db);

    if (request.method === 'GET') {
      const slug = url.searchParams.get('slug') || '';
      if (!slug) return json(400, { error: 'Missing poll slug.' });

      const results = await getPollResults(db, slug);
      if (!results) return json(404, { error: 'Poll not found.' });

      return json(200, results);
    }

    if (request.method !== 'POST') {
      return json(405, { error: 'Method not allowed.' });
    }

    const payload = await request.json().catch(() => ({}));
    const slug = typeof payload.slug === 'string' ? payload.slug.trim() : '';
    const email = normalizeEmail(payload.email);
    const choice = normalizeChoice(payload.choice);
    const comment =
      typeof payload.comment === 'string'
        ? payload.comment.trim().slice(0, 1200)
        : '';

    if (!slug || !email || !choice) {
      return json(400, { error: 'Email and vote choice are required.' });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json(400, { error: 'Enter a valid email address.' });
    }

    const polls = await db.sql`
      select id, slug, question, status, baseline_for, baseline_against, baseline_not_sure
      from article_polls
      where slug = ${slug}
      limit 1
    `;

    const poll = polls[0];

    if (!poll || poll.status !== 'active') {
      return json(404, { error: 'Poll not found.' });
    }

    const emailHash = hashValue(email);
    const emailDomain = email.split('@')[1] || '';
    const ipHash = getClientIp(request.headers)
      ? hashValue(getClientIp(request.headers))
      : '';
    const userAgent = (getHeader(request.headers, 'user-agent') || '').slice(0, 500);

    try {
      await db.sql`
        insert into article_poll_votes (
          id,
          poll_id,
          slug,
          email_hash,
          email_domain,
          choice,
          comment,
          ip_hash,
          user_agent
        )
        values (
          ${crypto.randomUUID()},
          ${poll.id},
          ${slug},
          ${emailHash},
          ${emailDomain},
          ${choice},
          ${comment || null},
          ${ipHash || null},
          ${userAgent || null}
        )
      `;
    } catch (error) {
      if (error?.code !== '23505') {
        throw error;
      }

      const results = await getPollResults(db, slug);
      return json(409, {
        error: 'This email has already voted in this poll.',
        alreadyVoted: true,
        results,
      });
    }

    const results = await getPollResults(db, slug);
    return json(200, { ok: true, results });
  } catch (error) {
    console.error('article-poll function failed', error);
    return json(500, {
      error: 'Poll is unavailable right now.',
    });
  }
}
