// Công cụ upload phải từ chối cài vào dự án backend trang khoá học (dán nhầm là trang khoá học chết hẳn).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const PATH = new URL('../backend/Code.gs', import.meta.url).pathname;

function load(props) {
  const ctx = {
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props[k] ?? null, setProperty: (k, v) => { props[k] = String(v); } }) },
    ContentService: { createTextOutput: (t) => ({ setMimeType: () => t }), MimeType: { JSON: 'json' } },
    Logger: { log: () => {} },
    console: { error: () => {} },
  };
  vm.createContext(ctx);
  vm.runInContext(readFileSync(PATH, 'utf8'), ctx, { filename: PATH });
  return ctx;
}

test('cài vào dự án đã có cấu hình trang khoá học → dừng ngay, không đụng gì', () => {
  for (const props of [{ SITE_CONFIG: '{}' }, { TG_ADMIN_IDS: '123' }]) {
    const before = JSON.stringify(props);
    const ctx = load(props);
    assert.throws(() => ctx.caiDat(), /TRANG KHOÁ HỌC/);
    assert.equal(JSON.stringify(props), before);
  }
});

test('dự án mới (trống) → đi tiếp tới bước kiểm tra 3 dòng đầu file như cũ', () => {
  const ctx = load({});
  assert.throws(() => ctx.caiDat(), /Chưa điền TG_TOKEN/);
});
