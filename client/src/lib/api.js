// client/src/lib/api.js
const BASE = import.meta.env.VITE_API_BASE;

// Mulai session bertanda tangan dari server (untuk submit aman)
export async function startSession(wallet) {
  const res = await fetch(`${BASE}/api/start-session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ wallet })
  });
  if (!res.ok) throw new Error(`start-session failed: HTTP ${res.status}`);
  return res.json(); // { sessionId, token, crossAppId }
}

// Submit skor (delta). Server akan call kontrak & simpan ke KV (Upstash)
export async function submitScore({ sessionId, token, wallet, scoreDelta, username }) {
  const res = await fetch(`${BASE}/api/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId,
      token,
      wallet,
      scoreDelta,
      txDelta: 1,
      username
    })
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`submit failed: HTTP ${res.status} ${t}`);
  }
  return res.json(); // { ok, txHash, savedToKV }
}

// Leaderboard global (Top 50) — dibaca dari server-side totalScore
export async function getLeaderboard() {
  const res = await fetch(`${BASE}/api/leaderboard`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`leaderboard failed: HTTP ${res.status}`);
  const json = await res.json();
  return json.data || [];
}

// History per user (untuk tab History)
export async function getHistory(wallet) {
  const res = await fetch(`${BASE}/api/history/${wallet}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`history failed: HTTP ${res.status}`);
  const json = await res.json();
  return json.data || [];
}
