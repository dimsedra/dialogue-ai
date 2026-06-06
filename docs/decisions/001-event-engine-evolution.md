# Architecture Decision Record (ADR) 001: Event Engine Evolution & Universal UI

**Tanggal**: 17 Mei 2026  
**Status**: Diterapkan (*Implemented / Pending Commit*)  
**Komponen Terkait**: `convex/schema.ts`, `convex/events.ts`, `convex/ai_action.ts`, `src/lib/lmstudio.ts`, `src/components/Chat.tsx`, `src/components/TaskPanel.tsx`

---

## 1. Konteks & Latar Belakang (Rationale)

Dalam arsitektur awal, aplikasi **Dialogue** memandang semua jadwal (*events*) sebagai blok waktu berdurasi yang kaku (*interval / time-blocks* dengan `startTime` dan `endTime` wajib). Namun dalam penggunaan nyata manajemen proyek dan asisten produktivitas, pengguna sering kali memiliki kebutuhan yang berbeda:

1. **Peristiwa Sesaat (*Point-in-Time Events*)**: Pengguna membutuhkan pencatatan tenggat waktu (*deadline*), peluncuran produk (*release / drop*), atau pengingat momen tertentu yang bersifat instan tanpa keharusan mengisi `endTime`.
2. **Fleksibilitas Jadwal Rutin (*Recurring Exceptions*)**: Pengguna dengan jadwal rutin bulanan atau mingguan (misal rapat sinkronisasi setiap Selasa) perlu memindahkan atau mengubah jadwal *hanya untuk satu hari tertentu* (karena bentrok atau libur) tanpa merusak atau mengubah jadwal rutin keseluruhan di minggu-minggu lainnya.
3. **Ergonomi Universal Chat**: Saat memantau seluruh tugas dan jadwal di mode *Universal Chat* (tanpa filter proyek), pengguna kehilangan konteks visual mengenai dari workspace/proyek mana setiap item berasal.

---

## 2. Keputusan Arsitektur & Perubahan Teknis

### A. Evolusi Skema Database (`convex/schema.ts`)

- Mengubah atribut `endTime` pada tabel `events` dari wajib menjadi opsional (`v.optional(v.number())`).
- Menambahkan kolom `eventType: v.optional(v.union(v.literal("interval"), v.literal("point")))` untuk membedakan secara eksplisit tipe kegiatan.
- Menambahkan kolom `seriesId: v.optional(v.id("events"))` untuk menautkan jadwal mandiri hasil modifikasi ke jadwal induk rutinnya.

### B. Mutasi Pengecualian Rutinitas (`convex/events.ts` & `convex/ai_action.ts`)

- **Mutasi `updateOccurrence`**: Membuat logika mutasi khusus untuk modifikasi satu hari. Ketika dipanggil, sistem akan menyisipkan stempel waktu hari tersebut ke dalam *array* `exceptions` pada jadwal induk (sehingga induk melewatinya), lalu membuat satu jadwal baru (anak) dengan `seriesId` menunjuk ke induknya.
- **Penyesuaian `cancelOccurrence` & `remove`**: Menambahkan pembersihan otomatis jika jadwal induk dihapus, seluruh anak turunannya (`seriesId`) juga akan ikut terhapus (*cascade delete*).

### C. Pembaruan Definisi Tool AI (`src/lib/lmstudio.ts`)

- Memperbarui skema `addEvent` dengan parameter `eventType` dan membuat `endTime` opsional.
- Menambahkan fungsi baru `updateEventOccurrence` ke ... (*function calling*) LLM baik lokal maupun Gemini.
- Memperketat instruksi (*critical mandate*) agar AI melakukan konfirmasi percakapan sebelum langsung memanggil *tool*.

### D. Pemolesan Antarmuka Pengguna (`src/components/Chat.tsx` & `src/components/TaskPanel.tsx`)

- **Kartu Respons Tool (*ToolCard*)**: Merancang antarmuka khusus bernuansa *Amber* (emas/jingga) dengan ikon petir (`Zap`) untuk peristiwa *Point-in-Time*, serta tampilan perbandingan waktu sebelum dan sesudah jadwal diubah saat *reschedule*.
- **Indikator Workspace Universal**: Menambahkan lencana (*badge*) teks dengan warna khas workspace di atas kartu tugas dan jadwal pada mode *Universal Chat* agar identitas proyek langsung terlihat jelas.
- **Koreksi Teks Kasus**: Menghapus kelas `uppercase` statis pada kartu jadwal agar aplikasi menghormati penulisan huruf besar-kecil alami dari pengguna.

---

## 3. Konsekuensi & Bukti Uji (Trade-offs & Verification)

- **Kelebihan**: AI kini jauh lebih cerdas dalam memanipulasi kalender rutin layaknya asisten manusia sungguhan. Basis kode tetap bersih dan tidak ada penumpukan entitas duplikat di basis data kalender.
- **Kompilasi**: Lolos verifikasi `npx tsc --noEmit` tanpa ada peringatan atau kesalahan tipe data.
- **Referensi Commit**:
  1. Komit [a1c4ad7](https://github.com/dimsedra/dialogue-ai/commit/a1c4ad7) (`feat: Event Engine Evolution`).
  2. Komit [c7b5689](https://github.com/dimsedra/dialogue-ai/commit/c7b5689) (`refactor: remove redundant utility file`).
