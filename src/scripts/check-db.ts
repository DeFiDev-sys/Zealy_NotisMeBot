/**
 * Check database projects
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const projects = await prisma.project.findMany();
  console.log("Projects:", JSON.stringify(projects, null, 2));
}

main().finally(() => prisma.$disconnect());