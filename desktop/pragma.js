const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    const result = await prisma.$queryRawUnsafe(`SELECT typeof(fileId) as t, fileId, id, logicalTimestamp FROM event_log LIMIT 10;`);
    console.table(result);
  } catch (e) {
    console.error(e);
  } finally {
    await prisma.$disconnect();
  }
}
main();
