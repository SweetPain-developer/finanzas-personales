import { PrismaClient } from "@prisma/client";

import {
  DEMO_USER,
  accounts,
  categories,
  commitments,
  commitmentTemplates,
  goals,
  transactions,
  withDemoOwnership,
} from "./seed-data.js";

const prisma = new PrismaClient();

async function main() {
  await prisma.user.upsert({
    where: { email: DEMO_USER.email },
    update: {
      passwordHash: DEMO_USER.passwordHash,
      displayName: DEMO_USER.displayName,
    },
    create: DEMO_USER,
  });

  const demoOwner = { userId: DEMO_USER.id };

  await prisma.transaction.deleteMany({ where: demoOwner });
  await prisma.goal.deleteMany({ where: demoOwner });
  await prisma.commitment.deleteMany({ where: demoOwner });
  await prisma.commitmentTemplate.deleteMany({ where: demoOwner });
  await prisma.category.deleteMany({ where: demoOwner });
  await prisma.account.deleteMany({ where: demoOwner });

  await prisma.account.createMany({ data: withDemoOwnership(accounts) });
  await prisma.category.createMany({ data: withDemoOwnership(categories) });
  await prisma.goal.createMany({ data: withDemoOwnership(goals) });
  await prisma.commitmentTemplate.createMany({ data: withDemoOwnership(commitmentTemplates) });
  await prisma.commitment.createMany({ data: withDemoOwnership(commitments) });
  await prisma.transaction.createMany({ data: withDemoOwnership(transactions) });

  const [userCount, accountCount, categoryCount, goalCount, commitmentTemplateCount, commitmentCount, transactionCount] = await Promise.all([
    prisma.user.count({ where: { id: DEMO_USER.id } }),
    prisma.account.count({ where: demoOwner }),
    prisma.category.count({ where: demoOwner }),
    prisma.goal.count({ where: demoOwner }),
    prisma.commitmentTemplate.count({ where: demoOwner }),
    prisma.commitment.count({ where: demoOwner }),
    prisma.transaction.count({ where: demoOwner }),
  ]);

  console.log(
    `Seed complete: ${userCount} users, ${accountCount} accounts, ${categoryCount} categories, ${goalCount} goals, ${commitmentTemplateCount} commitment templates, ${commitmentCount} commitments, ${transactionCount} transactions.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
