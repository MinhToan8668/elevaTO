// node test_rules.js <fixtures.json> [expect.json]  — chạy rule trên text OCR đã lưu, so với kết quả mong đợi
const R = require('./rules.js');
const fs = require('fs'); const path = require('path');
const fx = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const expect = process.argv[3] ? JSON.parse(fs.readFileSync(process.argv[3], 'utf8')) : {};
(async () => {
  let ok = 0, bad = 0;
  for (const [file, variants] of Object.entries(fx)) {
    const name = path.basename(file);
    for (const [v, text] of Object.entries(variants)) {
      const f = await R.extractFields(text, name);
      const key = name.replace(/_(scan|text)\.pdf$/, '');
      const e = expect[key] || {};
      const got = { loai: f.loai, so: f.so || '', ngay: R.fmtDate(f.ngay) };
      const diffs = Object.keys(e).filter(k => e[k] !== got[k]).map(k => `${k}: muốn '${e[k]}' được '${got[k]}'`);
      if (Object.keys(e).length) { diffs.length ? bad++ : ok++; }
      console.log(`${diffs.length ? 'FAIL' : ' ok '} ${name} [${v}] -> [${f.loai}] ${f.so || '-'} | ${R.fmtDate(f.ngay) || '-'} (${f.nguon_ngay || ''}) | ${f.ten} | ${(f.noi_dung || '').slice(0, 70)}`);
      if (diffs.length) console.log('      ' + diffs.join(' ; '));
    }
  }
  console.log(`\nĐạt ${ok}/${ok + bad} (chỉ tính file có expect)`);
})();
