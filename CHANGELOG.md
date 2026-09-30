# Changelog

Perubahan penting pada aplikasi ini dicatat di sini. Versi mengikuti Semantic Versioning.

## [1.1.0] - 2026-09-30

### Added

- Import Postman Collection JSON melalui tombol upload pada sidebar Collections.
- Dukungan folder bertingkat, substitusi variabel collection, autentikasi umum, serta laporan fitur yang perlu ditinjau setelah import.
- Timeout request dapat diatur dan disimpan per request (1 sampai 3600 detik; default 30 detik).

## [1.0.1] - 2026-09-30

### Added

- Pengujian backend untuk respons HTTP dan penyimpanan collection.
- Pengujian UI untuk parameter URL, penyimpanan request, Basic Auth, dan respons kosong.

### Fixed

- Parameter URL tidak lagi hilang saat request dikirim atau disimpan.
- Save memperbarui request aktif tanpa membuat duplikat.
- Error penyimpanan dan pembacaan collection ditampilkan; penulisan file memakai file sementara.
- Error pembacaan respons dan respons di atas 10 MB dilaporkan dengan jelas.
- Basic Auth menangani Unicode dan password yang berisi titik dua.
- Respons kosong tidak lagi menampilkan status menunggu.
- Windows FileVersion dan ProductVersion mengikuti versi build.
