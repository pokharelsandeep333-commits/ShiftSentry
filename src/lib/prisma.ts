import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const connectionString = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/shiftsaas?schema=public";
const adapter = new PrismaPg({ connectionString });

/** Server-only direct database client. Never import this from a client component. */
export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
