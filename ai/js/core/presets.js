// Mẫu ngành cho tab định giá — rút từ sheet 19.Playbook của model elevaTO: mỗi loại hình doanh nghiệp dự phóng
// doanh thu theo một ĐỘNG LỰC KINH TẾ riêng và ưu tiên phương pháp định giá khác nhau. Chọn mẫu chỉ đặt GỢI Ý
// ban đầu (cách dự phóng doanh thu, phương pháp giá trị cuối kỳ, trọng số giá mục tiêu); người dùng sửa tiếp được
// mọi thứ. Câu chữ (tên, cách dự phóng, bẫy hay gặp) ở i18n: preset.<id>.name / .rev / .val / .trap.

export const PRESETS = [
  { id: 'general', revMode: 'growth', tvMethod: 'gordon', weights: { dcf: 50, pe: 25, evEbitda: 15, pb: 10, evRev: 0 } },
  { id: 'distribution', revMode: 'growth', tvMethod: 'gordon', weights: { dcf: 50, pe: 25, evEbitda: 10, pb: 5, evRev: 10 } },
  { id: 'retail', revMode: 'stores', tvMethod: 'gordon', weights: { dcf: 45, pe: 25, evEbitda: 25, pb: 5, evRev: 0 } },
  { id: 'manufacturing', revMode: 'volprice', tvMethod: 'blend', weights: { dcf: 40, pe: 15, evEbitda: 30, pb: 15, evRev: 0 } },
  { id: 'consumer', revMode: 'volprice', tvMethod: 'gordon', weights: { dcf: 50, pe: 25, evEbitda: 20, pb: 5, evRev: 0 } },
  { id: 'utilities', revMode: 'volprice', tvMethod: 'gordon', weights: { dcf: 70, pe: 10, evEbitda: 20, pb: 0, evRev: 0 } },
  { id: 'tech', revMode: 'growth', tvMethod: 'exit', weights: { dcf: 50, pe: 15, evEbitda: 20, pb: 0, evRev: 15 } },
  { id: 'construction', revMode: 'growth', tvMethod: 'gordon', weights: { dcf: 30, pe: 20, evEbitda: 25, pb: 25, evRev: 0 } },
  { id: 'realestate', revMode: 'manual', tvMethod: 'gordon', weights: { dcf: 30, pe: 10, evEbitda: 0, pb: 60, evRev: 0 } },
  { id: 'bank', revMode: 'growth', tvMethod: 'gordon', weights: { dcf: 0, pe: 30, evEbitda: 0, pb: 70, evRev: 0 } },
];

export const presetOf = (id) => PRESETS.find((p) => p.id === id) || null;

/** Thông số mới khi áp một mẫu ngành: giữ nguyên số liệu người dùng đã nhập, chỉ đổi cách làm và trọng số. */
export function applyPreset(val, id) {
  const p = presetOf(id);
  if (!p) return val;
  return { ...val, preset: id, revMode: p.revMode, tvMethod: p.tvMethod, weights: { ...p.weights } };
}
