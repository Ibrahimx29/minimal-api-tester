# Panduan Build & Release

#Tets

Dokumen template langkah-demi-langkah untuk proses build, update versi, dan publish ke GitHub.
Cocok untuk semua project yang mengikuti konvensi berikut:

- Semantic Versioning via git tag (`v1.2.0`, `v1.2.1`, ...).
- Versi tertanam di kode (`<MODULE_PATH>/version`), di-override via ldflags saat build.
- `go-winres` untuk Windows version resource (ikon + File/Product version dari git tag).

**Placeholder yang perlu diganti sesuai project masing-masing:**

| Placeholder     | Contoh           | Arti                                       |
| --------------- | ---------------- | ------------------------------------------ |
| `<APP_NAME>`    | `mw-jiipe-tvms`  | Nama aplikasi / output exe                 |
| `<MODULE_PATH>` | `mw-jiipe-tvms`  | Go module path (dari `go.mod`)             |
| `<BRANCH>`      | `stable`, `main` | Nama branch release aktif (hanya konvensi) |
| `<VERSION>`     | `1.2.1`          | Versi baru tanpa awalan `v`                |
| `<TAG>`         | `v1.2.1`         | Versi baru dengan awalan `v`               |
| `<DATE>`        | `2026-09-14`     | Tanggal rilis                              |

Setiap langkah di bawah selalu disertai **Contoh** — gunakan placeholder saat
menyalin ke project lain, dan teladani "Contoh" bila project yang dimaksud adalah
`mw-jiipe-tvms`.

---

## 0. Prasyarat

- Go terinstal (lihat `go.mod`).
- `go-winres` terinstal (dibutuhkan `go generate`):
  ```bash
  go install github.com/tc-hib/go-winres@latest
  ```
- Git berada di branch release yang aktif (mis. `stable` atau `main`) dan bekerja pada repo ini.

**Contoh:**

```bash
go install github.com/tc-hib/go-winres@latest
git branch --show-current   # menghasilkan "stable"
```

---

## 1. Cek status repository

Pastikan tidak ada konflik dan lihat riwayat commit:

```bash
git status
git log --oneline -10
```

Periksa file pembawa versi:

- `CHANGELOG.md` — catatan rilis per versi.
- `version/version.go` — variabel `Version`/`Commit` (diisi lewat ldflags saat build).

**Contoh:**

```bash
git status                # "On branch stable ... nothing to commit"
git log --oneline -10
```

```
8e32d8b fix: gate cache filter; chore: bump version to 1.2.2
6f5c9a1 fix: close connection if gate not found
e6f7c40 chore: add RELEASE.md
```

## 2. Cek tag terbaru

```bash
git tag --list --sort=-v:refname   # urut dari terbaru
git describe --tags                # tag yang sedang di-point oleh HEAD
```

**Contoh:** tag terbaru adalah `v1.2.0`, jadi HEAD = `v1.2.0`.

```bash
$ git tag --list --sort=-v:refname
v1.2.0
v1.1.0
v1.0.0

$ git describe --tags
v1.2.0
```

## 3. Review perubahan yang belum di-commit

```bash
git diff              # lihat seluruh perubahan
git diff --stat       # ringkasan file yang berubah
```

Catat perubahan ini untuk ditulis ke `CHANGELOG.md` (file mana saja dan apa perubahannya).

**Contoh:**

```bash
$ git diff --stat
 handlers/gate_cache.go | 3 +-
 handlers/resp_handler.go | 5 +++
 winres/winres.json      | 2 +-
```

## 4. Tentukan versi baru

Aturan praktis:

- Perbaikan bug saja → **patch** (contoh `1.2.0` → `1.2.1`).
- Fitur baru → **minor** (`1.2.0` → `1.3.0`).

Pastikan `winres/winres.json` (bila ada) juga sudah memakai versi baru, dengan mengubah
`fixed.file_version`, `fixed.product_version`, `info.FileVersion`, dan `info.ProductVersion`.

**Contoh:** semua perubahan bersifat `fix`, jadi versi baru = patch `1.2.1`.
`winres/winres.json` diubah menjadi `1.2.1.0` / `1.2.1`.

## 5. Update `CHANGELOG.md`

