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
import { recordRun, getLeaderboard, getUserHistory } from './kv.js';

function normalizePrivateKey(input) {
  if (!input) throw new Error('Missing SERVER_PRIVATE_KEY');
  let k = String(input).trim();
  k = k.replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
  k = k.replace(/\s+/g, '');
  if (k.startsWith('0x') || k.startsWith('0X')) k = k.slice(2);
  if (!/^[0-9a-fA-F]{64}$/.test(k)) throw new Error('SERVER_PRIVATE_KEY harus 64 hex dengan prefix 0x');
  return '0x' + k.toLowerCase();
}

const PORT = Number(process.env.PORT || 3000);
const RPC_URL = process.env.RPC_URL;
const CONTRACT = process.env.CONTRACT_ADDR;
const CROSS_APP_ID = process.env.CROSS_APP_ID || 'cmd8euall0037le0my79qpz42';
let PRIV = process.env.SERVER_PRIVATE_KEY;

const ENV_ALLOWED = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

if (!RPC_URL || !CONTRACT || !PRIV) {
  console.error('\n[CONFIG ERROR]\nPastikan RPC_URL, CONTRACT_ADDR, dan SERVER_PRIVATE_KEY terisi di server/.env');
  process.exit(1);
}
PRIV = normalizePrivateKey(PRIV);

const chain = getChain(RPC_URL);
const account = privateKeyToAccount(PRIV);
const wallet = createWalletClient({ account, chain, transport: http(RPC_URL) });
const publicClient = createPublicClient({ chain, transport: http(RPC_URL) });

const app = express();
app.use(helmet());

function isAllowedOrigin(origin) {
  if (!origin) return true;
  if (ENV_ALLOWED.includes(origin)) return true;
  try {
    const u = new URL(origin);
    const host = u.hostname;
    if ((host === 'localhost' || host === '127.0.0.1') && ['5173','3000','4173'].includes(u.port)) return true;
    if (origin === 'https://monad-stacker.vercel.app') return true;
    if (host.endsWith('.vercel.app') && host.startsWith('monad-stacker')) return true;
  } catch { return false; }
  return false;
}

app.use(cors({
  origin: (origin, cb) => (isAllowedOrigin(origin) ? cb(null, true) : cb(new Error('Not allowed by CORS'))),
  credentials: true,
  methods: ['GET','POST','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization']
}));
app.options('*', cors());

app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ ok: true, serverWallet: account.address, chainId: chain.id, allowedFromEnv: ENV_ALLOWED });
});

app.post('/api/start-session', (req, res) => {
  const Body = z.object({ wallet: z.string().min(10) });
  const parsed = Body.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Bad body' });
  const { wallet: player } = parsed.data;
  const sessionId = uuidv4();
  const startTs = Date.now();
  const minMs = 3000;
  const token = signSessionToken({ sessionId, player, startTs, minMs });
  res.json({ sessionId, token, crossAppId: CROSS_APP_ID });
});

app.post('/api/submit', async (req, res) => {
  const Body = z.object({
    sessionId: z.string().min(10),
    token: z.string().min(10),
    wallet: z.string().min(10),
    scoreDelta: z.number().int().min(1).max(999999),
    txDelta: z.number().int().min(0).max(100).optional().default(1),
    username: z.string().min(1).max(64).optional()
  });
  const parsed = Body.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Bad body' });

  const { sessionId, token, wallet: player, scoreDelta, txDelta, username } = parsed.data;
  const payload = verifySessionToken(token);
  if (!payload || payload.sessionId !== sessionId || payload.player !== player) {
    return res.status(401).json({ error: 'Invalid session' });
  }
  const elapsed = Date.now() - payload.startTs;
  if (elapsed < payload.minMs) return res.status(400).json({ error: 'Session too short' });

  const maxAllowed = Math.max(10, Math.floor(elapsed / 200));
  if (scoreDelta > maxAllowed * 10) return res.status(400).json({ error: 'Suspicious score' });

  try {
    const hash = await wallet.writeContract({
      address: CONTRACT,
      abi: ABI,
      functionName: 'updatePlayerData',
      args: [player, BigInt(scoreDelta), BigInt(txDelta ?? 1)]
    });
    await publicClient.waitForTransactionReceipt({ hash });

    try {
      await recordRun({ wallet: player, username, score: scoreDelta, txHash: hash, ts: Date.now() });
    } catch (e) {
      console.warn('[KV] Gagal simpan ke Upstash:', e?.message || e);
    }

    res.json({ ok: true, txHash: hash, savedToKV: true });
  } catch (e) {
    console.error('updatePlayerData error:', e);
    res.status(500).json({ error: 'Contract call failed', detail: String(e?.message || e) });
  }
});

app.get('/api/leaderboard', async (_req, res) => {
  try {
    const top = await getLeaderboard(50);
    res.json({ ok: true, data: top });
  } catch (e) {
    console.error('leaderboard error:', e);
    res.status(500).json({ ok: false, error: 'kv failed' });
  }
});

app.get('/api/history/:wallet', async (req, res) => {
  try {
    const items = await getUserHistory(req.params.wallet, 100);
    res.json({ ok: true, data: items });
  } catch (e) {
    console.error('history error:', e);
    res.status(500).json({ ok: false, error: 'kv failed' });
  }
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
  console.log('Server wallet (_game):', account.address);
});
