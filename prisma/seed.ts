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
        'system:all',
        'admin:view',
        'users:view',
        'users:manage',
        'linen:view',
        'linen:manage',
        'ward:view',
        'ward:manage',
        'staff:view',
        'staff:manage',
        'inventory:all',
        'inventory:view',
        'inventory:import',
        'inventory:circulate',
        'inventory:discard',
        'inventory:min_stock',
        'dispatch:all',
        'dispatch:view',
        'dispatch:manage',
        'laundry:all',
        'laundry:view',
        'laundry:manage'
      ]
    },
    create: {
      username: 'admin',
      passwordHash,
      role: 'ADMIN',
      permissions: [
        'system:all',
        'admin:view',
        'users:view',
        'users:manage',
        'linen:view',
        'linen:manage',
        'ward:view',
        'ward:manage',
        'staff:view',
        'staff:manage',
        'inventory:all',
        'inventory:view',
        'inventory:import',
        'inventory:circulate',
        'inventory:discard',
        'inventory:min_stock',
        'dispatch:all',
        'dispatch:view',
        'dispatch:manage',
        'laundry:all',
        'laundry:view',
        'laundry:manage'
      ],
    },
  });

  await prisma.user.upsert({
    where: { username: 'laundry' },
    update: {
      permissions: ['laundry:view', 'laundry:manage']
    },
    create: {
      username: 'laundry',
      passwordHash,
      role: 'LAUNDRY',
      permissions: ['laundry:view', 'laundry:manage'],
    },
  });

  await prisma.user.upsert({
    where: { username: 'supervisor' },
    update: {
      permissions: ['admin:view', 'dispatch:manage']
    },
    create: {
      username: 'supervisor',
      passwordHash,
      role: 'SUPERVISOR',
      permissions: ['admin:view', 'dispatch:manage'],
    },
  });

  await prisma.user.upsert({
    where: { username: 'superior_cleaning' },
    update: {
      permissions: ['admin:view', 'dispatch:manage', 'dispatch:view', 'laundry:view']
    },
    create: {
      username: 'superior_cleaning',
      passwordHash,
      role: 'SUPERVISOR',
      permissions: ['admin:view', 'dispatch:manage', 'dispatch:view', 'laundry:view'],
    },
  });

  await prisma.user.upsert({
    where: { username: 'supervisor_laundry' },
    update: {
      permissions: ['admin:view', 'inventory:import', 'inventory:discard', 'inventory:min_stock', 'inventory:circulate', 'inventory:view', 'dispatch:view']
    },
    create: {
      username: 'supervisor_laundry',
      passwordHash,
      role: 'SUPERVISOR',
      permissions: ['admin:view', 'inventory:import', 'inventory:discard', 'inventory:min_stock', 'inventory:circulate', 'inventory:view', 'dispatch:view'],
    },
  });

  console.log('Seed users completed.')

  // 2. Seed Linen Types
  const linenTypesSeed = [
    { name: 'Ga giường', unit: 'Cái', minStock: 50 },
    { name: 'Mền xanh', unit: 'Cái', minStock: 20 },
    { name: 'Vỏ gối', unit: 'Cái', minStock: 40 },
    { name: 'Áo choàng phẫu thuật', unit: 'Cái', minStock: 15 },
  ];

  const ltMap: Record<string, string> = {}

  for (const lt of linenTypesSeed) {
    const created = await prisma.linenType.upsert({
      where: { name: lt.name },
      update: { minStock: lt.minStock },
      create: { name: lt.name, unit: lt.unit, minStock: lt.minStock },
    });
    ltMap[lt.name] = created.id
  }
  console.log('Seed linen types completed.')

  // Clean old inventory data for fresh experience
  console.log('Cleaning existing inventory records...')
  await prisma.linenRecycleProposal.deleteMany({})
  await prisma.linenDiscardLog.deleteMany({})
  await prisma.inventoryTransaction.deleteMany({})
  await prisma.linenCirculation.deleteMany({})
  await prisma.batch.deleteMany({})
  console.log('Cleanup completed.')

  // 3. Create Batches
  const batchData = [
    { code: 'BATCH-20260601-GA', name: 'Ga giường', totalQuantity: 100, remainingQuantity: 20, importedAt: new Date('2026-06-01') },
    { code: 'BATCH-20260624-GA', name: 'Ga giường', totalQuantity: 80, remainingQuantity: 80, importedAt: new Date('2026-06-24') },
    { code: 'BATCH-20260615-MEN', name: 'Mền xanh', totalQuantity: 50, remainingQuantity: 0, importedAt: new Date('2026-06-15') },
    { code: 'BATCH-20260610-GOI', name: 'Vỏ gối', totalQuantity: 120, remainingQuantity: 40, importedAt: new Date('2026-06-10') }
  ];

  const batchesMap: Record<string, string> = {}

  for (const b of batchData) {
    const createdBatch = await prisma.batch.create({
      data: {
        code: b.code,
        linenTypeId: ltMap[b.name],
        totalQuantity: b.totalQuantity,
        remainingQuantity: b.remainingQuantity,
        importedAt: b.importedAt
      }
    })
    batchesMap[b.code] = createdBatch.id

    // Log IMPORT transaction
    await prisma.inventoryTransaction.create({
      data: {
        type: 'IMPORT',
        linenTypeId: ltMap[b.name],
        quantity: b.totalQuantity,
        user: 'admin',
        details: `Nhập lô hàng sạch mới ${b.code} (${b.totalQuantity} chiếc).`,
        createdAt: b.importedAt
      }
    })
  }
  console.log('Seed batches completed.')

  // 4. Create Circulations & Discard Logs
  const circulationData = [
    { batchCode: 'BATCH-20260601-GA', name: 'Ga giường', qty: 80, active: 70, discard: 10, startUse: new Date('2026-06-02') },
    { batchCode: 'BATCH-20260615-MEN', name: 'Mền xanh', qty: 50, active: 45, discard: 5, startUse: new Date('2026-06-16') },
    { batchCode: 'BATCH-20260610-GOI', name: 'Vỏ gối', qty: 80, active: 80, discard: 0, startUse: new Date('2026-06-12') }
  ]

  for (const c of circulationData) {
    const circulation = await prisma.linenCirculation.create({
      data: {
        batchId: batchesMap[c.batchCode],
        linenTypeId: ltMap[c.name],
        startUseDate: c.startUse,
        originalQuantity: c.qty,
        activeQuantity: c.active,
        discardedQuantity: c.discard
      }
    })

    // Log CIRCULATE transaction
    await prisma.inventoryTransaction.create({
      data: {
        type: 'CIRCULATE',
        linenTypeId: ltMap[c.name],
        quantity: c.qty,
        user: 'admin',
        details: `Đưa ${c.qty} chiếc từ lô ${c.batchCode} vào lưu thông sử dụng.`,
        createdAt: c.startUse
      }
    })

    if (c.discard > 0) {
      await prisma.linenDiscardLog.create({
        data: {
          linenCirculationId: circulation.id,
          quantity: c.discard,
          reason: 'Hao hụt rách hỏng tự nhiên',
          loggedAt: new Date(c.startUse.getTime() + 24 * 60 * 60 * 1000 * 5) // 5 days later
        }
      })

      // Log DISCARD transaction
      await prisma.inventoryTransaction.create({
        data: {
          type: 'DISCARD',
          linenTypeId: ltMap[c.name],
          quantity: c.discard,
          user: 'superior_cleaning',
          details: `Báo hỏng rách ${c.discard} chiếc thuộc lô lưu hành gốc ${c.batchCode}.`,
          createdAt: new Date(c.startUse.getTime() + 24 * 60 * 60 * 1000 * 5)
        }
      })
    }
  }
  console.log('Seed circulations completed.')

  // 5. Create some Recycle Proposals
  const proposedDrapCirc = await prisma.linenCirculation.findFirst({
    where: { linenType: { name: 'Ga giường' } }
  })

  if (proposedDrapCirc) {
    await prisma.linenRecycleProposal.create({
      data: {
        linenCirculationId: proposedDrapCirc.id,
        quantity: 12,
        status: 'PENDING',
        proposerName: 'supervisor_laundry',
        proposedAt: new Date()
      }
    })

    await prisma.inventoryTransaction.create({
      data: {
        type: 'RECYCLE_PROPOSE',
        linenTypeId: ltMap['Ga giường'],
        quantity: 12,
        user: 'supervisor_laundry',
        details: `Đề xuất tái chế 12 Ga giường cũ hỏng thành vỏ gối.`,
        createdAt: new Date()
      }
    })
  }

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
