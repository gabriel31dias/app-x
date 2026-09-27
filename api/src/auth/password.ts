import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

// scrypt do próprio Node: sem dependência nativa extra. Formato: scrypt$salt$hash (hex)
const scryptAsync = promisify(scrypt) as (senha: string, salt: Buffer, len: number) => Promise<Buffer>;
const KEYLEN = 64;

export async function hashPassword(senha: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scryptAsync(senha, salt, KEYLEN);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export async function verifyPassword(senha: string, stored: string): Promise<boolean> {
  const [algo, saltHex, hashHex] = stored.split('$');
  if (algo !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = await scryptAsync(senha, Buffer.from(saltHex, 'hex'), expected.length);
  return timingSafeEqual(actual, expected);
}

// usado quando o usuário não existe, pra resposta levar o mesmo tempo (não revela quem tem conta)
export const DUMMY_HASH = `scrypt$${'0'.repeat(32)}$${'0'.repeat(KEYLEN * 2)}`;
