import { prisma } from '../src/lib/db'
import * as bcrypt from 'bcryptjs'

async function main() {
  console.log('Starting database seeding...')

  // 1. Seed Users
  const passwordHash = await bcrypt.hash('password123', 10);
  
  await prisma.user.upsert({
    where: { username: 'admin' },
    update: {
      permissions: [
        'admin:view',
        'admin:linen',
        'admin:ward',
        'admin:staff',
        'admin:batch',
        'admin:ticket',
        'admin:users',
        'laundry:view'
      ]
    },
    create: {
      username: 'admin',
      passwordHash,
      role: 'ADMIN',
      permissions: [
        'admin:view',
        'admin:linen',
        'admin:ward',
        'admin:staff',
        'admin:batch',
        'admin:ticket',
        'admin:users',
        'laundry:view'
      ],
    },
  });

  await prisma.user.upsert({
    where: { username: 'laundry' },
    update: {
      permissions: ['laundry:view']
    },
    create: {
      username: 'laundry',
      passwordHash,
      role: 'LAUNDRY',
      permissions: ['laundry:view'],
    },
  });

  console.log('Seed users completed.')

  // 2. Seed Linen Types
  const linenTypes = [
    { name: 'Mền xanh', unit: 'Cái' },
    { name: 'Vỏ gối', unit: 'Cái' },
    { name: 'Áo choàng phẫu thuật', unit: 'Cái' },
  ];

  for (const lt of linenTypes) {
    await prisma.linenType.upsert({
      where: { name: lt.name },
      update: {},
      create: lt,
    });
  }

  console.log('Seed linen types completed.')

  console.log('Database seeding finished successfully.')
}

main()
  .catch((e) => {
    console.error('Error seeding database:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
