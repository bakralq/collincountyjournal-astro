import crypto from 'node:crypto';
import { getDatabase } from '@netlify/database';

const json = (statusCode, body) => ({
  statusCode,
  headers: {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  },
  body: JSON.stringify(body),
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

const getClientIp = (headers = {}) =>
  headers['x-nf-client-connection-ip'] ||
  headers['client-ip'] ||
  headers['x-forwarded-for']?.split(',')[0]?.trim() ||
  '';

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

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return json(204, {});
  }

  try {
    const db = getDatabase();

    if (event.httpMethod === 'GET') {
      const slug = event.queryStringParameters?.slug || '';
      if (!slug) return json(400, { error: 'Missing poll slug.' });

      const results = await getPollResults(db, slug);
      if (!results) return json(404, { error: 'Poll not found.' });

      return json(200, results);
    }

    if (event.httpMethod !== 'POST') {
      return json(405, { error: 'Method not allowed.' });
    }

    const payload = JSON.parse(event.body || '{}');
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
    const ipHash = getClientIp(event.headers)
      ? hashValue(getClientIp(event.headers))
      : '';
    const userAgent = (event.headers['user-agent'] || '').slice(0, 500);

    try {
      await db.sql`
        insert into article_poll_votes (
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
};
