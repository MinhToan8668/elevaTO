# Quy ước làm việc cho Claude

- Làm xong một thay đổi (đã chạy test liên quan) thì **tự đẩy lên nhánh đang làm, tạo PR vào `main` và merge luôn**
  — chủ repo đã đồng ý cho làm vậy với mọi lần sau, không cần hỏi lại. Trang chạy từ `main` (GitHub Pages).
- Trước khi tạo PR: đưa nhánh lên bản `main` mới nhất (merge `origin/main`), chạy lại test của phần đã sửa.
- Không merge khi test của phần đã sửa còn đỏ; khi đó báo lại cho chủ repo thay vì merge.
- App AI BCTC ở `ai/`: test unit `cd ai && node --test tests/*.test.js`, test trình duyệt
  `cd ai && node --test --test-concurrency=1 tests/e2e/app.e2e.js`.
- Tool Bảng kê giải ngân ở `bangke/` (1 file `index.html`): test unit `cd bangke && node --test tests/*.test.js`,
  test trình duyệt `cd bangke && node --test --test-concurrency=1 tests/e2e/app.e2e.js`.
- Tiện ích giải ngân ở `giaingan/` (TestKey / đáo hạn / số tiền bằng chữ + module VBA): test `cd giaingan && npm test`,
  test trình duyệt `cd giaingan && npm run e2e`. Repo công khai: KHÔNG đưa bảng key TestKey thật, file Excel hay số liệu khách hàng vào đây.
