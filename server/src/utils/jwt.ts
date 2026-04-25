import jwt, { type SignOptions } from "jsonwebtoken";
import type { Role } from "@prisma/client";
import { env, requiredEnv } from "../config/env";

const ACCESS_SECRET = env.JWT_ACCESS_SECRET ?? requiredEnv("JWT_ACCESS_SECRET");
const REFRESH_SECRET = env.JWT_REFRESH_SECRET ?? requiredEnv("JWT_REFRESH_SECRET");
const ACCESS_EXPIRES_IN = env.JWT_ACCESS_EXPIRES_IN;
const REFRESH_EXPIRES_IN = env.JWT_REFRESH_EXPIRES_IN;

export type AccessTokenPayload = {
  sub: string; // userId
  email: string;
  company_id: string;
  roles: Role[];
};

export type RefreshTokenPayload = {
  sub: string;
  jti: string;
};

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, ACCESS_SECRET, { expiresIn: ACCESS_EXPIRES_IN } as SignOptions);
}

export function signRefreshToken(payload: RefreshTokenPayload): string {
  return jwt.sign(payload, REFRESH_SECRET, { expiresIn: REFRESH_EXPIRES_IN } as SignOptions);
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    return jwt.verify(token, ACCESS_SECRET) as AccessTokenPayload;
  } catch {
    throw new Error("Invalid or expired access token");
  }
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  try {
    return jwt.verify(token, REFRESH_SECRET) as RefreshTokenPayload;
  } catch {
    throw new Error("Invalid or expired refresh token");
  }
}
