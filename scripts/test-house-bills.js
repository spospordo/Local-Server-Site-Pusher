#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');

const repoRoot = path.join(__dirname, '..');
const house = require(path.join(repoRoot, 'modules', 'house.js'));

function log(message) {
  console.log(message);
}

function cleanup(targetPath) {
  if (fs.existsSync(targetPath)) {
    fs.rmSync(targetPath, { recursive: true, force: true });
  }
}

function createSampleBillPdf(targetPath) {
  const textLines = [
    'Statement Date 02/05/2026',
    'Billing Period 01/01/2026 - 01/31/2026',
    'Electric usage 550 kWh',
    'Rate Schedule TOU-D-PRIME',
    'Customer Charge $10.00',
    'Total Electric Charges $45.10',
    'Solar NEM Credit ($12.34)',
    'Water Usage 11.5 HCF',
    'Tier 1 Water 6 HCF $32.00',
    'Total Water Charges $67.89',
    'Sewer usage basis 11.5 HCF',
    'Sewer Charge $22.50',
    'Solid Waste $19.75',
    'Total Sanitation Charges $42.25'
  ];

  // Build a PDF content stream using standard text operators.
  // Each line is placed 20 units below the previous one using relative Td moves.
  const streamParts = ['BT', '/F1 12 Tf', '72 720 Td'];
  textLines.forEach((line, i) => {
    const escaped = line.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
    if (i > 0) streamParts.push('0 -20 Td');
    streamParts.push(`(${escaped}) Tj`);
  });
  streamParts.push('ET');
  const streamContent = streamParts.join('\n');

  // Build the four required PDF objects (all ASCII, so byte length equals string length).
  const obj1 = '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n';
  const obj2 = '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n';
  const obj3 = '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> >>\nendobj\n';
  const obj4 = `4 0 obj\n<< /Length ${streamContent.length} >>\nstream\n${streamContent}\nendstream\nendobj\n`;

  // Calculate byte offsets for each object so the xref table is accurate.
  const header = '%PDF-1.4\n';
  const off1 = header.length;
  const off2 = off1 + obj1.length;
  const off3 = off2 + obj2.length;
  const off4 = off3 + obj3.length;
  const xrefPos = off4 + obj4.length;

  // Each xref entry must be exactly 20 bytes: offset(10) SP gen(5) SP type SP LF
  const pad10 = n => String(n).padStart(10, '0');
  const xrefEntries = [
    `0000000000 65535 f \n`,
    `${pad10(off1)} 00000 n \n`,
    `${pad10(off2)} 00000 n \n`,
    `${pad10(off3)} 00000 n \n`,
    `${pad10(off4)} 00000 n \n`
  ].join('');

  const pdf = header + obj1 + obj2 + obj3 + obj4 +
    `xref\n0 5\n${xrefEntries}` +
    `trailer\n<< /Size 5 /Root 1 0 R >>\n` +
    `startxref\n${xrefPos}\n%%EOF\n`;

  fs.writeFileSync(targetPath, pdf);
}

