import crypto from 'crypto';

const SECRET = process.env.SESSION_SECRET || 'change-this-secret';

export function signSessionToken(payload) {
  const data = JSON.stringify(payload);
  const sig = crypto.createHmac('sha256', SECRET).update(data).digest('hex');
  return Buffer.from(JSON.stringify({ data, sig })).toString('base64');
}

export function verifySessionToken(tokenB64) {
  try {
    const obj = JSON.parse(Buffer.from(tokenB64, 'base64').toString('utf8'));
    const expected = crypto
      .createHmac('sha256', SECRET)
      .update(obj.data)
      .digest('hex');
    if (expected !== obj.sig) return null;
    return JSON.parse(obj.data);
  } catch (e) {
    return null;
  }
}