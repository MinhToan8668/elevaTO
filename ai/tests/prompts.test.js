import { test } from 'node:test';
import assert from 'node:assert/strict';
import { statementTask, NOTE_TASKS, pageMapTask, SYSTEM } from '../js/core/prompts.js';

const TYPES = new Set(['OBJECT', 'ARRAY', 'STRING', 'INTEGER', 'NUMBER', 'BOOLEAN']);
function check(schema, path = '$') {
  assert.ok(TYPES.has(schema.type), `${path}: kiểu lạ ${schema.type}`);
  if (schema.type === 'OBJECT') {
    assert.ok(schema.properties && Object.keys(schema.properties).length, `${path}: object rỗng`);
    for (const r of schema.required || []) assert.ok(r in schema.properties, `${path}: required "${r}" không có trong properties`);
    for (const [k, v] of Object.entries(schema.properties)) check(v, `${path}.${k}`);
  }
  if (schema.type === 'ARRAY') check(schema.items, `${path}[]`);
  if (schema.enum) assert.ok(schema.type === 'STRING' && schema.enum.every((x) => typeof x === 'string'), `${path}: enum phải là chuỗi`);
}

test('khuôn JSON hợp lệ cho mọi việc (Gemini từ chối cả yêu cầu nếu khuôn sai)', () => {
  for (const st of ['BS', 'IS', 'CF']) check(statementTask(st).schema, st);
  for (const [k, t] of Object.entries(NOTE_TASKS)) { check(t.schema, k); assert.ok(t.prompt.length > 50 && t.label); }
  check(pageMapTask(1).schema, 'pagemap');
});

test('số liệu luôn là chuỗi chép nguyên văn, không phải số (tránh AI tự làm tròn / đổi đơn vị)', () => {
  const item = statementTask('BS').schema.properties.items.items.properties;
  assert.equal(item.v.type, 'STRING'); assert.equal(item.p.type, 'STRING');
  assert.match(SYSTEM, /NGUYÊN VĂN/); assert.match(SYSTEM, /không đổi đơn vị/);
});

test('chia đôi CĐKT: phần tài sản / nguồn vốn có chỉ dẫn riêng; KQKD giữa niên độ lấy cột lũy kế', () => {
  assert.match(statementTask('BS', 'assets').prompt, /CHỈ lấy phần TÀI SẢN/);
  assert.match(statementTask('BS', 'sources').prompt, /CHỈ lấy phần NGUỒN VỐN/);
  assert.doesNotMatch(statementTask('BS').prompt, /CHỈ lấy/);
  assert.match(statementTask('IS').prompt, /LẤY CỘT LŨY KẾ/);
  assert.match(statementTask('CF').prompt, /truc_tiep/);
});
