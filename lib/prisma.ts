import { PrismaClient } from "@prisma/client";

// Extend NodeJS global type so TypeScript knows about our global prisma
const globalForPrisma = global as typeof globalThis & {
  prisma?: PrismaClient;
};

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: ["query"], // You can also use ['query', 'error', 'warn']
  });

// Prevent multiple instances of Prisma Client in development
if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
