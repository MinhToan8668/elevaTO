#!/usr/bin/env python3
"""Lấy bảng mã ngân hàng (BIN) của NAPAS → in ra khối `var BANK = {…}` cho backend/Code.gs.

Sai một chữ số BIN là người ủng hộ quét mã QR không ra tài khoản nào, mà bot lại đáp lại
tên ngân hàng lấy từ CHÍNH dòng sai đó nên quản trị không nhận ra. Vì vậy đừng gõ tay bảng
này: chạy lại script rồi dán đè khối `var BANK` trong backend/Code.gs.

    python3 tools/banks.py          # lấy từ mạng
    python3 tools/banks.py banks.json

Khoá là mã ngắn chính thức viết thường, cộng vài tên gọi quen thuộc trong ALIAS.
"""
import datetime
import json
import sys
import textwrap
import urllib.request

NGUON = 'https://api.vietqr.io/v2/banks'
ALIAS = {
    'vietcombank': 'VCB', 'vietinbank': 'ICB', 'ctg': 'ICB', 'agri': 'VBA', 'agribank': 'VBA',
    'techcombank': 'TCB', 'mbbank': 'MB', 'vpbank': 'VPB', 'tpbank': 'TPB', 'sacombank': 'STB',
    'hdbank': 'HDB', 'eximbank': 'EIB', 'seabank': 'SEAB', 'banviet': 'VCCB', 'bvbank': 'VCCB',
    'lienvietpostbank': 'LPB', 'namabank': 'NAB', 'kienlongbank': 'KLB', 'baovietbank': 'BVB',
}


def tai(nguon):
    if nguon:
        return json.load(open(nguon, encoding='utf-8'))
    with urllib.request.urlopen(NGUON, timeout=30) as r:
        return json.load(r)


def khoa(ma):
    """Mã ngắn có mã còn cả khoảng trắng ("IBK - HCM") → rút về chữ và số cho gõ được."""
    return ''.join(c for c in ma.lower() if c.isalnum())


def bang(data):
    theo_ma = {b['code']: b for b in data}
    ra = {khoa(b['code']): (b['bin'], b['shortName']) for b in sorted(data, key=lambda x: x['code'])}
    for a, c in sorted(ALIAS.items()):
        if c in theo_ma and a not in ra:
            ra[a] = (theo_ma[c]['bin'], theo_ma[c]['shortName'])
    return ra


def ra_js(ra, ngay):
    muc = [f"{k}:['{v[0]}','{v[1]}']" for k, v in sorted(ra.items())]
    assert all(k.isalnum() and not k[0].isdigit() for k in ra), 'khoá phải viết được thẳng trong object JS'
    than = '\n'.join('  ' + d for d in textwrap.wrap(', '.join(muc), 112))
    return (
        f'// Mã ngân hàng theo NAPAS để dựng VietQR — SINH TỪ {NGUON} ngày {ngay} (xem tools/banks.py).\n'
        '// Khoá là mã ngắn chính thức (viết thường) cộng vài tên gọi quen thuộc. Quản trị gõ mã ngắn hoặc\n'
        '// 6 chữ số BIN; bot đáp lại tên ngân hàng nhận ra được để đối chiếu. Sai BIN là người ủng hộ quét\n'
        '// QR không được, nên đừng sửa tay bảng này — chạy lại tools/banks.py.\n'
        'var BANK = {\n' + than + '\n};'
    )


if __name__ == '__main__':
    d = tai(sys.argv[1] if len(sys.argv) > 1 else None)
    if d.get('code') != '00' or not d.get('data'):
        sys.exit(f'Nguồn trả về không như mong đợi: {str(d)[:200]}')
    sys.stdout.reconfigure(encoding='utf-8')
    print(ra_js(bang(d['data']), datetime.date.today().isoformat()))
