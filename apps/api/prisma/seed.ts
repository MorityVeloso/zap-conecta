import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const plans = [
    {
      name: 'free',
      displayName: 'Free',
      priceBrlCents: 0,
      messagesPerMonth: 300,
      instancesLimit: 1,
      apiKeysLimit: 2,
      features: { support: 'community', webhooks: false, message_history_days: 7 },
    },
    {
      name: 'starter',
      displayName: 'Starter',
      priceBrlCents: 9700,
      messagesPerMonth: 5000,
      instancesLimit: 3,
      apiKeysLimit: 5,
      features: { support: 'email', webhooks: true, message_history_days: 30 },
    },
    {
      name: 'pro',
      displayName: 'Pro',
      priceBrlCents: 29700,
      messagesPerMonth: 30000,
      instancesLimit: 10,
      apiKeysLimit: -1,
      features: { support: 'priority', webhooks: true, message_history_days: 90, analytics: true },
    },
    {
      name: 'enterprise',
      displayName: 'Enterprise',
      priceBrlCents: 0,
      messagesPerMonth: -1,
      instancesLimit: -1,
      apiKeysLimit: -1,
      features: { support: 'dedicated', webhooks: true, message_history_days: -1, analytics: true, sla: true },
    },
  ];

  for (const plan of plans) {
    await prisma.plan.upsert({
      where: { name: plan.name },
      update: plan,
      create: plan,
    });
    console.log(`✓ Plan: ${plan.displayName}`);
  }

  console.log('Seed concluído.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