Tambahkan entry baru **di atas** versi sebelumnya, ikuti format
[Keep a Changelog](https://keepachangelog.com/id-ID/1.1.0/):

```markdown
## [<VERSION>] - <DATE>

### Added

- ...

### Fixed

- ...
```

**Contoh:**

```markdown
## [1.2.1] - 2026-09-14

### Fixed

- Revalidasi RFID saat resume dari state DATA_VALIDATION.
- Gate cache hanya memuat gate aktif (m_gate.stats = 'A').
```

## 6. Commit perubahan

```bash
git add -A
git commit -m "<type>: <ringkasan perubahan>; chore: bump version to <VERSION>"
```

> Pastikan perubahannya dikelompokkan rapi dan tidak ada secret/`.env` yang ikut ter-commit
> (`.env` dan `*.exe` perlu dimasukkan ke `.gitignore`).

**Contoh:**

```bash
git add -A
git commit -m "fix: gate cache filter; chore: bump version to 1.2.1"
```

## 7. Buat tag versi (SEBELUM `go generate`)

Tag harus dibuat lebih dulu agar `go-winres` (dengan mode `git-tag`) membaca versi yang benar:

```bash
git tag -a <TAG> -m "<TAG>: <deskripsi singkat>"
git describe --tags     # verifikasi: harus menampilkan <TAG>
```

**Contoh:**

```bash
git tag -a v1.2.1 -m "v1.2.1: fix gate cache dan revalidasi RFID"
git describe --tags     # menghasilkan "v1.2.1"
```

## 8. Regenerasi Windows version resource

Berdasarkan directive di `main.go`:

```go
//go:generate go-winres make --arch amd64 --product-version=git-tag --file-version=git-tag
```

Jalankan:

```bash
go generate ./...
```

Hasilnya menghasilkan `rsrc_windows_amd64.syso` (file ini **gitignored**). Versi
File/Product di Properties exe diambil otomatis dari tag git terbaru.

Verifikasi cepat (tidak ada perubahan git lain yang tak diinginkan):

```bash
git status --short
```

**Contoh:**

```bash
$ go generate ./...
go-winres: v0.3.3
go-winres: work directory: winres

$ git status --short    # hanya file yang sengaja diubah (rsrc_*.syso tidak muncul, gitignored)
```

## 9. Build exe dengan ldflags

Agar `version.Version` dan `version.Commit` terisi (bukan "dev"), set ldflags.
Tambahkan `-trimpath` dan `-s -w` untuk memperkecil ukuran exe:

```bash
$ver    = (git describe --tags --abbrev=0)
$commit = (git rev-parse --short HEAD)

go build -trimpath -ldflags "-s -w -X <MODULE_PATH>/version.Version=$ver -X <MODULE_PATH>/version.Commit=$commit" -o <APP_NAME>.exe .
```

> Catatan: `build.sh` (bila ada) mungkin menyediakan cara build + zip dengan
> `-trimpath -s -w` tapi tanpa ldflags (versi tertanam = "dev"). Untuk rilis resmi
> gunakan ldflags seperti di atas.

**Contoh:**

```powershell
$ver    = (git describe --tags --abbrev=0)   # v1.2.1
$commit = (git rev-parse --short HEAD)       # d4d7ef9

go build -trimpath -ldflags "-s -w -X mw-jiipe-tvms/version.Version=$ver -X mw-jiipe-tvms/version.Commit=$commit" -o mw-jiipe-tvms.exe .
```

## 10. Verifikasi hasil build

Cek exe terbentuk dan membawa versi yang benar:

```powershell
Get-ChildItem <APP_NAME>.exe | Select-Object Name, Length, LastWriteTime,
  @{N='VersionInfo';E={$_.VersionInfo.FileVersion}}
```

Hasil yang diharapkan: `VersionInfo = <TAG>`.

**Contoh:**

```powershell
$ Get-ChildItem mw-jiipe-tvms.exe | Select-Object Name, Length, LastWriteTime, @{N='VersionInfo';E={$_.VersionInfo.FileVersion}}

Name             Length LastWriteTime       VersionInfo
----             ------ -------------       -----------
mw-jiipe-tvms.exe 15722496 15/09/2026 09:04:58 v1.2.1
```

Hasil yang diharapkan: `VersionInfo = v1.2.1`.

## 11. Push ke GitHub

Push branch dan tag ke remote `origin`:

```bash
git status -sb          # pastikan "ahead 1" dan tidak ada file tertinggal
git remote -v           # pastikan URL origin benar

git push origin <BRANCH>
git push origin <TAG>
```

Output sukses:

```
e6f7c40..d4d7ef9  <BRANCH> -> <BRANCH>
* [new tag]         <TAG> -> <TAG>
```

**Contoh:**

```bash
git status -sb          # "## stable...origin/stable [ahead 1]"
git remote -v           # origin https://github.com/<user>/mw-jiipe-tvms.git

git push origin stable
git push origin v1.2.1
```

```
e6f7c40..d4d7ef9  stable -> stable
* [new tag]         v1.2.1 -> v1.2.1
```

---

## Urutan yang tidak boleh terbalik

1. Update `CHANGELOG.md` + `winres/winres.json` → commit.
2. Buat **tag** dulu, baru `go generate` (agar versi resource = tag terbaru).
3. `go generate` dulu, baru `go build` (agar `.syso` ter-link ke exe).
4. Push branch dan tag bersamaan agar tag tidak mengarah ke commit yang belum ter-upload.
