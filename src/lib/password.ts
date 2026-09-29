// Password hashing with Node's built-in scrypt (no native deps). Shared by the app and the CLI.
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const N = 16384;
const KEYLEN = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, KEYLEN, { N, r: 8, p: 1 });
  return `scrypt$${N}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, n, saltB64, hashB64] = stored.split("$");
  if (scheme !== "scrypt" || !n || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, "base64");
  const actual = scryptSync(password, Buffer.from(saltB64, "base64"), expected.length, { N: Number(n), r: 8, p: 1 });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Rules shown to the admin when choosing a password. Returns an error message or null. */
export function passwordProblem(password: string): string | null {
  if (password.length < 10) return "Паролата трябва да е поне 10 символа.";
  if (!/[a-zA-Zа-яА-Я]/.test(password) || !/\d/.test(password)) return "Паролата трябва да съдържа поне една буква и една цифра.";
  return null;
}

export function generatePassword(): string {
  // Readable: no 0/O/1/l confusion.
  const alphabet = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(14);
  let out = "";
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return `${out.slice(0, 5)}-${out.slice(5, 10)}-${out.slice(10)}`;
}
