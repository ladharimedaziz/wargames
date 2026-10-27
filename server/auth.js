// Accounts, passwords and sessions.
// Passwords are derived from SESSION_SECRET so they survive restarts on hosts with throwaway disks (Render free).
// Kronos can rotate any Zeus password; rotations are kept in DATA_DIR and re-derive from the secret.
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { readJSON, writeJSON } from './files.js';

const ADJ = ['amber', 'silent', 'golden', 'iron', 'crimson', 'swift', 'hidden', 'royal', 'stormy', 'frozen', 'desert', 'lunar', 'solar', 'brave', 'clever', 'noble', 'quiet', 'rapid', 'scarlet', 'silver', 'cobalt', 'emerald', 'velvet', 'wild', 'distant', 'bright', 'secret', 'ancient', 'bold', 'calm', 'eager', 'grand'];
const NOUN = ['falcon', 'harbor', 'citadel', 'comet', 'oasis', 'lantern', 'meridian', 'compass', 'summit', 'glacier', 'canyon', 'beacon', 'horizon', 'phoenix', 'monsoon', 'atlas', 'sphinx', 'tide', 'ember', 'orbit', 'quarry', 'delta', 'vortex', 'saber', 'zephyr', 'garnet', 'mirage', 'dune', 'anchor', 'raven', 'cedar', 'pharos'];

export const COMMITTEE_IDS = ['ww3', 'bravo', 'charlie', 'delta'];

let SECRET;
let rotations = {};
let custom = { passwords: {}, signouts: {} }; // passwords Kronos typed in, and forced sign-outs
let dataDir;

export function initAuth(dir) {
  dataDir = dir;
  SECRET = process.env.SESSION_SECRET;
  if (!SECRET) {
    // Local runs without a configured secret keep one in the data folder.
    const saved = readJSON(dir, 'secret.json', null);
    SECRET = saved?.secret || randomBytes(24).toString('hex');
    if (!saved) writeJSON(dir, 'secret.json', { secret: SECRET });
  }
  rotations = readJSON(dir, 'rotations.json', {});
  custom = { passwords: {}, signouts: {}, ...readJSON(dir, 'custom-accounts.json', {}) };
}

const hmac = (...parts) => createHmac('sha256', SECRET).update(parts.join('\u0000')).digest();

export function accounts() {
  const list = [{ username: 'kronos', role: 'kronos', committee: null }];
  for (const c of COMMITTEE_IDS) {
    list.push({ username: `${c}-backroom`, role: 'backroom', committee: c });
  }
  return list;
}
export const findAccount = u => accounts().find(a => a.username === String(u || '').toLowerCase().trim());

export function passwordFor(username) {
  // A password set by hand (in the app, or with `npm run reset-kronos`) wins over KRONOS_PASSWORD.
  if (custom.passwords[username]) return custom.passwords[username];
  if (username === 'kronos' && process.env.KRONOS_PASSWORD) return process.env.KRONOS_PASSWORD;
  const h = hmac('pw', username, rotations[username] || 0);
  return `${ADJ[h[0] % ADJ.length]}-${NOUN[h[1] % NOUN.length]}-${100 + (h.readUInt16BE(2) % 900)}`;
}

export function checkPassword(username, password) {
  const acc = findAccount(username);
  if (!acc) return null;
  const a = Buffer.from(passwordFor(acc.username)), b = Buffer.from(String(password || '').trim());
  return a.length === b.length && timingSafeEqual(a, b) ? acc : null;
}

export function rotatePassword(username) {
  if (!findAccount(username) || username === 'kronos') return null;
  rotations[username] = (rotations[username] || 0) + 1;
  writeJSON(dataDir, 'rotations.json', rotations);
  if (custom.passwords[username]) { delete custom.passwords[username]; saveCustom(); }
  return passwordFor(username);
}

// Kronos picks a Zeus password by hand. Like a rotation, it signs that account out everywhere.
export function setPassword(username, password) {
  const pw = String(password || '').trim();
  if (!findAccount(username)) return 'Unknown account.';
  if (pw.length < 6 || pw.length > 60 || /\s/.test(pw)) return 'Use 6 to 60 characters, no spaces.';
  custom.passwords[username] = pw;
  if (username !== 'kronos') custom.signouts[username] = (custom.signouts[username] || 0) + 1;
  saveCustom();
  return null;
}

// Signs an account out of every device without changing its password.
export function signOut(username) {
  if (!findAccount(username) || username === 'kronos') return false;
  custom.signouts[username] = (custom.signouts[username] || 0) + 1;
  saveCustom();
  return true;
}
const saveCustom = () => writeJSON(dataDir, 'custom-accounts.json', custom);
const generation = username => `${rotations[username] || 0}s${custom.signouts[username] || 0}`;

// Signed, stateless session tokens: username.expiry.generation.signature
const DAY = 86400000;
export function issueToken(username) {
  const exp = Date.now() + 14 * DAY;
  const gen = generation(username);
  const body = `${username}.${exp}.${gen}`;
  return `${body}.${hmac('session', body).toString('base64url')}`;
}

export function verifyToken(token) {
  if (!token) return null;
  const parts = String(token).split('.');
  if (parts.length !== 4) return null;
  const [username, exp, gen, sig] = parts;
  const expect = hmac('session', `${username}.${exp}.${gen}`).toString('base64url');
  if (sig.length !== expect.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) return null;
  if (Number(exp) < Date.now()) return null;
  if (gen !== generation(username)) return null; // a new password or a forced sign-out ends old sessions
  return findAccount(username);
}

export function parseCookies(header) {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

// Simple per-IP throttle for failed logins.
const fails = new Map();
export function throttled(ip) {
  const f = fails.get(ip);
  return f && f.n >= 8 && Date.now() - f.at < 5 * 60000;
}
export function noteFail(ip) {
  const f = fails.get(ip);
  if (!f || Date.now() - f.at > 5 * 60000) fails.set(ip, { n: 1, at: Date.now() });
  else { f.n++; f.at = Date.now(); }
}
export const clearFails = ip => fails.delete(ip);

// Sets a password straight on disk, for when nobody can log in (used by scripts/reset-kronos.mjs; the server
// reads the file at start-up, so restart it afterwards).
export function writePasswordFile(dir, username, password) {
  const saved = { passwords: {}, signouts: {}, ...readJSON(dir, 'custom-accounts.json', {}) };
  if (password) saved.passwords[username] = password; else delete saved.passwords[username];
  writeJSON(dir, 'custom-accounts.json', saved);
}
