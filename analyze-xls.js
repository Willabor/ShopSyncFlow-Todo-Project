import XLSX from 'xlsx';

const xlsPath = '/volume1/docker/planning/05-shopsyncflow/Upload/order-record-8117779-1761843972.xls';

// Read the XLS file
const workbook = XLSX.readFile(xlsPath);

console.log('Sheet Names:', workbook.SheetNames);
console.log('');

// Get the first sheet
const sheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[sheetName];

// Convert to JSON
const data = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

console.log('Total Rows:', data.length);
console.log('');

console.log('Column Headers (first row keys):');
if (data.length > 0) {
  console.log(Object.keys(data[0]));
}
console.log('');

console.log('First 3 rows:');
data.slice(0, 3).forEach((row, idx) => {
  console.log(`\nRow ${idx + 1}:`);
  console.log(JSON.stringify(row, null, 2));
});

// Also print CSV format to compare
console.log('\n\n=== CSV FORMAT (first 5 rows) ===\n');
const csv = XLSX.utils.sheet_to_csv(worksheet);
const lines = csv.split('\n').slice(0, 5);
lines.forEach(line => console.log(line));
