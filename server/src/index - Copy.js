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

function normalizePrivateKey(input) {
  if (!input) throw new Error('Missing SERVER_PRIVATE_KEY');
  let k = String(input).trim();
  k = k.replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
  k = k.replace(/\s+/g, '');
  if (k.startsWith('0x') || k.startsWith('0X')) k = k.slice(2);
  if (!/^[0-9a-fA-F]{64}$/.test(k)) {
    throw new Error('SERVER_PRIVATE_KEY harus 64 hex, contoh: 0x<64hex>');
  }
  return '0x' + k.toLowerCase();
}

/* ====== ENV ====== */
const PORT = Number(process.env.PORT || 3000);
const RPC_URL = process.env.RPC_URL;
const CONTRACT = process.env.CONTRACT_ADDR;
let PRIV = process.env.SERVER_PRIVATE_KEY;

if (!RPC_URL || !CONTRACT || !PRIV) {
  console.error('\n[CONFIG ERROR]\nPastikan RPC_URL, CONTRACT_ADDR, dan SERVER_PRIVATE_KEY terisi di server/.env');
  process.exit(1);
}
PRIV = normalizePrivateKey(PRIV);

/* ====== CHAIN & CLIENTS ====== */
const chain = getChain(RPC_URL);
const account = privateKeyToAccount(PRIV);
const wallet = createWalletClient({ account, chain, transport: http(RPC_URL) });
const publicClient = createPublicClient({ chain, transport: http(RPC_URL) });

/* ====== LEADERBOARD STORAGE ====== */
const DATA_DIR = path.resolve(process.cwd(), 'data');
const LB_FILE = path.join(DATA_DIR, 'leaderboard.json');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(LB_FILE)) fs.writeFileSync(LB_FILE, JSON.stringify({ entries: [] }, null, 2));

function loadLB() {
  try { return JSON.parse(fs.readFileSync(LB_FILE, 'utf8')); }
  catch { return { entries: [] }; }
}
function saveLB(db) {
  fs.writeFileSync(LB_FILE, JSON.stringify(db, null, 2));
}
async function enrichUsername(address) {
  try {
    const r = await fetch(`https://monad-games-id-site.vercel.app/api/check-wallet?wallet=${address}`);
    const j = await r.json();
    if (j?.hasUsername && j?.user?.username) return j.user.username;
  } catch {}
  return '';
}

/* ====== APP ====== */
const app = express();
app.use(helmet());
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ ok: true, serverWallet: account.address, chainId: chain.id });
});

// Mulai sesi game
app.post('/api/start-session', (req, res) => {
  const Body = z.object({ wallet: z.string().min(10) });
  const parsed = Body.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Bad body' });

  const { wallet: player } = parsed.data;
  const sessionId = uuidv4();
  const startTs = Date.now();
  const minMs = 0; // <<— diizinkan submit meskipun sesi sangat cepat
  const token = signSessionToken({ sessionId, player, startTs, minMs });
  res.json({ sessionId, token });
});

// Submit skor + transaksi (delta) ke onchain + simpan ke leaderboard
app.post('/api/submit', async (req, res) => {
  const Body = z.object({
    sessionId: z.string().min(10),
    token: z.string().min(10),
    wallet: z.string().min(10),
    // IZINKAN 0 supaya “selalu submit”
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
  const elapsed = Date.now() - payload.startTs;
  if (elapsed < payload.minMs) {
    return res.status(400).json({ error: 'Session too short' });
  }

  // Guard sederhana terhadap score tinggi tak wajar dalam waktu sangat singkat
  const maxAllowed = Math.max(10, Math.floor(elapsed / 200));
  if (scoreDelta > maxAllowed * 20) {
    return res.status(400).json({ error: 'Suspicious score' });
  }

  try {
    const hash = await wallet.writeContract({
      address: CONTRACT,
      abi: ABI,
      functionName: 'updatePlayerData',
      args: [player, BigInt(scoreDelta), BigInt(txDelta ?? 1)]
    });
    await publicClient.waitForTransactionReceipt({ hash });

    // simpan leaderboard (append + aggregate)
    const db = loadLB();
    db.entries.push({ t: Date.now(), wallet: player, score: scoreDelta, tx: hash });
    if (db.entries.length > 5000) db.entries = db.entries.slice(-4000);
    saveLB(db);

    res.json({ ok: true, txHash: hash });
  } catch (e) {
    console.error('updatePlayerData error:', e);
    res.status(500).json({ error: 'Contract call failed', detail: String(e?.message || e) });
  }
});

// Leaderboard Top 50 (total skor per wallet, desc)
app.get('/api/leaderboard', async (_req, res) => {
  const db = loadLB();
  const agg = new Map();
  for (const it of db.entries) {
    agg.set(it.wallet, (agg.get(it.wallet) || 0) + Number(it.score || 0));
  }
  const arr = [...agg.entries()]
    .map(([wallet, total]) => ({ wallet, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 50);

  const enriched = await Promise.all(arr.map(async (r) => ({
    ...r,
    username: await enrichUsername(r.wallet)
  })));

  res.json({ updatedAt: Date.now(), top: enriched });
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
  console.log('Server wallet (_game):', account.address);
});