async function testHouseBillsModule() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'house-bills-test-'));
  const dataFilePath = path.join(tempDir, 'house-data.json');
  const pdfPath = path.join(tempDir, 'sample-bill.pdf');

  try {
    house.init({ house: { dataFilePath } });

    const defaultData = JSON.parse(fs.readFileSync(dataFilePath, 'utf8'));
    assert.deepStrictEqual(defaultData.bills, { bills: [] }, 'default house data should include bills');
    log('✅ Default house data includes bills');

    createSampleBillPdf(pdfPath);
    const extracted = await house.parseUtilityBillFromFile(pdfPath);
    assert.strictEqual(extracted.statementDate, '2026-02-05', 'statement date should be extracted');
    assert.strictEqual(extracted.period.startDate, '2026-01-01', 'billing start date should be extracted');
    assert.strictEqual(extracted.period.endDate, '2026-01-31', 'billing end date should be extracted');
    assert.strictEqual(extracted.electric.usageKwh, 550, 'electric kWh should be extracted');
    assert.strictEqual(extracted.electric.rateSchedule, 'TOU-D-PRIME', 'rate schedule should be extracted');
    assert.strictEqual(extracted.electric.totalCost, 45.10, 'electric total should be extracted');
    assert.strictEqual(extracted.water.usageHcf, 11.5, 'water HCF should be extracted');
    assert.strictEqual(extracted.water.totalCost, 67.89, 'water total should be extracted');
    assert.strictEqual(extracted.sanitation.totalCost, 42.25, 'sanitation total should be extracted');
    assert(extracted.electric.nemCredits.some(item => item.amount === -12.34), 'NEM credit should be extracted');
    assert(extracted.extractionMeta, 'extraction result should include extractionMeta');
    assert.strictEqual(extracted.extractionMeta.ocrFallbackUsed, false, 'OCR fallback should not be used for a born-digital PDF');
    assert.strictEqual(extracted.extractionMeta.textQualityUsable, true, 'text quality should be marked usable for a valid PDF');
    log('✅ PDF parsing extracts key utility bill values');

    const addResult = house.addBill({
      billDate: '2026-02-05',
      periodStartDate: extracted.period.startDate,
      periodEndDate: extracted.period.endDate,
      notes: 'January utilities',
      billFile: {
        filename: 'sample-bill.pdf',
        originalName: 'sample-bill.pdf',
        size: fs.statSync(pdfPath).size,
        mimeType: 'application/pdf'
      },
      attachments: [
        {
          filename: 'meter-photo.png',
          originalName: 'meter-photo.png',
          size: 1234,
          mimeType: 'image/png'
        }
      ],
      extractedData: extracted
    });

    assert.strictEqual(addResult.success, true, 'addBill should succeed');
    assert(addResult.bill.id, 'added bill should have an id');

    const billsData = house.getBillsData();
    assert.strictEqual(billsData.bills.length, 1, 'bill should be stored');
    assert.strictEqual(billsData.bills[0].attachments.length, 1, 'attachments should be stored with the bill');
    assert.strictEqual(house.getBill(addResult.bill.id).billDate, '2026-02-05', 'getBill should find stored bills');
    log('✅ addBill stores uploaded bill metadata and extracted data');

    const deleteResult = house.deleteBill(addResult.bill.id);
    assert.strictEqual(deleteResult.success, true, 'deleteBill should succeed');
    assert.strictEqual(house.getBillsData().bills.length, 0, 'deleteBill should remove bills');
    log('✅ deleteBill removes stored bills');

    // Verify that a garbage/binary PDF triggers the low-quality detection path
    const garbagePdfPath = path.join(tempDir, 'garbage.pdf');
    const garbageStream = zlib.deflateSync(Buffer.from('not a real bill - no keywords here'));
    // Build a PDF whose stream bytes are byte-shifted (+1 mod 256) so that the zlib
    // decompressor will reject them as invalid, leaving only non-decodable binary content.
    // This simulates receiving a PDF whose content streams are unreadable.
    const garbageContent = Buffer.concat([
      Buffer.from('%PDF-1.4\n1 0 obj\n<< /Length ' + garbageStream.length + ' >>\nstream\n', 'utf8'),
      Buffer.from(garbageStream.map(b => (b + 1) & 0xFF)),
      Buffer.from('\nendstream\nendobj\ntrailer\n<<>>\n%%EOF\n', 'utf8')
    ]);
    fs.writeFileSync(garbagePdfPath, garbageContent);
    const garbageResult = await house.parseUtilityBillFromFile(garbagePdfPath);
    assert.strictEqual(garbageResult.extractionMeta.textQualityUsable, false, 'garbage PDF should be flagged as low-quality');
    assert(garbageResult.extractionMeta.warnings.length > 0, 'garbage PDF should produce extraction warnings');
    log('✅ Binary/garbage PDFs are detected and flagged with warnings');
  } finally {
    cleanup(tempDir);
  }
}

function testStaticIntegration() {
  const serverContent = fs.readFileSync(path.join(repoRoot, 'server.js'), 'utf8');
  const dashboardContent = fs.readFileSync(path.join(repoRoot, 'admin', 'dashboard.html'), 'utf8');

  [
    "/admin/api/house/bills",
    "/admin/api/house/bills/upload",
    "/admin/api/house/bills/:billId/files/:filename",
    "/admin/api/house/bills/:id"
  ].forEach(route => {
    assert(serverContent.includes(route), `server.js should include route ${route}`);
  });
  log('✅ server.js includes House Bills API routes');

  [
    "showSubTab('house-bills')",
    'house-bills-section',
    'id="houseBillsList"',
    'function loadHouseBills()',
    'function uploadHouseBill(event)',
    'function deleteHouseBill(id)',
    'function renderHouseBills()',
    'function renderHouseBillsTrendChart()',
    'function renderHouseBillsComparisonTable()'
  ].forEach(snippet => {
    assert(dashboardContent.includes(snippet), `dashboard.html should include ${snippet}`);
  });
  log('✅ dashboard.html includes Bills tab markup and JavaScript hooks');
}

try {
  log('Running House Bills checks...\n');
  testHouseBillsModule()
    .then(() => {
      testStaticIntegration();
      log('\n🎉 House Bills checks passed');
    })
    .catch(error => {
      console.error('\n❌ House Bills checks failed');
      console.error(error);
      process.exit(1);
    });
} catch (error) {
  console.error('\n❌ House Bills checks failed');
  console.error(error);
  process.exit(1);
}
