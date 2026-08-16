import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import {
  BETA_PASSWORD_DIGEST_BYTES,
  BETA_PASSWORD_SALT_BYTES,
  BETA_PASSWORD_SCRYPT_BLOCK_SIZE,
  BETA_PASSWORD_SCRYPT_COST,
  BETA_PASSWORD_SCRYPT_PARALLELIZATION,
} from "./constants";

const SERIALIZATION_ALGORITHM = "scrypt";
const SERIALIZATION_VERSION = "v1";
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(
      password,
      salt,
      BETA_PASSWORD_DIGEST_BYTES,
      {
        N: BETA_PASSWORD_SCRYPT_COST,
        r: BETA_PASSWORD_SCRYPT_BLOCK_SIZE,
        p: BETA_PASSWORD_SCRYPT_PARALLELIZATION,
        maxmem: 64 * 1024 * 1024,
      },
      (error, derivedKey) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(derivedKey as Buffer);
      },
    );
  });
}

export async function hashBetaPassword(password: string): Promise<string> {
  const salt = randomBytes(BETA_PASSWORD_SALT_BYTES);
  const digest = await derive(password, salt);

  return [
    SERIALIZATION_ALGORITHM,
    SERIALIZATION_VERSION,
    BETA_PASSWORD_SCRYPT_COST,
    BETA_PASSWORD_SCRYPT_BLOCK_SIZE,
    BETA_PASSWORD_SCRYPT_PARALLELIZATION,
    salt.toString("base64url"),
    digest.toString("base64url"),
  ].join("$");
}

export async function verifyBetaPassword(
  password: string,
  serialized: string,
): Promise<boolean> {
  const fields = serialized.split("$");
  if (fields.length !== 7) return false;

  const [
    algorithm,
    version,
    cost,
    blockSize,
    parallelization,
    saltText,
    digestText,
  ] = fields;
  if (
    algorithm !== SERIALIZATION_ALGORITHM ||
    version !== SERIALIZATION_VERSION ||
    cost !== String(BETA_PASSWORD_SCRYPT_COST) ||
    blockSize !== String(BETA_PASSWORD_SCRYPT_BLOCK_SIZE) ||
    parallelization !== String(BETA_PASSWORD_SCRYPT_PARALLELIZATION) ||
    !saltText ||
    !digestText ||
    !BASE64URL_PATTERN.test(saltText) ||
    !BASE64URL_PATTERN.test(digestText)
  ) {
    return false;
  }

  const salt = Buffer.from(saltText, "base64url");
  const expected = Buffer.from(digestText, "base64url");
  if (
    salt.length !== BETA_PASSWORD_SALT_BYTES ||
    expected.length !== BETA_PASSWORD_DIGEST_BYTES
  ) {
    return false;
  }

  const actual = await derive(password, salt);
  return timingSafeEqual(actual, expected);
}
