import { prisma } from '@/utils/prisma'

export const cleanupExpiredSessions = async () => {
  await prisma.session.deleteMany({ where: { expiresAt: { lt: new Date() } } })
}