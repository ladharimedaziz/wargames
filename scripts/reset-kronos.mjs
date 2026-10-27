// Resets the Kronos password when you cannot log in.
//   npm run reset-kronos -- my-new-password     sets it
//   npm run reset-kronos                        picks a random one and prints it
// Restart the server afterwards (close the World Engine window and open it again).
import { randomBytes } from 'node:crypto';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writePasswordFile } from '../server/auth.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dir = resolve(process.env.DATA_DIR || join(ROOT, 'data'));
const pw = process.argv[2] || `kronos-${randomBytes(3).toString('hex')}`;
if (pw.length < 6 || /\s/.test(pw)) { console.error('Use at least 6 characters, no spaces.'); process.exit(1); }
writePasswordFile(dir, 'kronos', pw);
console.log(`\n  The Kronos password is now: ${pw}\n  Restart the World Engine for it to take effect.\n`);
