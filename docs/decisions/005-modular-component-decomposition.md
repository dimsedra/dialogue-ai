# Architecture Decision Record (ADR) 005: Dekomposisi Komponen Modular & Isolasi Performa Frontend

**Tanggal**: 18 Mei 2026  
**Status**: Diterapkan (*Implemented*)  
**Komponen Terkait**: `src/components/Chat.tsx`, `src/components/TaskPanel.tsx`, `src/components/chat/*`, `src/components/panel/*`

---

## 1. Konteks & Latar Belakang (Rationale)

Pada inkarnasi awal, antarmuka utama aplikasi **Dialogue** dibangun di atas dua komponen monolitik berskala besar:

1. **`Chat.tsx` (2.091 baris)**: Menangani seluruh area percakapan mulai dari *workspace rail*, *sidebar* sesi percakapan, *header* chat, daftar pesan dengan *rendering markdown* dan penyorotan sintaks (*syntax highlighting*), *input bar*, hingga modal manajemen *workspace* dan penghapusan sesi.
2. **`TaskPanel.tsx` (1.612 baris)**: Menangani manajemen tugas, jadwal kalender rutin/tunggal, *widget* `DayPicker`, serta 4 modal berlapis dengan 28 variabel `useState` di level *root*.

**Permasalahan Arsitektural**:

- **Lag Input pada Perangkat Mobilitas**: Karena puluhan variabel *state* berada di tingkat komponen *root*, setiap ketukan tombol (*keystroke*) di kolom *input* (seperti *chat bar* atau pencarian tugas) memicu siklus *re-render* pada seluruh pohon komponen. Hal ini mencakup komputasi berat pemrosesan ulang `ReactMarkdown` dan `SyntaxHighlighter` pada puluhan gelembung pesan.
- **Beban Pemeliharaan (Maintenance Debt)**: Mengubah atau menambahkan logika baru pada kartu jadwal atau form pengeditan memerlukan navigasi melalui ribuan baris kode yang tidak terorganisasi dengan baik.
- **Redundansi Kode (Violating DRY)**: Gelembung pesan, kartu tugas, dan kartu jadwal dirender di banyak titik dengan variasi JSX yang nyaris identik namun terfragmentasi.

---

## 2. Keputusan Arsitektur & Perubahan Teknis

Untuk mengatasi keterbatasan performa dan ergonomi pemeliharaan, arsitektur antarmuka diubah secara mendasar dari **Monolitik** menjadi **Modular Terdekomposisi**.

### A. Dekomposisi `Chat.tsx` (2.091 → 483 Baris)

- **Pemisahan Entitas & Tipe Data**: Memindahkan seluruh antarmuka TypeScript dan struktur dokumen ke `src/components/chat/types.ts`.
- **Sub-Komponen Presentasional & Fungsional**: Memisahkan area antarmuka menjadi komponen terisolasi: `WorkspaceRail.tsx`, `SessionSidebar.tsx`, `ChatHeader.tsx`, `MessageStream.tsx`, `MessageBubble.tsx`, `ToolCard.tsx`, `DiffView.tsx`, `TypingIndicator.tsx`, `ChatInput.tsx`, `ScrollToBottom.tsx`, `CreateWorkspaceModal.tsx`, dan `DeleteSessionModal.tsx`.
- **Isolasi Performa dengan `React.memo`**: Membungkus komponen kritis (`MessageBubble`, `MessageStream`, `ChatInput`) menggunakan `React.memo`. Dengan ini, mengetik di `ChatInput` hanya me-render ulang ~180 baris kode tanpa menyentuh daftar pesan maupun *sidebar*.

### B. Dekomposisi `TaskPanel.tsx` (1.612 → 329 Baris)

- **Enkapsulasi State Modal**: Memindahkan 16 variabel *state* pengeditan (5 variabel tugas dan 11 variabel jadwal) yang sebelumnya menumpuk di *root parent* ke dalam komponen modal terenkapsulasi (`EditTaskModal.tsx`, `EditEventModal.tsx`, `DeleteConfirmModal.tsx`, `RecurringEditModal.tsx`).
- **Konsolidasi Kartu Jadwal (DRY)**: Membangun satu komponen `EventCard.tsx` universal berkinerja tinggi (dibungkus `React.memo`) yang mendukung varian `"list"` dan `"calendar"`, mengeliminasi duplikat JSX di tiga titik rendering sebelumnya.
- **Pemisahan Tampilan Utama**: Mengisolasi logika navigasi dan penyaringan ke `PanelHeader.tsx`, `TaskListView.tsx`, `EventListView.tsx`, dan `CalendarView.tsx`.
- **Sentralisasi Utilitas**: Memindahkan fungsi pemrosesan tanggal dan stempel waktu ke `src/components/panel/utils.ts`.

---

## 3. Konsekuensi & Bukti Uji (Trade-offs & Verification)

- **Peningkatan Kinerja (Performance Isolation)**: Waktu komputasi per ketukan tombol di perangkat seluler anjlok secara drastis, mengeliminasi lag input dan memberikan pengalaman 60 FPS yang responsif dan premium.
- **Kemudahan Pemeliharaan (Maintainability)**: Struktur direktori yang terfokus (`src/components/chat/*` dan `src/components/panel/*`) memungkinkan penambahan fitur baru tanpa risiko regresi tak terduga di area antarmuka lainnya.
- **Kompilasi & Stabilitas**: Lolos verifikasi `npx next build` tanpa peringatan tipe atau kesalahan *runtime*.
- **Referensi Commit**: Komit [df50fd6](https://github.com/dimsedra/dialogue-ai/commit/df50fd6c3ea7d53f0970d0fe4f51eda0e75d39bb) (`feat: chat and task panel component decomposition`).

### Rangkuman Metrik Dekomposisi

| Metrik Arsitektur | Sebelum Dekomposisi | Sesudah Dekomposisi |
| :--- | :--- | :--- |
| Baris Kode `Chat.tsx` | 2.091 baris | **483 baris** |
| Baris Kode `TaskPanel.tsx` | 1.612 baris | **329 baris** |
| Lingkup *Re-render* Saat Mengetik | > 3.700 baris gabungan | **~180 baris** (*ChatInput* saja) |
| Duplikasi JSX Kartu Jadwal | 3 salinan terpisah | **1 komponen tunggal** (`EventCard.tsx`) |
| Pengelolaan *State* Modal di Parent | 28 variabel di *root* | **5 variabel di *root*** (*lainnya dienkapsulasi*) |
