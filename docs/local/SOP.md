# Standar Operasional Prosedur (SOP) Kerja Bersama Dialogue AI

Dokumen ini mendefinisikan SOP dan kesepakatan kerja antara USER dan AI Agent dalam pengembangan aplikasi **Dialogue**. Prosedur ini dirancang untuk menjaga integritas arsitektur, kebersihan kode (*clean code*), serta kesinambungan konteks antar-sesi pengembangan.

---

## 🔄 Siklus Kerja 4 Fase

```text
┌────────────────────────────────────────────────────────┐
│              FASE 1: INISIASI (DISKUSI)                │
│  Grounding, penentuan goal, approach, dan trade-off    │
└───────────────────────────┬────────────────────────────┘
                            ▼
┌────────────────────────────────────────────────────────┐
│             FASE 2: IMPLEMENTASI (KODE)                │
│    Penulisan kode bersih, patuh pada arsitektur        │
└───────────────────────────┬────────────────────────────┘
                            ▼
┌────────────────────────────────────────────────────────┐
│             FASE 3: PENUTUP (DOKUMENTASI)              │
│  Pencatatan Architecture Decision Record (ADR / .md)   │
└───────────────────────────┬────────────────────────────┘
                            ▼
┌────────────────────────────────────────────────────────┐
│             FASE 4: LOOPING (SESI BERIKUTNYA)          │
│ Pembacaan ulang dokumen .md di awal sesi oleh AI Agent │
└────────────────────────────────────────────────────────┘
```

### 1. Fase Inisiasi (Diskusi)

- **Aturan Baku**: Sebelum menyentuh, mengubah, atau menulis baris kode apa pun, AI Agent dan USER wajib berdiskusi untuk menyepakati *goal* (tujuan), *approach* (pendekatan teknis), dan *trade-off* (konsekuensi arsitektural).
- **Grounding**: AI Agent wajib melakukan pemindaian (*scanning*) pada berkas atau folder terkait untuk mendapatkan pemahaman mendalam tentang kondisi aktual sistem.

### 2. Fase Implementasi

- **Eksekusi**: AI Agent mengerjakan tugas dengan presisi tinggi.
- **Standar Kualitas**: Kode yang ditulis harus bersih (*clean code*), patuh pada tipe data TypeScript/Convex, dan selaras dengan pola desain UI premium yang ada di dalam aplikasi.

### 3. Fase Penutup (Dokumentasi Otomatis)

- **Pencatatan Keputusan**: Begitu sebuah fitur atau pembaruan besar selesai, AI Agent wajib secara otomatis membuat atau memperbarui berkas `.md` di dalam folder `docs/decisions/` (Architecture Decision Records) atau `docs/future-impl/`.
- **Isi Catatan**: Dokumen tidak sekadar mencatat "apa yang berubah", melainkan berfokus pada "kenapa kita memilih jalan ini (*rationale*)", pertimbangan UX/Performa, dan tautan ke *commit* terkait.

### 4. Looping (Kesinambungan Antar-Sesi)

- **Konteks Memori**: Di awal sesi kerja berikutnya, sebelum memulai pekerjaan baru, AI Agent wajib membaca berkas-berkas dokumentasi di folder `docs/` ini.
- **Efisiensi**: Hal ini memastikan *context window* AI Agent selalu mutakhir dengan pemikiran arsitektural terkini tanpa mengharuskan USER mengulang penjelasan atau melakukan *scrolling* panjang pada riwayat obrolan.

---

## 📁 Struktur Direktori Dokumentasi (`/docs`)

```text
/docs
 ├── SOP.md                  # Aturan dan standar kerja utama (berkas ini)
 ├── decisions/              # Architecture Decision Records (ADR) untuk fitur yang telah selesai
 └── future-impl/            # Spesifikasi teknis dan peta jalan untuk fitur mendatang
```
