const fs = require('fs');
const buf = fs.readFileSync("c:\\Users\\tien\\Downloads\\Bảng dữ liệu Hộ lý - Staff.csv");
console.log("Buffer length:", buf.length);
console.log("First 50 bytes (hex):", buf.slice(0, 50).toString('hex'));
console.log("First 100 chars as UTF-8:", buf.slice(0, 100).toString('utf8'));
console.log("First 100 chars as UTF-16LE:", buf.slice(0, 100).toString('utf16le'));
