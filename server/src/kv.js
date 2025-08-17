import { Redis } from "@upstash/redis";

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;

if (!url || !token) {
  console.warn("[KV] UPSTASH_REDIS_* belum diisi. Leaderboard/History tidak aktif.");
}

export const redis = url && token ? new Redis({ url, token }) : null;

const LB_KEY = "lb:zset";                 // ZSET: total score per wallet
const USERNAME_HASH = "usernames:h";      // HASH: wallet -> username
const historyKey = (w) => `history:${w.toLowerCase()}`;

export async function recordRun({ wallet, username, score, txHash, ts }) {
  if (!redis) return;
  const w = wallet.toLowerCase();
  const pipe = redis.pipeline();
  pipe.zincrby(LB_KEY, score, w);
  if (username) pipe.hset(USERNAME_HASH, { [w]: username });
  pipe.lpush(historyKey(w), JSON.stringify({ ts, score, txHash }));
  pipe.ltrim(historyKey(w), 0, 199);
  await pipe.exec();
}

export async function getLeaderboard(limit = 50) {
  if (!redis) return [];
  const pairs = await redis.zrange(LB_KEY, 0, limit - 1, { rev: true, withScores: true });
  const wallets = pairs.map((p) => p.member);
  const usernames = wallets.length ? await redis.hmget(USERNAME_HASH, ...wallets) : [];
  return pairs.map((p, i) => ({
    wallet: p.member,
    totalScore: Number(p.score || 0),
    username: usernames?.[i] || null,
    rank: i + 1,
  }));
}

export async function getUserHistory(wallet, limit = 50) {
  if (!redis) return [];
  const raw = await redis.lrange(historyKey(wallet), 0, limit - 1);
  return raw
    .map((s) => { try { return JSON.parse(s); } catch { return null; } })
    .filter(Boolean);
}
