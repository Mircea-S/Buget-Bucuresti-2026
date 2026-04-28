import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join, basename } from 'path';
import XLSX from 'xlsx';

const RAW_DIR = join(import.meta.dirname, '../../bucuresti-raw');
const OUT_DIR = join(import.meta.dirname, '../src/data');

// Institution metadata: fileRef -> { name, category }
const INSTITUTION_META = {
  "2.1": { category: "cultura" },
  "2.2": { category: "cultura" },
  "2.3": { category: "cultura" },
  "2.4": { category: "cultura" },
  "2.5": { category: "cultura" },
  "2.6": { category: "cultura" },
  "2.7": { category: "cultura" },
  "2.8": { category: "cultura" },
  "2.9": { category: "cultura" },
  "2.10": { category: "cultura" },
  "2.11": { category: "cultura" },
  "2.12": { category: "cultura" },
  "2.13": { category: "cultura" },
  "2.14": { category: "cultura" },
  "2.15": { category: "cultura" },
  "2.16": { category: "cultura" },
  "2.17": { category: "cultura" },
  "2.18": { category: "cultura" },
  "2.19": { category: "cultura" },
  "2.20": { category: "cultura" },
  "2.21": { category: "sport_educatie" },
  "2.22": { category: "sport_educatie" },
  "2.23": { category: "cultura" },
  "2.24": { category: "cultura" },
  "2.25": { category: "cultura" },
  "2.26": { category: "cultura" },
  "2.27": { category: "cultura" },
  "2.28": { category: "sport_educatie" },
  "2.29": { category: "infrastructura" },
  "2.30": { category: "social" },
  "2.31": { category: "social" },
  "2.32": { category: "cultura" },
  "2.33": { category: "social" },
  "2.34": { category: "administratie" },
  "2.35": { category: "administratie" },
  "2.36": { category: "infrastructura" },
  "2.37": { category: "infrastructura" },
  "2.38": { category: "infrastructura" },
  "2.39": { category: "infrastructura" },
  "2.40": { category: "infrastructura" },
  "2.41": { category: "infrastructura" },
  "2.42": { category: "infrastructura" },
  "2.43": { category: "infrastructura" },
  "2.44": { category: "sanatate" },
  "2.44.1.1": { category: "sanatate" },
  "2.45": { category: "cultura" },
  "2.46": { category: "infrastructura" },
  "2.47": { category: "administratie" },
};

function processXlsx(filePath) {
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws);

  if (rows.length === 0) return null;

  const first = rows[0];
  const codFiscal = String(first['CodFiscal'] || '');
  const name = String(first['Unitate'] || '');

  let totalBuget = 0;
  const bySursa = {};
  const cfMap = {};

  for (const row of rows) {
    const sursa = String(row['Sursa'] || '').trim();
    const cf = String(row['CF'] || '').trim();
    const ce = String(row['CE'] || '').trim();
    const amount = parseFloat(row['Total Buget'] || row['TotalBuget'] || 0);

    if (isNaN(amount)) continue;

    totalBuget += amount;
    bySursa[sursa] = (bySursa[sursa] || 0) + amount;

    // Group by CF top-level (first 2 digits)
    const cfTop = cf.split('.')[0];
    if (!cfTop) continue;

    if (!cfMap[cfTop]) cfMap[cfTop] = { total: 0, bySursa: {}, ceMap: {} };
    cfMap[cfTop].total += amount;
    cfMap[cfTop].bySursa[sursa] = (cfMap[cfTop].bySursa[sursa] || 0) + amount;

    // Group by CE top-level (first 2 digits)
    const ceTop = ce.split('.')[0];
    if (!ceTop) continue;

    if (!cfMap[cfTop].ceMap[ceTop]) cfMap[cfTop].ceMap[ceTop] = 0;
    cfMap[cfTop].ceMap[ceTop] += amount;
  }

  const byCF = Object.entries(cfMap)
    .map(([cf, data]) => ({
      cf,
      total: data.total,
      bySursa: data.bySursa,
      byCE: Object.entries(data.ceMap)
        .map(([ce, total]) => ({ ce, total }))
        .sort((a, b) => b.total - a.total),
    }))
    .sort((a, b) => b.total - a.total);

  return { codFiscal, name, totalBuget, bySursa, byCF };
}

function processDirectory(dir, metaMap) {
  const results = [];
  let files;
  try {
    files = readdirSync(dir).filter(f => f.endsWith('.xlsx') || f.endsWith('.xls'));
  } catch {
    console.warn(`Directory not found: ${dir}`);
    return results;
  }

  for (const file of files) {
    const filePath = join(dir, file);
    const fileRef = basename(file, '.xlsx').replace(/\.xls$/, '');

    try {
      const data = processXlsx(filePath);
      if (!data) continue;

      const meta = metaMap?.[fileRef] || {};
      results.push({
        id: fileRef.toLowerCase().replace(/[^a-z0-9.]/g, '-'),
        fileRef,
        name: data.name,
        codFiscal: data.codFiscal,
        category: meta.category || 'other',
        totalBuget: Math.round(data.totalBuget),
        bySursa: Object.fromEntries(
          Object.entries(data.bySursa).map(([k, v]) => [k, Math.round(v)])
        ),
        byCF: data.byCF.map(cf => ({
          ...cf,
          total: Math.round(cf.total),
          bySursa: Object.fromEntries(
            Object.entries(cf.bySursa).map(([k, v]) => [k, Math.round(v)])
          ),
          byCE: cf.byCE.map(ce => ({ ...ce, total: Math.round(ce.total) })),
        })),
      });
      console.log(`  OK: ${fileRef} - ${data.name} (${(data.totalBuget / 1e6).toFixed(1)} mil lei)`);
    } catch (err) {
      console.error(`  FAIL: ${file} - ${err.message}`);
    }
  }

  return results.sort((a, b) => b.totalBuget - a.totalBuget);
}

// Process institutions
console.log('Processing institution budgets...');
const institutions = processDirectory(join(RAW_DIR, 'BUGETE'), INSTITUTION_META);

// Process hospital budgets
console.log('\nProcessing hospital budgets...');
const hospitals = processDirectory(join(RAW_DIR, 'SPITALE_BUGETE'), {});
// Mark all hospitals as sanatate category
hospitals.forEach(h => { h.category = 'sanatate'; });

// Write output
const output = {
  meta: {
    source: "Proiectul de Buget al Municipiului București pe anul 2026",
    sourceUrl: "https://www.pmb.ro/buget/arhiva/get-anual-buget-list/2026/113",
    units: "lei",
    generated: new Date().toISOString().split('T')[0],
  },
  institutions,
  hospitals,
};

writeFileSync(join(OUT_DIR, 'budget-data.json'), JSON.stringify(output, null, 2));

// Summary
const totalInst = institutions.reduce((s, i) => s + i.totalBuget, 0);
const totalHosp = hospitals.reduce((s, h) => s + h.totalBuget, 0);
console.log(`\n=== Summary ===`);
console.log(`Institutions: ${institutions.length} (${(totalInst / 1e9).toFixed(1)} mld lei)`);
console.log(`Hospitals: ${hospitals.length} (${(totalHosp / 1e9).toFixed(1)} mld lei)`);
console.log(`Output: ${join(OUT_DIR, 'budget-data.json')}`);
