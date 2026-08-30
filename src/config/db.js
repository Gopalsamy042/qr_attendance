/**
 * Single PrismaClient instance for the process.
 * Creating a new client per request would exhaust the Postgres connection pool.
 */
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

module.exports = prisma;
