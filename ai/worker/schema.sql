-- Lược đồ D1 của máy chủ elevaTO AI BCTC. Chạy lại bao nhiêu lần cũng được (IF NOT EXISTS).
-- Thay cho Google Sheet "TaiKhoan" và Script Properties của bản Apps Script cũ.

CREATE TABLE IF NOT EXISTS tai_khoan (
  ma           TEXT PRIMARY KEY,          -- E + 5 ký tự, dùng cho nút bấm trên Telegram
  email        TEXT NOT NULL,
  khoa_email   TEXT NOT NULL UNIQUE,      -- email đã bỏ dấu chấm / +nhãn của Gmail, dùng để so trùng
  ten          TEXT NOT NULL,
  sdt          TEXT NOT NULL,
  mat_khau     TEXT NOT NULL,             -- pbkdf2$<số vòng>$<muối hex>$<băm hex>
  vaitro       TEXT NOT NULL DEFAULT 'free',    -- free | hv | gv
  trangthai    TEXT NOT NULL DEFAULT 'active',  -- active | cho | off
  luot_ngay    INTEGER NOT NULL DEFAULT 0,      -- 0 = theo vai trò
  tuoi         INTEGER,
  nghe_nghiep  TEXT,
  muc_dich     TEXT,
  tao_luc      TEXT NOT NULL,
  dangnhap_cuoi TEXT
);
CREATE INDEX IF NOT EXISTS tk_tao_luc ON tai_khoan (tao_luc);

-- Phiên đăng nhập. Chỉ lưu BĂM của token: lộ cơ sở dữ liệu cũng không đăng nhập hộ được.
CREATE TABLE IF NOT EXISTS phien (
  bam      TEXT PRIMARY KEY,
  ma       TEXT NOT NULL REFERENCES tai_khoan(ma) ON DELETE CASCADE,
  tao_luc  INTEGER NOT NULL,
  het_luc  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS phien_ma ON phien (ma, tao_luc);

-- Bộ đếm có hạn dùng: lượt AI mỗi ngày, nhịp mỗi phút, số lần đăng nhập sai, số tài khoản mới mỗi giờ.
-- Gộp một bảng vì cách dùng y hệt nhau, chỉ khác khoá và thời hạn.
CREATE TABLE IF NOT EXISTS dem (
  khoa    TEXT PRIMARY KEY,
  so      INTEGER NOT NULL,
  het_luc INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS dem_het_luc ON dem (het_luc);

-- Cài đặt chạy được sửa lúc đang chạy (thông tin ủng hộ, model riêng, hạn lượt…) và các giá trị
-- nhớ tạm có hạn (danh sách model Gemini, key / model đang nghỉ, mã đặt lại mật khẩu).
CREATE TABLE IF NOT EXISTS cai_dat (
  khoa    TEXT PRIMARY KEY,
  gia_tri TEXT NOT NULL,
  het_luc INTEGER NOT NULL DEFAULT 0      -- 0 = không hết hạn
);

-- Đăng ký khoá học (thay sheet "DangKy" của bản Apps Script).
CREATE TABLE IF NOT EXISTS dang_ky (
  id         TEXT PRIMARY KEY,          -- R + yyMMddHHmmss
  tao_luc    TEXT NOT NULL,             -- dd/MM/yyyy HH:mm giờ Việt Nam, để đọc cho người
  cohort     TEXT NOT NULL,             -- "Cohort 07"
  ten        TEXT NOT NULL,
  sdt        TEXT NOT NULL,
  sdt_so     TEXT NOT NULL,             -- số điện thoại chỉ còn chữ số, để so trùng
  nam        TEXT, email TEXT, nghe TEXT, muc_tieu TEXT,
  nguon      TEXT,                      -- web | web-tuhoc …
  trang_thai TEXT NOT NULL DEFAULT 'pending',   -- pending | confirmed | rejected
  ghi_chu    TEXT
);
CREATE INDEX IF NOT EXISTS dk_cohort ON dang_ky (cohort, trang_thai);
CREATE INDEX IF NOT EXISTS dk_sdt ON dang_ky (sdt_so);
CREATE INDEX IF NOT EXISTS dk_tao_luc ON dang_ky (tao_luc);
