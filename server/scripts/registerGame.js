import 'dotenv/config';
import { createWalletClient, http, parseAbi } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { getChain } from '../src/chain.js';

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

const RPC_URL = process.env.RPC_URL;
const CONTRACT = process.env.CONTRACT_ADDR;
let PRIV = process.env.SERVER_PRIVATE_KEY;

if (!RPC_URL || !CONTRACT || !PRIV) {
  console.error('Isi RPC_URL, CONTRACT_ADDR, SERVER_PRIVATE_KEY di server/.env');
  process.exit(1);
}

PRIV = normalizePrivateKey(PRIV);

const account = privateKeyToAccount(PRIV);
const wallet = createWalletClient({ account, chain: getChain(RPC_URL), transport: http(RPC_URL) });

const abi = parseAbi([
  'function registerGame(address _game,string _name,string _image,string _url)'
]);

const _game = account.address;
const _name = process.env.GAME_NAME || 'Monad Stacker X';
const _image = process.env.GAME_IMAGE || 'https://i.ibb.co/8N1dVJz/stacker-icon.png';
const _url = process.env.GAME_URL || 'http://localhost:5173';

try {
  const hash = await wallet.writeContract({
    address: CONTRACT,
    abi,
    functionName: 'registerGame',
    args: [_game, _name, _image, _url]
  });
  console.log('registerGame tx:', hash);
  console.log('Pastikan tx sukses di explorer.');
} catch (e) {
  console.error('registerGame gagal:', e);
  process.exit(1);
}
