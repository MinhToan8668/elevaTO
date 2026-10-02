// Tìm (hoặc tạo) cơ sở dữ liệu D1 rồi điền database_id vào wrangler.toml, ngay trước khi triển khai.
//
// Để người cài không phải vào dashboard tạo tay rồi chép ID dán vào file: chạy một lần hay trăm lần
// đều ra cùng kết quả, vì có rồi thì dùng lại chứ không tạo thêm.
//
// Cần CLOUDFLARE_ACCOUNT_ID và CLOUDFLARE_API_TOKEN (token phải có quyền D1 Edit).
// Đã điền sẵn database_id trong wrangler.toml thì script không đụng tới.

import { readFileSync, writeFileSync } from 'node:fs';

const API = 'https://api.cloudflare.com/client/v4';
const CHO_DIEN = 'DAN_DATABASE_ID_VAO_DAY';
const duong = new URL('../wrangler.toml', import.meta.url);

const thoat = (msg) => { console.error(`✘ ${msg}`); process.exit(1); };

function tenDB(toml) {
  const m = /^\s*database_name\s*=\s*"([^"]+)"/m.exec(toml);
  return m ? m[1] : thoat('wrangler.toml không có database_name');
}

async function hoi(duongDan, init) {
  const res = await fetch(`${API}${duongDan}`, {
    ...init,
    headers: { authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`, 'content-type': 'application/json', ...(init || {}).headers },
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok || d.success === false) {
    const vi = (d.errors || []).map((e) => e.message).join('; ') || `HTTP ${res.status}`;
    thoat(`Cloudflare trả lỗi: ${vi}\n  Kiểm tra CLOUDFLARE_API_TOKEN có quyền "D1 Edit" và CLOUDFLARE_ACCOUNT_ID đúng chưa.`);
  }
  return d.result;
}

/** Trả về id của database tên `ten`, tạo mới nếu chưa có. */
async function layId(acc, ten) {
  const co = await hoi(`/accounts/${acc}/d1/database?name=${encodeURIComponent(ten)}`);
  // Lọc theo tên của Cloudflare là lọc "chứa chuỗi", nên so lại tên cho khớp hẳn.
  const dung = (Array.isArray(co) ? co : []).find((x) => x.name === ten);
  if (dung) { console.log(`✔ Đã có cơ sở dữ liệu D1 "${ten}"`); return dung.uuid || dung.id; }
  const moi = await hoi(`/accounts/${acc}/d1/database`, { method: 'POST', body: JSON.stringify({ name: ten }) });
  console.log(`✔ Vừa tạo cơ sở dữ liệu D1 "${ten}"`);
  return moi.uuid || moi.id;
}

const toml = readFileSync(duong, 'utf8');
const ten = tenDB(toml);
const dangCo = /^\s*database_id\s*=\s*"([^"]*)"/m.exec(toml);
if (dangCo && dangCo[1] && dangCo[1] !== CHO_DIEN) {
  console.log(`✔ wrangler.toml đã có database_id sẵn — giữ nguyên`);
  process.exit(0);
}
const acc = process.env.CLOUDFLARE_ACCOUNT_ID;
if (!acc || !process.env.CLOUDFLARE_API_TOKEN) {
  thoat('Thiếu CLOUDFLARE_ACCOUNT_ID hoặc CLOUDFLARE_API_TOKEN.\n'
    + '  Thêm hai secret này trong GitHub: Settings → Secrets and variables → Actions.');
}
const id = await layId(acc, ten);
if (!id) thoat('Cloudflare không trả về id của cơ sở dữ liệu');
writeFileSync(duong, toml.replace(/^(\s*database_id\s*=\s*)"[^"]*"/m, `$1"${id}"`));
console.log(`✔ Đã điền database_id vào wrangler.toml (${id})`);
