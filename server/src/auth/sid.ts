import { randomBytes } from 'node:crypto';

export function generateSid() {
  return randomBytes(24).toString('base64url');
}
