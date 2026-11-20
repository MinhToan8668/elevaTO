// Nạp phần <script> của tienich/index.html vào một DOM giả để test các hàm thuần (không cần trình duyệt).
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const HTML = readFileSync(new URL('../tienich/index.html', import.meta.url), 'utf8');
export function loadApp(table = null) {
  const els = {};
  const el = (id) => els[id] || (els[id] = {
    id, value: '', textContent: '', innerHTML: '', style: {}, dataset: {}, checked: false,
    addEventListener() {}, appendChild() {}, focus() {}, select() {}, querySelectorAll: () => [],
    classList: { add() {}, remove() {}, toggle() {} },
  });
  const store = {}; if (table) store.tk_table = JSON.stringify(table);
  const ctx = {
    document: { getElementById: el, createElement: () => ({}), addEventListener() {}, querySelectorAll: () => [] },
    localStorage: { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
    navigator: {}, alert() {}, confirm: () => true, setTimeout, console, Date, Math, JSON, Number, String, Intl,
  };
  vm.createContext(ctx);
  const js = HTML.split('<script>')[1].split('</script>')[0];
  vm.runInContext(js + '\n;globalThis.__api={docTien,parseAmt,fmt,calc,fromDays,parseHol,lamViec,nghi,ngayTraLaiDau,setNF:(v)=>{NF=v},applyHol,iso,pd};', ctx);
  return { api: ctx.__api, el };
}
