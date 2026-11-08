# Aplikasi Absensi Wajah LPK Rapindo

Paket acuan pembangunan aplikasi produksi, bukan aplikasi yang sudah diimplementasikan.
Target awal: 35 peserta pelatihan selama 6 hari. Frontend dikerjakan lebih dahulu;
sistem akhir mencakup backend, verifikasi wajah, enrollment, administrasi, dan operasional.

## Mulai di Codex desktop
1. Ekstrak paket dan buka folder `absensi-rapindo` sebagai folder proyek.
2. Baca `AGENTS.md` dan `docs/INDEX.md`.
3. Salin isi `prompts/00-prompt-pembuka.md` ke percakapan Codex.
4. Jalankan prompt bernomor sesuai tahap; satu tahap per tugas, tinjau hasil dan pengujiannya.
5. Jangan meminta semua tahap sekaligus. Simpan perubahan ke Git secara bertahap.

Fondasi frontend, `package.json`, dan dependency lockfile sudah tersedia. Backend, image Docker,
dan deployment nyata belum dibuat.
Paket tidak menyertakan data biometrik, kredensial, model pretrained, atau PoC yang belum diberikan.

## Menjalankan fondasi frontend

Fondasi frontend memerlukan Node.js `>=20.18.0 <21` atau `>=22.12.0` dan npm. Versi yang
dipakai saat scaffolding adalah Node.js 20.18.0 dan npm 10.9.0. Di PowerShell:

```powershell
npm ci
npm run dev
```

Salin `.env.example` menjadi `.env.development.local` hanya bila perlu mengubah konfigurasi
publik lokal. `VITE_DATA_SOURCE=mock` hanya boleh untuk development/test dan selalu ditampilkan
sebagai mode simulasi. Build production menolak nilai tersebut.

Pemeriksaan lokal:

```powershell
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
npm run preview
```

Dependency inti yang terkunci pada fondasi: React 19.3.1, React Router 7.18.5, Vite 6.4.5,
TypeScript 5.9.3, Vitest 4.1.12, ESLint 9.39.5, dan Prettier 3.9.10. Vite terbaru tidak dipakai
karena Node.js lokal 20.18.0 belum memenuhi minimum 20.19. Upgrade dependency mayor harus
didahului review kompatibilitas dan pengujian.

Rujukan kompatibilitas: [panduan Vite](https://vite.dev/guide/),
[panduan Vitest](https://vitest.dev/guide/), dan
[instalasi declarative React Router](https://reactrouter.com/start/declarative/installation).

## Susunan
- `AGENTS.md`: aturan kerja agent dalam repository.
- `docs/`: kebutuhan, arsitektur, desain, pengujian, keamanan, operasional, dan progres.
- `references/originals/`: empat Markdown asli dan PDF arsitektur; arsip, jangan diedit.
- `references/visual/`: empat gambar visual asli, nama dinormalisasi.
- `prompts/`: prompt pembuka, implementasi frontend, integrasi, dan tahap sistem berikutnya.
- `.env.example`: contoh konfigurasi publik frontend, tanpa rahasia.

## Struktur kode saat implementasi
Kode frontend tetap di root: `src/`, `public/`, `tests/`, konfigurasi Vite dan TypeScript.
Backend kelak di `backend/`; deployment di `deploy/`. Satu repo tanpa workspace/monorepo tooling.
Lihat `docs/architecture/frontend.md` untuk struktur rincinya.

## Batas kesiapan
Mock hanya untuk development/test dan ditandai jelas. Tidak ada fallback mock di produksi.
Production belum siap sampai G1, G2, kontrak API, keamanan, uji perangkat, restore backup,
pilot, dan keputusan operasional selesai. Checklist belum dicentang karena belum ada implementasi.
