import XLSX from 'xlsx';

const xlsPath = '/volume1/docker/planning/05-shopsyncflow/Upload/order-record-8117779-1761843972.xls';

// Read the XLS file
const workbook = XLSX.readFile(xlsPath);
const sheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[sheetName];

// Get raw data as array of arrays
const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

console.log('Total Rows:', rawData.length);
console.log('\n=== ROWS 50-89 (where products should be) ===\n');

rawData.slice(49).forEach((row, idx) => {
  console.log(`Row ${idx + 50}: ${JSON.stringify(row)}`);
});
