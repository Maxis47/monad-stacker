const BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3000';

async function jfetch(url, opts) {
  const r = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    ...opts
  });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}

export const api = {
  async startSession(wallet) {
    return jfetch(`${BASE}/api/start-session`, {
      method: 'POST',
      body: JSON.stringify({ wallet })
    });
  },
  async submitScore(body) {
    return jfetch(`${BASE}/api/submit`, {
      method: 'POST',
      body: JSON.stringify(body)
    });
  }
};