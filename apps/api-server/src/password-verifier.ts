import { pbkdf2 as pbkdf2Callback, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = (password: string | Buffer, salt: string | Buffer, keylen: number, options: { N: number; r: number; p: number }): Promise<Buffer> =>
  new Promise((resolve, reject) =>
    scryptCallback(password, salt, keylen, options, (err, key) => err ? reject(err) : resolve(key))
  );
const pbkdf2 = promisify(pbkdf2Callback);

export type EditorPasswordVerifier = (
  candidatePassword: string,
  storedHash: string,
  algorithm: string
) => Promise<boolean>;

export const verifyEditorPassword: EditorPasswordVerifier = async (
  candidatePassword,
  storedHash,
  algorithm
) => {
  const normalized = algorithm.trim().toLowerCase();

  if (normalized === "scrypt" || normalized === "scrypt-sha256" || storedHash.startsWith("scrypt$")) {
    return verifyScrypt(candidatePassword, storedHash);
  }

  if (normalized === "pbkdf2-sha256" || storedHash.startsWith("pbkdf2-sha256$")) {
    return verifyPbkdf2Sha256(candidatePassword, storedHash);
  }

  if (normalized === "bcrypt" || /^\$2[aby]\$/.test(storedHash)) {
    return verifyBcrypt(candidatePassword, storedHash);
  }

  if (normalized === "argon2id" || storedHash.startsWith("$argon2")) {
    return verifyArgon2(candidatePassword, storedHash);
  }

  return false;
};

async function verifyScrypt(candidatePassword: string, storedHash: string): Promise<boolean> {
  // Format A: scrypt$N$r$p$saltBase64$hashBase64
  if (storedHash.startsWith("scrypt$")) {
    const parts = storedHash.split("$");
    if (parts.length !== 6) return false;
    const [, cost, blockSize, parallelization, saltBase64, expectedBase64] = parts;
    if (!cost || !blockSize || !parallelization || !saltBase64 || !expectedBase64) return false;
    const expected = Buffer.from(expectedBase64, "base64");
    const actual = await scrypt(candidatePassword, Buffer.from(saltBase64, "base64"), expected.length, {
      N: Number(cost), r: Number(blockSize), p: Number(parallelization)
    });
    return buffersEqual(actual, expected);
  }

  // Format B: scrypt:N=<n>,r=<r>,p=<p>:saltBase64url:hashBase64url
  if (storedHash.startsWith("scrypt:")) {
    const parts = storedHash.split(":");
    if (parts.length !== 4) return false;
    const [, params, saltB64url, expectedB64url] = parts;
    const N = Number(params?.match(/N=(\d+)/)?.[1]);
    const r = Number(params?.match(/r=(\d+)/)?.[1]);
    const p = Number(params?.match(/p=(\d+)/)?.[1]);
    if (!N || !r || !p || !saltB64url || !expectedB64url) return false;
    const toBase64 = (s: string) => s.replace(/-/g, "+").replace(/_/g, "/");
    const expected = Buffer.from(toBase64(expectedB64url), "base64");
    const actual = await scrypt(candidatePassword, Buffer.from(toBase64(saltB64url), "base64"), expected.length, { N, r, p });
    return buffersEqual(actual, expected);
  }

  return false;
}

async function verifyPbkdf2Sha256(candidatePassword: string, storedHash: string): Promise<boolean> {
  const parts = storedHash.split("$");

  if (parts.length !== 4 || parts[0] !== "pbkdf2-sha256") {
    return false;
  }

  const iterations = parts[1];
  const saltBase64 = parts[2];
  const expectedBase64 = parts[3];

  if (!iterations || !saltBase64 || !expectedBase64) {
    return false;
  }

  const expected = Buffer.from(expectedBase64, "base64");
  const actual = await pbkdf2(candidatePassword, Buffer.from(saltBase64, "base64"), Number(iterations), expected.length, "sha256");

  return buffersEqual(actual, expected);
}

async function verifyBcrypt(candidatePassword: string, storedHash: string): Promise<boolean> {
  try {
    const bcrypt = await import("bcryptjs");
    return bcrypt.compare(candidatePassword, storedHash);
  } catch {
    return false;
  }
}

async function verifyArgon2(candidatePassword: string, storedHash: string): Promise<boolean> {
  try {
    const argon2 = await import("@node-rs/argon2");
    return argon2.verify(storedHash, candidatePassword);
  } catch {
    return false;
  }
}

function buffersEqual(actual: Buffer, expected: Buffer): boolean {
  if (actual.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(actual, expected);
}
