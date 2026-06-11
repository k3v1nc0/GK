import { pbkdf2 as pbkdf2Callback, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
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
  const parts = storedHash.split("$");

  if (parts.length !== 6 || parts[0] !== "scrypt") {
    return false;
  }

  const cost = parts[1];
  const blockSize = parts[2];
  const parallelization = parts[3];
  const saltBase64 = parts[4];
  const expectedBase64 = parts[5];

  if (!cost || !blockSize || !parallelization || !saltBase64 || !expectedBase64) {
    return false;
  }

  const expected = Buffer.from(expectedBase64, "base64");
  const actual = (await scrypt(candidatePassword, Buffer.from(saltBase64, "base64"), expected.length, {
    N: Number(cost),
    r: Number(blockSize),
    p: Number(parallelization)
  })) as Buffer;

  return buffersEqual(actual, expected);
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
