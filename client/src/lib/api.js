// client/src/lib/api.js
// Helper untuk memanggil API server (Railway).
// Pastikan di Vercel env: VITE_API_BASE = https://monad-stacker.up.railway.app  (tanpa trailing slash)

const API_BASE_RAW = import.meta.env.VITE_API_BASE || '';
const API_BASE = API_BASE_RAW.replace(/\/+$/, ''); // buang trailing slash kalau ada

async function req(method, path, body) {
  const url = `${API_BASE}${path}`;
  const init = {
    method,
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include', // menjaga cookie/session kalau dibutuhkan
  };
  if (body !== undefined) init.body = JSON.stringify(body);

  const res = await fetch(url, init);
  let data = null;
  try {
    data = await res.json();
  } catch {
    // biarkan kosong; akan ditangani via status
  }
  if (!res.ok) {
    const msg =
      (data && (data.error || data.message)) ||
      `HTTP ${res.status} ${res.statusText}`;
    throw new Error(msg);
  }
  return data ?? {};
}

/* ====== FUNGSI YANG DIPAKAI UI ====== */

// Mulai sesi game (server memberi token)
export async function startSession(wallet) {
  return req('POST', '/api/start-session', { wallet });
}

// Submit skor (server yang call on-chain & simpan leaderboard)
export async function submitScore(payload) {
  // payload: { sessionId, token, wallet, scoreDelta, txDelta? }
  return req('POST', '/api/submit', payload);
}

// Ambil riwayat skor wallet (tab History)
export async function getHistory(wallet) {
  const qs = new URLSearchParams({ wallet }).toString();
  return req('GET', `/api/history?${qs}`);
}

// Ambil global leaderboard (Top N)
export async function getLeaderboard() {
  return req('GET', '/api/leaderboard');
}

// >>> Named export 'api' (agar import { api } from '../lib/api.js' di Game.jsx valid)
export const api = {
  startSession,
  submitScore,
  getHistory,
  getLeaderboard,
};

// (opsional) default export, kalau ada file lain yang pakai default
export default api;