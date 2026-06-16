import { prisma } from '../src/lib/db'
import * as bcrypt from 'bcryptjs'

async function main() {
  console.log('Starting database seeding...')

  // 1. Seed Users
  const passwordHash = await bcrypt.hash('password123', 10);
  
  await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      passwordHash,
      role: 'ADMIN',
    },
  });

  await prisma.user.upsert({
    where: { username: 'laundry' },
    update: {},
    create: {
      username: 'laundry',
      passwordHash,
      role: 'LAUNDRY',
    },
  });

  console.log('Seed users completed.')

  // 2. Seed Linen Types
  const linenTypes = [
    { name: 'Ga trải giường bệnh nhân', unit: 'Cái' },
    { name: 'Vỏ chăn bông', unit: 'Cái' },
    { name: 'Vỏ gối', unit: 'Cái' },
    { name: 'Áo choàng phẫu thuật', unit: 'Bộ' },
    { name: 'Đồng phục bệnh nhân', unit: 'Bộ' },
  ];

  for (const lt of linenTypes) {
    await prisma.linenType.upsert({
      where: { name: lt.name },
      update: {},
      create: lt,
    });
  }

  console.log('Seed linen types completed.')

  // Fetch all linen types to link in tickets
  const dbLinenTypes = await prisma.linenType.findMany();
  const ltGaId = dbLinenTypes.find((lt: any) => lt.name === 'Ga trải giường bệnh nhân')?.id || '';
  const ltChanId = dbLinenTypes.find((lt: any) => lt.name === 'Vỏ chăn bông')?.id || '';
  const ltGoiId = dbLinenTypes.find((lt: any) => lt.name === 'Vỏ gối')?.id || '';
  const ltAoId = dbLinenTypes.find((lt: any) => lt.name === 'Áo choàng phẫu thuật')?.id || '';
  const ltDongPhucId = dbLinenTypes.find((lt: any) => lt.name === 'Đồng phục bệnh nhân')?.id || '';

  // 3. Clean up existing Tickets, Wards & Staff
  await prisma.ticketItem.deleteMany({});
  await prisma.ticket.deleteMany({});
  await prisma.ward.deleteMany({});
  await prisma.staff.deleteMany({});
  console.log('Cleaned up old tickets, wards, and staff.');

  // Seed Staff (Orderlies)
  const orderlies = [
    { nhanvien: 'Nguyễn Văn Hộ lý', hientrang: 'Đang làm' },
    { nhanvien: 'Trần Thị Hộ lý', hientrang: 'Đang làm' },
    { nhanvien: 'Lê Văn Hộ lý', hientrang: 'Đang làm' },
  ];
  for (const o of orderlies) {
    await prisma.staff.create({ data: o });
  }
  console.log('Seed staff completed.');

  // 4. Seed Wards
  const wards = [
    { name: 'Khoa Nội', qrToken: 'token-noi' },
    { name: 'Khoa Ngoại', qrToken: 'token-ngoai' },
    { name: 'Khoa Sản', qrToken: 'token-san' },
    { name: 'Khoa Nhi', qrToken: 'token-nhi' },
    { name: 'Khoa Cấp Cứu', qrToken: 'token-cap-cuu' },
  ];

  const seededWards: any[] = [];
  for (const w of wards) {
    const seeded = await prisma.ward.create({
      data: w,
    });
    seededWards.push(seeded);
  }

  console.log('Seed wards completed.')

  // 5. Seed Mock Pending Tickets for each ward
  const mockTickets = [
    {
      wardName: 'Khoa Cấp Cứu',
      items: [
        { linenTypeId: ltGaId, quantity: 15 },
        { linenTypeId: ltGoiId, quantity: 15 },
      ]
    },
    {
      wardName: 'Khoa Ngoại',
      items: [
        { linenTypeId: ltAoId, quantity: 25 },
        { linenTypeId: ltGaId, quantity: 10 },
      ]
    },
    {
      wardName: 'Khoa Nội',
      items: [
        { linenTypeId: ltDongPhucId, quantity: 30 },
        { linenTypeId: ltGaId, quantity: 20 },
        { linenTypeId: ltChanId, quantity: 20 },
      ]
    },
    {
      wardName: 'Khoa Sản',
      items: [
        { linenTypeId: ltGaId, quantity: 12 },
        { linenTypeId: ltGoiId, quantity: 12 },
      ]
    },
    {
      wardName: 'Khoa Nhi',
      items: [
        { linenTypeId: ltDongPhucId, quantity: 18 },
        { linenTypeId: ltGoiId, quantity: 18 },
      ]
    }
  ];

  for (const mt of mockTickets) {
    const ward = seededWards.find(w => w.name === mt.wardName);
    if (!ward) continue;

    await prisma.ticket.create({
      data: {
        wardId: ward.id,
        status: 'PENDING',
        requesterName: 'Nguyễn Văn Hộ lý',
        deliveryDate: new Date(),
        items: {
          create: mt.items.filter(item => item.linenTypeId !== '')
        }
      }
    });
  }

  console.log('Seed mock pending tickets completed.')
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
