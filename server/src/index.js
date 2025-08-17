import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { createWalletClient, createPublicClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

import { getChain } from './chain.js';
import { ABI } from './abi.js';
import { signSessionToken, verifySessionToken } from './security.js';

/* ---------- Helpers ---------- */
function normalizePrivateKey(input) {
  if (!input) throw new Error('Missing SERVER_PRIVATE_KEY');
  let k = String(input).trim();
  k = k.replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
  k = k.replace(/\s+/g, '');
  if (k.startsWith('0x') || k.startsWith('0X')) k = k.slice(2);
  if (!/^[0-9a-fA-F]{64}$/.test(k)) {
    throw new Error('SERVER_PRIVATE_KEY harus 64 hex dengan prefix 0x');
  }
  return '0x' + k.toLowerCase();
}

/* ---------- ENV ---------- */
const PORT = Number(process.env.PORT || 3000);
const RPC_URL = process.env.RPC_URL;
const CONTRACT = process.env.CONTRACT_ADDR;
const CROSS_APP_ID = process.env.CROSS_APP_ID || 'cmd8euall0037le0my79qpz42';
let PRIV = process.env.SERVER_PRIVATE_KEY;

// Tambahan: daftar origin tambahan lewat ENV (pisahkan koma)
const ENV_ALLOWED = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

if (!RPC_URL || !CONTRACT || !PRIV) {
  console.error('\n[CONFIG ERROR]\nPastikan RPC_URL, CONTRACT_ADDR, dan SERVER_PRIVATE_KEY terisi di server/.env');
  process.exit(1);
}

PRIV = normalizePrivateKey(PRIV);

/* ---------- Chain & Clients ---------- */
const chain = getChain(RPC_URL);
const account = privateKeyToAccount(PRIV);
const wallet = createWalletClient({ account, chain, transport: http(RPC_URL) });
const publicClient = createPublicClient({ chain, transport: http(RPC_URL) });

/* ---------- App ---------- */
const app = express();
app.use(helmet());

/**
 * CORS whitelist:
 * - Domain produksi Vercel: https://monad-stacker.vercel.app
 * - Semua preview untuk project yang namanya diawali "monad-stacker" di Vercel (*.vercel.app)
 * - Dev lokal: http://localhost:5173
 * - Daftar extra dari ENV: ALLOWED_ORIGINS= https://domain1,https://domain2
 */
function isAllowedOrigin(origin) {
  if (!origin) return true; // non-browser / curl
  if (ENV_ALLOWED.includes(origin)) return true;

  try {
    const u = new URL(origin);
    const host = u.hostname;

    // dev lokal vite
    if ((host === 'localhost' || host === '127.0.0.1') && (u.port === '5173' || u.port === '3000' || u.port === '4173')) {
      return true;
    }

    // produksi vercel utama
    if (origin === 'https://monad-stacker.vercel.app') return true;

    // preview vercel untuk project "monad-stacker"
    // contoh: https://monad-stacker-git-main-XXXX.vercel.app
    if (host.endsWith('.vercel.app') && host.startsWith('monad-stacker')) {
      return true;
    }
  } catch (_) {
    return false;
  }
  return false;
}

app.use(
  cors({
    origin: (origin, cb) => (isAllowedOrigin(origin) ? cb(null, true) : cb(new Error('Not allowed by CORS'))),
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// Tangani preflight
app.options('*', cors());

app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    serverWallet: account.address,
    chainId: chain.id,
    allowedFromEnv: ENV_ALLOWED,
  });
});

// Mulai sesi game: server kirim token bertanda tangan
app.post('/api/start-session', (req, res) => {
  const Body = z.object({ wallet: z.string().min(10) });
  const parsed = Body.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Bad body' });

  const { wallet: player } = parsed.data;
  const sessionId = uuidv4();
  const startTs = Date.now();
  const minMs = 3000; // durasi minimum biar ga insta-cheat
  const token = signSessionToken({ sessionId, player, startTs, minMs });
  res.json({ sessionId, token, crossAppId: CROSS_APP_ID });
});

// Submit skor + transaksi (delta) ke onchain
app.post('/api/submit', async (req, res) => {
  const Body = z.object({
    sessionId: z.string().min(10),
    token: z.string().min(10),
    wallet: z.string().min(10),
    scoreDelta: z.number().int().min(1).max(999999),
    txDelta: z.number().int().min(0).max(100).optional().default(1),
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
    // Client-mu sudah menangani run otomatis submit saat jatuh,
    // jadi guard ini cukup untuk mencegah spam.
  }

  // Guard sederhana: skor maksimum relatif durasi (opsional)
  const maxAllowed = Math.max(10, Math.floor(elapsed / 200));
  if (scoreDelta > maxAllowed * 10) {
    return res.status(400).json({ error: 'Suspicious score' });
  }

  try {
    const hash = await wallet.writeContract({
      address: CONTRACT,
      abi: ABI,
      functionName: 'updatePlayerData',
      args: [player, BigInt(scoreDelta), BigInt(txDelta ?? 1)],
    });
    await publicClient.waitForTransactionReceipt({ hash });
    res.json({ ok: true, txHash: hash });
  } catch (e) {
    console.error('updatePlayerData error:', e);
    res.status(500).json({ error: 'Contract call failed', detail: String(e?.message || e) });
  }
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
  console.log('Server wallet (_game):', account.address);
});
