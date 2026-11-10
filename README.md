# Absensi Wajah LPK Rapindo

Aplikasi absensi wajah berbasis web untuk enrollment peserta, verifikasi kehadiran,
pengelolaan sesi, rekap, ekspor Excel/PDF, dan audit aktivitas.

## Teknologi

- Frontend: React, TypeScript strict, Vite, React Router, CSS Modules, dan PWA.
- Backend: FastAPI, SQLAlchemy, Alembic, PostgreSQL, YuNet, SFace, dan Silent-Face.
- Pengujian: Vitest, Testing Library, Playwright, Pytest, dan Ruff.

## Persyaratan lokal

- Node.js `>=20.18.0 <21` atau `>=22.12.0` dan npm.
- Python `>=3.12,<3.13`.
- PostgreSQL dengan database development dan database test terpisah.
- Model biometrik sesuai checksum pada `backend/model-manifest.json`. Bobot model tidak
  disimpan di Git.

## Menjalankan frontend

```powershell
npm ci
Copy-Item .env.example .env.development.local
npm run dev
```

Vite meneruskan `/api` ke backend lokal pada `http://127.0.0.1:8000`.

## Menjalankan backend

```powershell
cd backend
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -e ".[dev,biometrics]"
Copy-Item .env.example .env
# Isi nilai rahasia dan koneksi database hanya di backend/.env.
alembic upgrade head
uvicorn app.main:app --host 127.0.0.1 --port 8000
```

`backend/.env` tidak boleh dimasukkan ke Git. Mode produksi menolak konfigurasi rahasia,
consent, origin, payload limit, dan biometrik yang tidak lengkap.

## Bootstrap admin dan TOTP

```powershell
cd backend
$env:ADMIN_BOOTSTRAP_USERNAME = 'nama-admin'
python -m app.bootstrap
Remove-Item Env:ADMIN_BOOTSTRAP_USERNAME
```

Kata sandi diminta secara tersembunyi. Simpan secret/QR TOTP yang ditampilkan satu kali ke
aplikasi autentikator. Untuk rotasi TOTP akun yang sudah ada:

```powershell
$env:ADMIN_TOTP_USERNAME = 'nama-admin'
python -m app.provision_totp
Remove-Item Env:ADMIN_TOTP_USERNAME
```

## Pemeriksaan frontend

```powershell
npm run format:check
npm run lint
npm run typecheck
npm test -- --run
npm run build
```

## Pemeriksaan backend

Database test wajib PostgreSQL dan namanya harus berakhiran `_test`. Test akan membuat dan
menghapus seluruh tabel pada database tersebut.

```powershell
cd backend
$env:TEST_DATABASE_URL = 'postgresql+psycopg://USER:PASSWORD@127.0.0.1:5432/absensi_test'
.\.venv\Scripts\python.exe -m ruff check app tests
.\.venv\Scripts\python.exe -m pytest -q
Remove-Item Env:TEST_DATABASE_URL
```

## Retensi bukti

Pemeriksaan jumlah bukti kedaluwarsa berjalan tanpa penghapusan secara default:

```powershell
cd backend
python -m app.purge_retention
$env:PURGE_CONFIRM = 'DELETE_EXPIRED_EVIDENCE'
python -m app.purge_retention
Remove-Item Env:PURGE_CONFIRM
```

Jalankan penghapusan hanya setelah kebijakan retensi dan backup diverifikasi.

## Batas keamanan repository

- Jangan commit `.env`, kredensial, private key, dump database, log, bukti wajah, model,
  hasil ekspor, atau data peserta.
- Folder `backend/models` dan `backend/data` hanya lokal/deployment.
- Frontend selalu menggunakan API; fixture sintetis hanya berada di test.
- Foto/frame tidak disimpan di browser dan API privat menggunakan `Cache-Control: no-store`.

## Deployment

Target produksi menggunakan HTTPS, PostgreSQL, backend FastAPI, serta frontend statis dalam
satu origin. Siapkan secret produksi, model terverifikasi, migrasi, backup/restore, monitoring,
dan uji staging HP sebelum membuka akses produksi.
