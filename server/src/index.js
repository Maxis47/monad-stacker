import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { createWalletClient, createPublicClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import fs from 'fs';
import path from 'path';

import { getChain } from './chain.js';
import { ABI } from './abi.js';
import { signSessionToken, verifySessionToken } from './security.js';

/* ---------- Helpers: Private Key ---------- */
function normalizePrivateKey(input) {
  if (!input) throw new Error('Missing SERVER_PRIVATE_KEY');
  let k = String(input).trim();
  k = k.replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
  k = k.replace(/\s+/g, '');
  if (k.startsWith('0x') || k.startsWith('0X')) k = k.slice(2);
  if (!/^[0-9a-fA-F]{64}$/.test(k)) {
    throw new Error('SERVER_PRIVATE_KEY must be 0x + 64 hex');
  }
  return '0x' + k.toLowerCase();
}

/* ---------- ENV ---------- */
const PORT = Number(process.env.PORT || 3000);
const RPC_URL = process.env.RPC_URL;
const CONTRACT = process.env.CONTRACT_ADDR;
let PRIV = process.env.SERVER_PRIVATE_KEY;

if (!RPC_URL || !CONTRACT || !PRIV) {
  console.error('\n[CONFIG ERROR] Pastikan RPC_URL, CONTRACT_ADDR, dan SERVER_PRIVATE_KEY terisi di Variables/ENV.\n');
  process.exit(1);
}
PRIV = normalizePrivateKey(PRIV);

/* ---------- CHAIN CLIENTS ---------- */
const chain = getChain(RPC_URL);
const account = privateKeyToAccount(PRIV);
const wallet = createWalletClient({ account, chain, transport: http(RPC_URL) });
const publicClient = createPublicClient({ chain, transport: http(RPC_URL) });

/* ---------- Optional: Upstash Redis (REST) ---------- */
const UP_URL = process.env.UPSTASH_REDIS_REST_URL || '';
const UP_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || '';
const USE_REDIS = !!(UP_URL && UP_TOKEN);

// Minimal REST helper
async function redisCmd(parts) {
  const url = `${UP_URL}/${parts.map(encodeURIComponent).join('/')}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${UP_TOKEN}` } });
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  return j.result;
}

const REDIS_TOTALS_KEY = 'lb:totals'; // HSET wallet -> total
const REDIS_HIST_PREFIX = 'hist:';    // per-wallet list

/* ---------- File storage (fallback) ---------- */
const DATA_DIR = path.resolve(process.cwd(), 'data');
const LB_FILE = path.join(DATA_DIR, 'leaderboard.json');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(LB_FILE)) fs.writeFileSync(LB_FILE, JSON.stringify({ entries: [] }, null, 2), 'utf8');

function loadLB_File() {
  try { return JSON.parse(fs.readFileSync(LB_FILE, 'utf8')); }
  catch { return { entries: [] }; }
}
function saveLB_File(db) {
  fs.writeFileSync(LB_FILE, JSON.stringify(db, null, 2), 'utf8');
}

/* ---------- Username helper ---------- */
async function enrichUsername(address) {
  try {
    const r = await fetch(`https://monad-games-id-site.vercel.app/api/check-wallet?wallet=${address}`);
    const j = await r.json();
    if (j?.hasUsername && j?.user?.username) return j.user.username;
  } catch {}
  return '';
}

/* ---------- App ---------- */
const app = express();
app.use(helmet());

// CORS longgar; setelah Vercel live boleh whitelist domain.
app.use(cors({ origin: true, credentials: true }));

app.use(express.json());

/* Root info (biar tidak 404 di /) */
app.get('/', (_req, res) => {
  res.json({
    name: 'Monad Stacker API',
    ok: true,
    health: '/health',
    endpoints: {
      startSession: 'POST /api/start-session',
      submit: 'POST /api/submit',
      leaderboard: 'GET /api/leaderboard',
      myTotal: 'GET /api/my-total?wallet=0x...',
      history: 'GET /api/history?wallet=0x...'
    },
    serverWallet: account.address,
    chainId: chain.id,
    storage: USE_REDIS ? 'Upstash Redis' : 'File JSON'
  });
});

app.get('/health', (_req, res) => {
  res.json({ ok: true, serverWallet: account.address, chainId: chain.id, redis: USE_REDIS });
});

// Start session
app.post('/api/start-session', (req, res) => {
  const Body = z.object({ wallet: z.string().min(10) });
  const parsed = Body.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Bad body' });

  const { wallet: player } = parsed.data;
  const sessionId = uuidv4();
  const startTs = Date.now();
  const minMs = 0; // allow submit meski cepat
  const token = signSessionToken({ sessionId, player, startTs, minMs });
  res.json({ sessionId, token });
});

