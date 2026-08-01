// src/pages/api/vote.js
//
// Admin voting endpoint (Phase 5, redesigned 2026-08-01 for immediate
// impact). Receives a click from the Like/Dislike/Block buttons and
// records it into src/data/votes.json on GitHub. Unlike the original
// EXAMPLES.md design, this file is read directly by fetch-feeds.mjs on
// EVERY hourly run — liked/disliked titles merge straight into the
// training scorer's examples, and blocked titles are hard-excluded by
// exact title match. No manual review step, no coding session needed —
// effect shows up on the next bot run (within ~1-2.5 hours).
//
// Requires a GitHub secret: GITHUB_PAT (fine-grained PAT, scoped to this
// repo only, contents:write permission) — set in Vercel's environment
// variables. Separate from GROQ_API_KEY.

export const prerender = false;

const OWNER = 'phongle317';
const REPO = 'VNin1';
const BRANCH = 'main';
const FILE_PATH = 'src/data/votes.json';

const VALID_ACTIONS = ['like', 'dislike', 'block'];
const ACTION_TO_KEY = { like: 'liked', dislike: 'disliked', block: 'blocked' };

function b64encode(str) {
  return Buffer.from(str, 'utf-8').toString('base64');
}
function b64decode(str) {
  return Buffer.from(str, 'base64').toString('utf-8');
}

// Pure logic, exported separately so it can be unit tested without a real
// GitHub token or network access.
export function insertVote(currentJsonText, title, action) {
  let data;
  try {
    data = JSON.parse(currentJsonText);
  } catch {
    data = {};
  }
  data.liked = Array.isArray(data.liked) ? data.liked : [];
  data.disliked = Array.isArray(data.disliked) ? data.disliked : [];
  data.blocked = Array.isArray(data.blocked) ? data.blocked : [];

  // Dedup across all three arrays — a title already voted on (any
  // category) can't be voted on again.
  const allExisting = new Set([...data.liked, ...data.disliked, ...data.blocked]);
  if (allExisting.has(title)) {
    return { duplicate: true, newContent: currentJsonText };
  }

  const key = ACTION_TO_KEY[action];
  data[key].push(title);

  return { duplicate: false, newContent: JSON.stringify(data, null, 2) + '\n' };
}

async function attemptWrite(title, action, headers, apiUrl) {
  // Always re-read fresh — needed for a correct SHA, especially on retry
  // after a conflict.
  const getRes = await fetch(apiUrl + '?ref=' + BRANCH, { headers });
  if (!getRes.ok) {
    const errText = await getRes.text();
    throw { reason: 'github_read_failed', message: 'HTTP ' + getRes.status + ': ' + errText.slice(0, 200) };
  }
  const getData = await getRes.json();
  const currentSha = getData.sha;
  const currentContent = b64decode(getData.content);

  const result = insertVote(currentContent, title, action);
  if (result.duplicate) return { duplicate: true };

  const putRes = await fetch(apiUrl, {
    method: 'PUT',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: 'chore: vote "' + title.slice(0, 60) + '" as ' + action,
      content: b64encode(result.newContent),
      sha: currentSha,
      branch: BRANCH,
    }),
  });

  if (putRes.status === 409) {
    // Someone else wrote to the file between our read and write (e.g. a
    // near-simultaneous button click). Signal the caller to retry once
    // with a fresh SHA.
    throw { reason: 'conflict', retryable: true };
  }
  if (!putRes.ok) {
    const errText = await putRes.text();
    throw { reason: 'github_write_failed', message: 'HTTP ' + putRes.status + ': ' + errText.slice(0, 200) };
  }

  return { duplicate: false };
}

export async function POST({ request }) {
  const token = process.env.GITHUB_PAT;
  if (!token) {
    return new Response(JSON.stringify({ success: false, reason: 'server_error', message: 'GITHUB_PAT not configured' }), { status: 500 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ success: false, reason: 'bad_request', message: 'Invalid JSON body' }), { status: 400 });
  }

  const title = (body?.title || '').trim();
  const action = body?.action;

  if (!title) {
    return new Response(JSON.stringify({ success: false, reason: 'bad_request', message: 'Missing title' }), { status: 400 });
  }
  if (!VALID_ACTIONS.includes(action)) {
    return new Response(JSON.stringify({ success: false, reason: 'bad_request', message: 'Invalid action' }), { status: 400 });
  }

  const apiUrl = 'https://api.github.com/repos/' + OWNER + '/' + REPO + '/contents/' + FILE_PATH;
  const headers = {
    'Authorization': 'Bearer ' + token,
    'Accept': 'application/vnd.github+json',
    'User-Agent': 'VNin1-vote-function',
  };

  try {
    let result;
    try {
      result = await attemptWrite(title, action, headers, apiUrl);
    } catch (err) {
      if (err?.retryable) {
        result = await attemptWrite(title, action, headers, apiUrl);
      } else {
        throw err;
      }
    }

    if (result.duplicate) {
      return new Response(JSON.stringify({ success: false, reason: 'duplicate', message: 'Already recorded' }), { status: 200 });
    }
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (err) {
    return new Response(JSON.stringify({
      success: false,
      reason: err?.reason || 'server_error',
      message: err?.message || String(err),
    }), { status: 500 });
  }
}
