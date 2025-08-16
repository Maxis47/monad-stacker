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
if (!fs.existsSync(LB_FILE)) fs.writeFileSync(LB_FILE, JSON.stringify({ entries: [] }, null, 2), 'utf8');

function loadLB() {
  try { return JSON.parse(fs.readFileSync(LB_FILE, 'utf8')); }
  catch { return { entries: [] }; }
}
function saveLB(db) {
  fs.writeFileSync(LB_FILE, JSON.stringify(db, null, 2), 'utf8');
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
  const minMs = 0; // diizinkan submit meskipun sesi sangat cepat
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

  // Guard sederhana (masih longgar supaya tidak ganggu)
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

    // simpan entry run ke file (APPEND)
    const db = loadLB();
    db.entries.push({ t: Date.now(), wallet: player, score: Number(scoreDelta), tx: hash });
    // batasin ukuran file agar tidak membengkak ekstrem
    if (db.entries.length > 20000) db.entries = db.entries.slice(-15000);
    saveLB(db);

    res.json({ ok: true, txHash: hash });
  } catch (e) {
    console.error('updatePlayerData error:', e);
    res.status(500).json({ error: 'Contract call failed', detail: String(e?.message || e) });
  }
});

/**
 * Leaderboard Top 50 (TOTAL per wallet, desc).
 * Total = penjumlahan SEMUA scoreDelta yang pernah disubmit wallet tsb (berdasarkan file data).
 */
app.get('/api/leaderboard', async (_req, res) => {
  const db = loadLB();

  // agregasi total per wallet
  const totals = new Map();
  for (const it of db.entries) {
    totals.set(it.wallet, (totals.get(it.wallet) || 0) + Number(it.score || 0));
  }

  // bentuk array & sort
  const arr = [...totals.entries()]
    .map(([wallet, total]) => ({ wallet, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 50);

  // enrich username (best effort)
  const enriched = await Promise.all(arr.map(async (r) => ({
    ...r,
    username: await enrichUsername(r.wallet)
  })));

  res.json({ updatedAt: Date.now(), top: enriched });
});

/**
 * (BARU) Total akumulasi untuk satu wallet → memudahkan verifikasi dengan History client
 * GET /api/my-total?wallet=0x...
 */
app.get('/api/my-total', (req, res) => {
  const walletAddr = String(req.query.wallet || '').toLowerCase();
  if (!walletAddr || walletAddr.length < 10) {
    return res.status(400).json({ error: 'Missing wallet' });
  }
  const db = loadLB();
  const total = db.entries
    .filter(e => (e.wallet || '').toLowerCase() === walletAddr)
    .reduce((acc, e) => acc + Number(e.score || 0), 0);
  res.json({ wallet: walletAddr, total, count: db.entries.length });
});

/**
 * (OPSIONAL) History per wallet dari server (semua run yang sukses on-chain)
 * GET /api/history?wallet=0x...
 */
app.get('/api/history', (req, res) => {
  const walletAddr = String(req.query.wallet || '').toLowerCase();
  if (!walletAddr || walletAddr.length < 10) {
    return res.status(400).json({ error: 'Missing wallet' });
  }
  const db = loadLB();
  const list = db.entries
    .filter(e => (e.wallet || '').toLowerCase() === walletAddr)
    .sort((a, b) => b.t - a.t);
  res.json({ wallet: walletAddr, entries: list });
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
  console.log('Server wallet (_game):', account.address);
});