// Submit score
app.post('/api/submit', async (req, res) => {
  const Body = z.object({
    sessionId: z.string().min(10),
    token: z.string().min(10),
    wallet: z.string().min(10),
    scoreDelta: z.number().int().min(0).max(999999),
    txDelta: z.number().int().min(0).max(100).optional().default(1)
  });
  const parsed = Body.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Bad body' });

  const { sessionId, token, wallet: player, scoreDelta, txDelta } = parsed.data;
  const payload = verifySessionToken(token);
  if (!payload || payload.sessionId !== sessionId || payload.player !== player) {
    return res.status(401).json({ error: 'Invalid session' });
  }

  // Guard ringan (permisif)
  const elapsed = Date.now() - payload.startTs;
  const maxAllowed = Math.max(10, Math.floor(elapsed / 200));
  if (scoreDelta > maxAllowed * 20) {
    // tetap dibiarkan longgar; sesuaikan jika perlu
  }

  try {
    const hash = await wallet.writeContract({
      address: CONTRACT,
      abi: ABI,
      functionName: 'updatePlayerData',
      args: [player, BigInt(scoreDelta), BigInt(txDelta ?? 1)]
    });
    await publicClient.waitForTransactionReceipt({ hash });

    // Persist: Redis > File
    if (USE_REDIS) {
      await redisCmd(['HINCRBY', REDIS_TOTALS_KEY, player.toLowerCase(), String(scoreDelta)]);
      const item = JSON.stringify({ t: Date.now(), wallet: player, score: Number(scoreDelta), tx: hash });
      await redisCmd(['LPUSH', REDIS_HIST_PREFIX + player.toLowerCase(), item]);
      await redisCmd(['LTRIM', REDIS_HIST_PREFIX + player.toLowerCase(), '0', '199']);
    } else {
      const db = loadLB_File();
      db.entries.push({ t: Date.now(), wallet: player, score: Number(scoreDelta), tx: hash });
      if (db.entries.length > 20000) db.entries = db.entries.slice(-15000);
      saveLB_File(db);
    }

    res.json({ ok: true, txHash: hash });
  } catch (e) {
    console.error('updatePlayerData error:', e);
    res.status(500).json({ error: 'Contract call failed', detail: String(e?.message || e) });
  }
});

// Leaderboard (Top 50 totals)
app.get('/api/leaderboard', async (_req, res) => {
  let rows = [];
  if (USE_REDIS) {
    const arr = await redisCmd(['HGETALL', REDIS_TOTALS_KEY]) || [];
    for (let i = 0; i < arr.length; i += 2) {
      rows.push({ wallet: arr[i], total: Number(arr[i + 1] || 0) });
    }
  } else {
    const db = loadLB_File();
    const totals = new Map();
    for (const it of db.entries) {
      const w = (it.wallet || '').toLowerCase();
      totals.set(w, (totals.get(w) || 0) + Number(it.score || 0));
    }
    rows = [...totals.entries()].map(([wallet, total]) => ({ wallet, total }));
  }

  rows.sort((a, b) => b.total - a.total);
  rows = rows.slice(0, 50);

  const enriched = await Promise.all(rows.map(async (r) => ({
    ...r,
    username: await enrichUsername(r.wallet)
  })));

  res.json({ updatedAt: Date.now(), top: enriched });
});

// My total
app.get('/api/my-total', async (req, res) => {
  const walletAddr = String(req.query.wallet || '').toLowerCase();
  if (!walletAddr || walletAddr.length < 10) return res.status(400).json({ error: 'Missing wallet' });

  if (USE_REDIS) {
    const v = await redisCmd(['HGET', REDIS_TOTALS_KEY, walletAddr]);
    return res.json({ wallet: walletAddr, total: Number(v || 0) });
  } else {
    const db = loadLB_File();
    const total = db.entries
      .filter(e => (e.wallet || '').toLowerCase() === walletAddr)
      .reduce((acc, e) => acc + Number(e.score || 0), 0);
    return res.json({ wallet: walletAddr, total, count: db.entries.length });
  }
});

// History per wallet
app.get('/api/history', async (req, res) => {
  const walletAddr = String(req.query.wallet || '').toLowerCase();
  if (!walletAddr || walletAddr.length < 10) return res.status(400).json({ error: 'Missing wallet' });

  if (USE_REDIS) {
    const arr = await redisCmd(['LRANGE', REDIS_HIST_PREFIX + walletAddr, '0', '199']);
    const list = (arr || []).map(x => {
      try { return JSON.parse(x); } catch { return null; }
    }).filter(Boolean).sort((a, b) => b.t - a.t);
    return res.json({ wallet: walletAddr, entries: list });
  } else {
    const db = loadLB_File();
    const list = db.entries
      .filter(e => (e.wallet || '').toLowerCase() === walletAddr)
      .sort((a, b) => b.t - a.t);
    return res.json({ wallet: walletAddr, entries: list });
  }
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
  console.log('Server wallet (_game):', account.address);
  console.log('Storage mode:', USE_REDIS ? 'Upstash Redis' : 'File JSON');
});
