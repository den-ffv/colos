import argon2 from 'argon2';

export const hashPassword = (p: string) => argon2.hash(p, { type: argon2.argon2id });

export const verifyPassword = (hash: string, p: string) => argon2.verify(hash, p);
