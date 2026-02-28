import { randomBytes, randomUUID } from "node:crypto";

export function createId(prefix: string) {
  return `${prefix}-${randomUUID()}`;
}

export function createToken(byteLength = 24) {
  return randomBytes(byteLength).toString("hex");
}
