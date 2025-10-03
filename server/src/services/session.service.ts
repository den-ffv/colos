import { prisma } from '@/utils/prisma'
import { type Response, type Request, response } from 'express'
import type { SessionData } from '@/types.ts'
import { generateSid } from '@/auth/sid'
import cookie from 'cookie'

const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME || 'sid' 
const SESSION_TTL_MS = process.env.SESSION_TTL_MS || 10 * 24 * 60 * 60 * 1000
const SESSION_SLIDING_THRESHOLD_MS = process.env.SESSION_SLIDING_THRESHOLD_MS || 24 * 60 * 60 * 1000 

const isProd = process.env.NODE_ENV === 'production';

export const createSession = async (response: Response, data: SessionData) => {
  const sid = generateSid();
  const expiresAt = new Date(Date.now() + Number(SESSION_TTL_MS));

  const stored = await prisma.session.create({
    data: { sid, data, expiresAt },
  });

  response.setHeader('Set-Cookie', cookie.serialize(SESSION_COOKIE_NAME, sid, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'lax' : 'lax',
    path: '/',
    maxAge: Math.floor(Number(SESSION_TTL_MS) / 1000),
  }));

  return stored;
};

export const getSessionBySid = async (sid: string) => {
  const s = await prisma.session.findUnique({ where: { sid } });

  if (!s) return null;
  if (s.expiresAt <= new Date()) return null;

  return s;
};

export const touchSessionIfNeeded = async (sid: string) => {
  const s = await prisma.session.findUnique({ where: { sid } });
  if (!s) return;
  const msLeft = s.expiresAt.getTime() - Date.now();
  if (msLeft < Number(SESSION_SLIDING_THRESHOLD_MS)) {
    await prisma.session.update({
      where: { sid },
      data: { expiresAt: new Date(Date.now() + Number(SESSION_TTL_MS)) },
    });
  }
};

export const destroySession = async (res: Response, sid: string) => {
  await prisma.session.deleteMany({ where: { sid } });

  res.setHeader('Set-Cookie', cookie.serialize(SESSION_COOKIE_NAME, '', {
    httpOnly: true, secure: isProd, sameSite: isProd ? 'lax' : 'lax', path: '/', maxAge: 0,
  }));
}