// D1 giả lập bằng node:sqlite để chạy mã của Worker ngay trong node --test.
// Không phải bản mô phỏng "cho có": SQL chạy thật trên SQLite thật, chỉ khác chỗ lưu (bộ nhớ).

import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

class Lenh {
  constructor(db, sql, args = []) { this.db = db; this.sql = sql; this.args = args; }
  bind(...args) { return new Lenh(this.db, this.sql, args); }
  all() { return Promise.resolve({ results: this.db.prepare(this.sql).all(...this.args), success: true, meta: {} }); }
  async first(cot) {
    const r = (await this.all()).results[0];
    if (!r) return null;
    return cot === undefined ? r : r[cot];
  }
  run() { return Promise.resolve({ success: true, meta: this.db.prepare(this.sql).run(...this.args) }); }
}

/** @returns một binding D1 (prepare / batch) dùng được thẳng cho env.DB */
export function moD1(schemaUrl) {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(schemaUrl, 'utf8'));
  return {
    prepare: (sql) => new Lenh(db, sql),
    batch: (ds) => Promise.all(ds.map((x) => x.run())),
    _sqlite: db,
  };
}

/** env tối thiểu cho Worker: D1 + vài biến. Băm 1 vòng cho bài kiểm tra chạy nhanh. */
export function moEnv(schemaUrl, them = {}) {
  return { DB: moD1(schemaUrl), BAM_VONG: '1', ...them };
}

/** ctx.waitUntil của Workers: gom việc chạy ngầm để bài kiểm tra chờ cho xong. */
export function moCtx() {
  const cho = [];
  return { waitUntil: (p) => cho.push(p), xong: () => Promise.allSettled(cho) };
}
