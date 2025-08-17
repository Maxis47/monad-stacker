// Client API helpers for the Monad Stacker frontend
// All endpoints are served by your Railway server.
// Make sure Vercel has VITE_API_BASE set to your Railway URL, e.g. https://monad-stacker.up.railway.app
// (No trailing slash; this code will handle either case.)

const API_BASE_RAW = import.meta.env.VITE_API_BASE || '';
const API_BASE = API_BASE_RAW.replace(/\/+$/, ''); // strip trailing slash if any

async function req(method, path, body) {
  const url = `${API_BASE}${path}`;
  const init = {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
  };
  if (body !== undefined) init.body = JSON.stringify(body);

  const res = await fetch(url, init);
  let data = null;
  try {
    data = await res.json();
  } catch {
    // ignore JSON parse errors; we'll surface HTTP text below if needed
  }

  if (!res.ok) {
    const msg =
      (data && (data.error || data.message)) ||
      `HTTP ${res.status} ${res.statusText}`;
    throw new Error(msg);
  }
  return data ?? {};
}

/* ===========================
   Public API used by the UI
   =========================== */

// Start a signed play session
export async function startSession(wallet) {
  // POST /api/start-session  ->  { sessionId, token }
  return req('POST', '/api/start-session', { wallet });
}

// Submit a finished run (on-chain submit happens server-side)
// Expected payload: { sessionId, token, wallet, scoreDelta, txDelta? }
export async function submitScore(payload) {
  // POST /api/submit  ->  { ok: true, txHash }
  return req('POST', '/api/submit', payload);
}

// Fetch a wallet’s local history (if your UI uses it)
export async function getHistory(wallet) {
  // GET /api/history?wallet=0x...
  const qs = new URLSearchParams({ wallet }).toString();
  return req('GET', `/api/history?${qs}`);
}

// 🎯 The missing function that caused the build to fail
// Returns top 50 global leaderboard entries, e.g. [{ username, wallet, totalScore }, ...]
export async function getLeaderboard() {
  // GET /api/leaderboard
  return req('GET', '/api/leaderboard');
}

/* Optional: default export (handy in some files) */
export default {
  startSession,
  submitScore,
  getHistory,
  getLeaderboard,
};
