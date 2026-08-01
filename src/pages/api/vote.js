// src/pages/api/vote.js
//
// Admin voting endpoint (Phase 5). Receives a click from the Like/Dislike/
// Block buttons and appends the article's exact headline to the matching
// section of EXAMPLES.md on GitHub — same effect as hand-typing a line into
// that file, just automated. Does NOT touch training.json or
// CONTENT_BLOCKLIST directly; those are still only updated the existing way
// (bring EXAMPLES.md to a session, get the entries coded in deliberately).
//
// Requires a GitHub secret: GITHUB_PAT (fine-grained PAT, scoped to this
// repo only, contents:write permission) — set in Vercel's environment
// variables. Separate from GROQ_API_KEY.

export const prerender = false;

const OWNER = 'phongle317';
const REPO = 'VNin1';
const BRANCH = 'main';
const FILE_PATH = 'EXAMPLES.md';

const SECTION_HEADINGS = {
  like: '## Liked (Rule 5 — want more like this)',
  dislike: '## Disliked (Rule 5 — want less like this)',
  block: '## Block candidates (Rule 4 — hard exclusions)',
};

function b64encode(str) {
  return Buffer.from(str, 'utf-8').toString('base64');
}
function b64decode(str) {
  return Buffer.from(str, 'base64').toString('utf-8');
}

// Pure string-manipulation core, exported separately so it can be unit
// tested without needing a real GitHub token or network access.
export function insertVoteLine(currentContent, title, action) {
  const heading = SECTION_HEADINGS[action];
  if (!heading) throw { reason: 'bad_request', message: 'Invalid action' };

  if (currentContent.includes(title)) {
    return { duplicate: true, newContent: currentContent };
  }

  const lines = currentContent.split('\n');
  const headingIdx = lines.findIndex(l => l.trim() === heading);
  if (headingIdx === -1) {
    throw { reason: 'server_error', message: 'Section heading not found in EXAMPLES.md' };
  }

  // Find the '---' separator that closes this section — insert before it.
  let sepIdx = lines.length;
  for (let i = headingIdx + 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') { sepIdx = i; break; }
  }

  const newLine = '- ' + title;

  // If this section still has the starter placeholder line, replace it
  // (first real entry takes its place); otherwise insert as a new line
  // right before the section's closing '---'.
  let placeholderIdx = -1;
  for (let i = headingIdx + 1; i < sepIdx; i++) {
    if (lines[i].trim() === '- (add examples here)') { placeholderIdx = i; break; }
  }
  if (placeholderIdx !== -1) {
    lines[placeholderIdx] = newLine;
  } else {
    lines.splice(sepIdx, 0, newLine);
  }

  return { duplicate: false, newContent: lines.join('\n') };
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

  const result = insertVoteLine(currentContent, title, action);
  if (result.duplicate) return { duplicate: true };

  const putRes = await fetch(apiUrl, {
    method: 'PUT',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: 'chore: record "' + title.slice(0, 60) + '" as ' + action,
      content: b64encode(result.newContent),
      sha: currentSha,
      branch: BRANCH,
    }),
  });

  if (putRes.status === 409) {
    // Someone else wrote to the file between our read and write (e.g. a
    // near-simultaneous button click from another tab/device). Signal the
    // caller to retry once with a fresh SHA.
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
  if (!SECTION_HEADINGS[action]) {
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
