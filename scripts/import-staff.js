const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');

// 1. Manually parse .env file
try {
  const envPath = path.join(__dirname, '../.env');
  if (fs.existsSync(envPath)) {
    const envConfig = fs.readFileSync(envPath, 'utf8');
    envConfig.split(/\r?\n/).forEach(line => {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        const key = match[1];
        let value = match[2] || '';
        if (value.startsWith('"') && value.endsWith('"')) {
          value = value.slice(1, -1);
        } else if (value.startsWith("'") && value.endsWith("'")) {
          value = value.slice(1, -1);
        }
        process.env[key] = value;
      }
    });
    console.log('Loaded environmental variables from .env successfully.');
  } else {
    console.warn('.env file not found at:', envPath);
  }
} catch (e) {
  console.warn('Failed to load .env file manually:', e.message);
}

const csvFilePath = process.argv[2];
if (!csvFilePath) {
  console.error('Error: Please provide the path to the CSV file as an argument.');
  console.error('Usage: node scripts/import-staff.js <path-to-csv-file>');
  process.exit(1);
}

if (!fs.existsSync(csvFilePath)) {
  console.error(`Error: File not found at path "${csvFilePath}"`);
  process.exit(1);
}

// 2. Initialize Prisma Client with Pool
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('Error: DATABASE_URL is not defined in environment.');
  process.exit(1);
}

const pool = new Pool({
  connectionString,
  ssl: {
    rejectUnauthorized: false,
  },
  max: 1,
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function importStaff() {
  console.log(`Starting import from: ${csvFilePath}`);
  
  const fileStream = fs.createReadStream(csvFilePath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  let isFirstLine = true;
  let importedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  for await (const line of rl) {
    // Skip empty lines
    if (!line.trim()) continue;

    // Parse CSV line
    const parts = line.split(',');
    const name = parts[0].trim();
    
    // Skip header line
    if (isFirstLine && (name.toLowerCase() === 'nhanvien' || name.toLowerCase() === 'name')) {
      isFirstLine = false;
      continue;
    }
    isFirstLine = false;

    let status = 'Đang làm';
    if (parts.length >= 2) {
      status = parts[1].trim() || 'Đang làm';
    }

    try {
      // Upsert into Staff table
      await prisma.staff.upsert({
        where: { nhanvien: name },
        update: {
          hientrang: status || 'Đang làm'
        },
        create: {
          nhanvien: name,
          hientrang: status || 'Đang làm'
        }
      });
      console.log(`+ Đã thêm/cập nhật: ${name} (${status || 'Đang làm'})`);
      importedCount++;
    } catch (err) {
      console.error(`x Lỗi khi import ${name}:`, err.message);
      errorCount++;
    }
  }

  console.log('\n--- KẾT QUẢ IMPORT ---');
  console.log(`Thành công (Đã thêm/cập nhật): ${importedCount}`);
  console.log(`Thất bại (Có lỗi): ${errorCount}`);
}

importStaff()
  .catch(err => {
    console.error('Fatal Error during import:', err);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
    console.log('Database connection closed.');
  });
