"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  FileText,
  Search,
  Download,
  Printer,
  RefreshCw,
  Users,
  CheckCircle2,
  Calendar,
  Filter,
  Building2,
  Tent,
  Layers,
  ChevronLeft,
  ChevronRight,
  Trash2,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  FileSpreadsheet
} from "lucide-react";
import Image from "next/image";
import { supabase } from "@/lib/supabase";
import { exportDataToExcel } from "@/lib/excelExport";
import { toTitleCase } from "@/lib/utils";

interface RekapItem {
  id: string;
  serialNumber: string;
  nama: string;
  kelompok: string;
  dapukan: string;
  tenda: string;
  grupFgd: string;
  sesiNama: string;
  jadwal: string; // 'materi' | 'makan' | 'sholat'
  timestamp: Date;
  statusKehadiran?: string;
  menitTerlambat?: number;
  waktuTelat?: string;
  photoUrl?: string;
  sourceTable: "riwayat_absen" | "kehadiran";
}

interface PesertaMeta {
  serial_number?: string;
  nfc_uid?: string;
  id?: number;
  nama: string;
  kelompok?: string;
  dapukan?: string;
  grup?: string;
  tenda?: string;
  grup_fgd?: string;
  foto?: string;
  foto_url?: string;
}

export default function RekapPresensi() {
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<RekapItem[]>([]);
  const [pesertaCount, setPesertaCount] = useState<number>(0);
  const [sesiOptions, setSesiOptions] = useState<string[]>([]);
  const [kelompokOptions, setKelompokOptions] = useState<string[]>([]);

  // Filter States
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedJadwal, setSelectedJadwal] = useState("SEMUA");
  const [selectedSesi, setSelectedSesi] = useState("SEMUA");
  const [selectedKelompok, setSelectedKelompok] = useState("SEMUA");
  const [selectedTanggal, setSelectedTanggal] = useState("SEMUA");
  const [selectedStatus, setSelectedStatus] = useState("SEMUA");

  // Distinct tanggal options for dropdown
  const tanggalOptions = useMemo(() => {
    const dates = new Set<string>();
    records.forEach((r) => {
      if (r.timestamp) {
        try {
          const dStr = r.timestamp.toISOString().split("T")[0];
          dates.add(dStr);
        } catch (e) {
          // ignore date parse errors
        }
      }
    });
    return Array.from(dates).sort().reverse();
  }, [records]);

  // Sort State
  const [sortField, setSortField] = useState<string>("timestamp");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 25;

  // Delete State
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletingAll, setDeletingAll] = useState(false);

  // Delete single record
  const handleDeleteRecord = async (item: RekapItem) => {
    if (!confirm(`Apakah Anda yakin ingin menghapus data presensi "${item.nama}" pada sesi "${item.sesiNama}" dari database?`)) return;

    setDeletingId(item.id);
    try {
      const dbId = parseInt(item.id.replace(/^[a-z]+-/, ""), 10);
      const isNum = !isNaN(dbId);

      const promises = [];
      if (isNum) {
        promises.push(supabase.from("riwayat_absen").delete().eq("id", dbId));
        promises.push(supabase.from("kehadiran").delete().eq("id", dbId));
      }
      if (item.serialNumber) {
        promises.push(
          supabase
            .from("riwayat_absen")
            .delete()
            .match({ serial_number: item.serialNumber, sesi_nama: item.sesiNama })
        );
        promises.push(
          supabase
            .from("kehadiran")
            .delete()
            .match({ serial_number: item.serialNumber, sesi_nama: item.sesiNama })
        );
      }

      await Promise.allSettled(promises);
      setRecords((prev) => prev.filter((r) => r.id !== item.id));
    } catch (err: any) {
      alert("Gagal menghapus presensi: " + (err.message || err));
    } finally {
      setDeletingId(null);
    }
  };

  // Delete all filtered records
  const handleDeleteFiltered = async () => {
    if (filteredRecords.length === 0) return;
    if (!confirm(`PERINGATAN: Apakah Anda yakin ingin MENGHAPUS PERMANEN seluruh ${filteredRecords.length} data presensi yang tampil dari tabel database?`)) return;

    setDeletingAll(true);
    try {
      for (const item of filteredRecords) {
        const dbId = parseInt(item.id.replace(/^[a-z]+-/, ""), 10);
        if (!isNaN(dbId)) {
          await supabase.from("riwayat_absen").delete().eq("id", dbId);
          await supabase.from("kehadiran").delete().eq("id", dbId);
        } else if (item.serialNumber) {
          await supabase
            .from("riwayat_absen")
            .delete()
            .match({ serial_number: item.serialNumber, sesi_nama: item.sesiNama });
          await supabase
            .from("kehadiran")
            .delete()
            .match({ serial_number: item.serialNumber, sesi_nama: item.sesiNama });
        }
      }
      await fetchRekapData();
      alert("Data presensi berhasil dihapus dari database.");
    } catch (err: any) {
      alert("Gagal menghapus data: " + (err.message || err));
    } finally {
      setDeletingAll(false);
    }
  };

  const fetchRekapData = useCallback(async () => {
    setLoading(true);
    try {
      const [resPeserta, resNfc, resRiwayat, resKehadiran, resSesi] = await Promise.all([
        supabase.from("peserta").select("*"),
        supabase.from("nfc_peserta").select("*"),
        supabase.from("riwayat_absen").select("*").order("timestamp", { ascending: false }).limit(500),
        supabase.from("kehadiran").select("*").order("timestamp", { ascending: false }).limit(500),
        supabase.from("sesi_absensi").select("nama_sesi"),
      ]);

      setPesertaCount(resPeserta.data?.length || 0);

      const metaMap = new Map<string, PesertaMeta>();

      if (resPeserta.data) {
        for (const p of resPeserta.data) {
          const keyName = (p.nama || p.nama_peserta || "").trim().toLowerCase();
          if (keyName) {
            metaMap.set(keyName, p);
          }
          if (p.serial_number) {
            metaMap.set(p.serial_number.trim(), p);
          }
          if (p.nfc_uid) {
            metaMap.set(p.nfc_uid.trim(), p);
          }
        }
      }

      if (resNfc.data) {
        for (const n of resNfc.data) {
          if (n.nfc_uid) {
            metaMap.set(n.nfc_uid.trim(), n);
          }
        }
      }

      const sesiSet = new Set<string>();
      if (resSesi.data) {
        resSesi.data.forEach((s) => s.nama_sesi && sesiSet.add(s.nama_sesi));
      }

      const rawItems: RekapItem[] = [];
      const kelompokSet = new Set<string>();

      if (resRiwayat.data) {
        for (const d of resRiwayat.data) {
          const uid = (d.serial_number || "").trim();
          const nama = (d.nama_peserta || d.nama || "Peserta NFC").trim();
          const meta = metaMap.get(uid) || metaMap.get(nama.toLowerCase());

          const rawKel = meta?.kelompok || d.kelompok || "-";
          const rawDap = meta?.dapukan || d.dapukan || "-";
          const rawTen = meta?.grup || meta?.tenda || d.grup || d.tenda || "-";
          const rawFgd = meta?.grup_fgd || d.grup_fgd || "-";
          const rawSesi = d.sesi_nama || "Umum";

          const kelompok = rawKel !== "-" ? toTitleCase(rawKel) : "-";
          const dapukan = rawDap !== "-" ? toTitleCase(rawDap) : "-";
          const tenda = rawTen !== "-" ? toTitleCase(rawTen) : "-";
          const grupFgd = rawFgd !== "-" ? toTitleCase(rawFgd) : "-";
          const sesiNama = toTitleCase(rawSesi);

          let rawJadwal = String(d.jadwal || d.kategori || "").toLowerCase();
          if (!rawJadwal) {
            const lowerSesi = (sesiNama || "").toLowerCase();
            if (
              lowerSesi.includes("makan") ||
              lowerSesi.includes("sarapan") ||
              lowerSesi.includes("prasmanan") ||
              lowerSesi.includes("konsumsi")
            ) {
              rawJadwal = "makan";
            } else if (
              lowerSesi.includes("sholat") ||
              lowerSesi.includes("subuh") ||
              lowerSesi.includes("dzuhur") ||
              lowerSesi.includes("ashar") ||
              lowerSesi.includes("maghrib") ||
              lowerSesi.includes("isya")
            ) {
              rawJadwal = "sholat";
            } else {
              rawJadwal = "materi";
            }
          }

          if (sesiNama) sesiSet.add(sesiNama);
          if (kelompok && kelompok !== "-") kelompokSet.add(kelompok);

          const directPhotoUrl = uid ? supabase.storage.from("CAI 2026").getPublicUrl(`Foto Profil/${uid}.jpg`)?.data?.publicUrl : "";
          const resolvedPhotoUrl = meta?.foto || meta?.foto_url || directPhotoUrl || "";

          rawItems.push({
            id: `rw-${d.id}`,
            serialNumber: uid,
            nama: toTitleCase(nama),
            kelompok,
            dapukan,
            tenda,
            grupFgd,
            sesiNama,
            jadwal: rawJadwal,
            timestamp: d.timestamp ? new Date(d.timestamp) : new Date(),
            statusKehadiran: d.status_kehadiran || "Tepat Waktu",
            menitTerlambat: typeof d.menit_terlambat === "number" ? d.menit_terlambat : 0,
            waktuTelat: d.waktu_telat || "",
            photoUrl: resolvedPhotoUrl,
            sourceTable: "riwayat_absen",
          });
        }
      }

      if (resKehadiran.data) {
        for (const d of resKehadiran.data) {
          const uid = (d.serial_number || "").trim();
          const timeVal = d.timestamp ? new Date(d.timestamp).getTime() : 0;

          const exists = rawItems.some(
            (r) => r.serialNumber === uid && Math.abs(r.timestamp.getTime() - timeVal) < 5000
          );

          if (!exists) {
            const nama = (d.nama || "Peserta NFC").trim();
            const meta = metaMap.get(uid) || metaMap.get(nama.toLowerCase());

            const rawKel = meta?.kelompok || d.kelompok || "-";
            const rawDap = meta?.dapukan || d.dapukan || "-";
            const rawTen = meta?.grup || meta?.tenda || d.grup || d.tenda || "-";
            const rawFgd = meta?.grup_fgd || d.grup_fgd || "-";
            const rawSesi = d.sesi_nama || "Umum";

            const kelompok = rawKel !== "-" ? toTitleCase(rawKel) : "-";
            const dapukan = rawDap !== "-" ? toTitleCase(rawDap) : "-";
            const tenda = rawTen !== "-" ? toTitleCase(rawTen) : "-";
            const grupFgd = rawFgd !== "-" ? toTitleCase(rawFgd) : "-";
            const sesiNama = toTitleCase(rawSesi);

            let rawJadwal = String(d.jadwal || d.kategori || "").toLowerCase();
            if (!rawJadwal) {
              const lowerSesi = (sesiNama || "").toLowerCase();
              if (
                lowerSesi.includes("makan") ||
                lowerSesi.includes("sarapan") ||
                lowerSesi.includes("prasmanan") ||
                lowerSesi.includes("konsumsi")
              ) {
                rawJadwal = "makan";
              } else if (
                lowerSesi.includes("sholat") ||
                lowerSesi.includes("subuh") ||
                lowerSesi.includes("dzuhur") ||
                lowerSesi.includes("ashar") ||
                lowerSesi.includes("maghrib") ||
                lowerSesi.includes("isya")
              ) {
                rawJadwal = "sholat";
              } else {
                rawJadwal = "materi";
              }
            }

            if (sesiNama) sesiSet.add(sesiNama);
            if (kelompok && kelompok !== "-") kelompokSet.add(kelompok);

            const directPhotoUrl = uid ? supabase.storage.from("CAI 2026").getPublicUrl(`Foto Profil/${uid}.jpg`)?.data?.publicUrl : "";
            const resolvedPhotoUrl = meta?.foto || meta?.foto_url || directPhotoUrl || "";

            rawItems.push({
              id: `keh-${d.id}`,
              serialNumber: uid,
              nama: toTitleCase(nama),
              kelompok,
              dapukan,
              tenda,
              grupFgd,
              sesiNama,
              jadwal: rawJadwal,
              timestamp: d.timestamp ? new Date(d.timestamp) : new Date(),
              statusKehadiran: d.status_kehadiran || "Tepat Waktu",
              menitTerlambat: typeof d.menit_terlambat === "number" ? d.menit_terlambat : 0,
              waktuTelat: d.waktu_telat || "",
              photoUrl: resolvedPhotoUrl,
              sourceTable: "kehadiran",
            });
          }
        }
      }

      rawItems.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

      setRecords(rawItems);
      setSesiOptions(Array.from(sesiSet));
      setKelompokOptions(Array.from(kelompokSet));
    } catch (err) {
      console.error("Error fetching rekap presensi:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRekapData();
  }, [fetchRekapData]);

  // Filtered & Sorted Records
  const filteredRecords = useMemo(() => {
    let result = records.filter((rec) => {
      const term = searchTerm.toLowerCase().trim();
      const matchesSearch =
        !term ||
        rec.nama.toLowerCase().includes(term) ||
        rec.serialNumber.toLowerCase().includes(term) ||
        rec.kelompok.toLowerCase().includes(term) ||
        rec.dapukan.toLowerCase().includes(term) ||
        rec.tenda.toLowerCase().includes(term) ||
        rec.grupFgd.toLowerCase().includes(term);

      const matchesJadwal = selectedJadwal === "SEMUA" || rec.jadwal === selectedJadwal.toLowerCase();
      const matchesSesi = selectedSesi === "SEMUA" || rec.sesiNama === selectedSesi;
      const matchesKelompok = selectedKelompok === "SEMUA" || rec.kelompok === selectedKelompok;

      const matchesDate =
        !selectedTanggal ||
        selectedTanggal === "SEMUA" ||
        rec.timestamp.toISOString().split("T")[0] === selectedTanggal;

      const matchesStatus =
        !selectedStatus ||
        selectedStatus === "SEMUA" ||
        (selectedStatus === "Terlambat"
          ? rec.statusKehadiran?.toLowerCase().includes("lambat") ||
            rec.statusKehadiran?.toLowerCase().includes("telat") ||
            Boolean(rec.menitTerlambat && rec.menitTerlambat > 0)
          : selectedStatus === "Tepat Waktu"
          ? !rec.statusKehadiran?.toLowerCase().includes("lambat") &&
            !rec.statusKehadiran?.toLowerCase().includes("telat") &&
            (!rec.menitTerlambat || rec.menitTerlambat === 0)
          : rec.statusKehadiran === selectedStatus);

      return matchesSearch && matchesJadwal && matchesSesi && matchesKelompok && matchesDate && matchesStatus;
    });

    result.sort((a, b) => {
      let valA: any = (a as any)[sortField] ?? "";
      let valB: any = (b as any)[sortField] ?? "";
      if (sortField === "timestamp") {
        valA = a.timestamp.getTime();
        valB = b.timestamp.getTime();
      } else if (typeof valA === "string") {
        valA = valA.toLowerCase();
        valB = valB.toLowerCase();
      }

      if (valA < valB) return sortOrder === "asc" ? -1 : 1;
      if (valA > valB) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });

    return result;
  }, [records, searchTerm, selectedJadwal, selectedSesi, selectedKelompok, selectedTanggal, selectedStatus, sortField, sortOrder]);

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortOrder("asc");
    }
  };

  const renderSortIcon = (field: string) => {
    if (sortField !== field) {
      return <ArrowUpDown className="w-3.5 h-3.5 text-slate-400 opacity-60" />;
    }
    return sortOrder === "asc" ? (
      <ArrowUp className="w-3.5 h-3.5 text-[#203598]" />
    ) : (
      <ArrowDown className="w-3.5 h-3.5 text-[#203598]" />
    );
  };

  // Pagination calculation
  const totalPages = Math.ceil(filteredRecords.length / itemsPerPage) || 1;
  const paginatedRecords = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredRecords.slice(start, start + itemsPerPage);
  }, [filteredRecords, currentPage]);

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
    }
  };

  // Export to Excel (.xlsx)
  const exportToExcel = () => {
    if (filteredRecords.length === 0) {
      alert("Tidak ada data presensi untuk diekspor.");
      return;
    }

    const headers = [
      "No",
      "Waktu Tap",
      "UID Kartu",
      "Nama Lengkap",
      "Kelompok",
      "Dapukan",
      "Grup",
      "Grup FGD",
      "Jenis Jadwal",
      "Sesi Presensi",
      "Status",
      "Status Kehadiran",
      "Keterlambatan (Menit)",
    ];

    const rows = filteredRecords.map((r, i) => [
      i + 1,
      `${r.timestamp.toLocaleDateString("id-ID", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })} ${r.timestamp.toLocaleTimeString("id-ID", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })}`,
      r.serialNumber,
      r.nama,
      r.kelompok || "-",
      r.dapukan || "-",
      r.tenda || "-",
      r.grupFgd || "-",
      r.jadwal.toUpperCase(),
      r.sesiNama,
      "Hadir",
      r.statusKehadiran || "Tepat Waktu",
      r.menitTerlambat && r.menitTerlambat > 0 ? r.menitTerlambat : 0,
    ]);

    // Calculate group summary for sheet 2
    const groupCountMap = new Map<string, number>();
    filteredRecords.forEach((r) => {
      const g = r.kelompok || "Tanpa Kelompok";
      groupCountMap.set(g, (groupCountMap.get(g) || 0) + 1);
    });

    const summaryHeaders = ["No", "Nama Kelompok", "Jumlah Kehadiran (Tap)"];
    const summaryRows = Array.from(groupCountMap.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([grp, count], idx) => [idx + 1, grp, count]);

    exportDataToExcel(
      `Rekap_Presensi_CAI_${new Date().toISOString().split("T")[0]}.xlsx`,
      [
        {
          sheetName: "Log Presensi",
          title: "REKAPITULASI PRESENSI KEHADIRAN PESERTA CAI",
          subtitle: `Jadwal: ${selectedJadwal} | Sesi: ${selectedSesi} | Kelompok: ${selectedKelompok} | Status: ${selectedStatus}`,
          headers,
          rows,
          customColWidths: [6, 22, 16, 28, 18, 16, 12, 12, 16, 26, 10, 16, 18],
        },
        {
          sheetName: "Ringkasan per Kelompok",
          title: "RINGKASAN KEHADIRAN PER KELOMPOK",
          subtitle: `Total Log Kehadiran: ${filteredRecords.length}`,
          headers: summaryHeaders,
          rows: summaryRows,
          customColWidths: [6, 28, 24],
        },
      ]
    );
  };

  // Export to CSV
  const exportToCSV = () => {
    if (filteredRecords.length === 0) {
      alert("Tidak ada data untuk di-export.");
      return;
    }

    const headers = ["No", "Timestamp", "UID Kartu", "Nama Lengkap", "Kelompok", "Dapukan", "Grup", "Grup FGD", "Jenis Jadwal", "Sesi Presensi", "Status", "Status Kehadiran", "Menit Terlambat"];
    const rows = filteredRecords.map((r, i) => [
      i + 1,
      `"${r.timestamp.toLocaleDateString("id-ID")} ${r.timestamp.toLocaleTimeString("id-ID")}"`,
      `"${r.serialNumber}"`,
      `"${r.nama.replace(/"/g, '""')}"`,
      `"${r.kelompok}"`,
      `"${r.dapukan}"`,
      `"${r.tenda}"`,
      `"${r.grupFgd}"`,
      `"${r.jadwal.toUpperCase()}"`,
      `"${r.sesiNama}"`,
      "Hadir",
      `"${r.statusKehadiran || "Tepat Waktu"}"`,
      r.menitTerlambat || 0,
    ]);

    const csvContent = "\uFEFF" + [headers.join(","), ...rows.map((row) => row.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `rekap_presensi_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleResetFilter = () => {
    setSearchTerm("");
    setSelectedJadwal("SEMUA");
    setSelectedSesi("SEMUA");
    setSelectedKelompok("SEMUA");
    setSelectedTanggal("SEMUA");
    setSelectedStatus("SEMUA");
    setCurrentPage(1);
  };

  return (
    <div className="w-full max-w-7xl mx-auto space-y-5 font-sans text-slate-800">
      {/* 1. BREADCRUMB */}
      <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
        <span>Presensi</span>
        <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
        <span className="text-slate-800 font-semibold">Rekap Kehadiran</span>
      </div>

      {/* 2. PAGE HEADER ROW */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">
            Rekap Presensi
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Log riwayat tap kartu NFC dan kehadiran peserta real-time
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={exportToExcel}
            className="px-4 py-2 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-xl border border-slate-300 shadow-2xs flex items-center gap-2 transition-all active:scale-95"
            title="Unduh Spreadsheet Excel (.xlsx)"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            <span>Ekspor</span>
          </button>

          <button
            onClick={exportToCSV}
            className="px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-xl border border-slate-300 shadow-2xs flex items-center gap-1.5 transition-all"
            title="Unduh Format CSV"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            <span>CSV</span>
          </button>

          <button
            onClick={() => window.print()}
            className="px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-xl border border-slate-300 shadow-2xs flex items-center gap-1.5 transition-all"
          >
            <Printer className="w-3.5 h-3.5 text-slate-500" />
            <span>Cetak</span>
          </button>

          {filteredRecords.length > 0 && (
            <button
              onClick={handleDeleteFiltered}
              disabled={deletingAll}
              className="px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold rounded-xl shadow-2xs flex items-center gap-1.5 transition-all"
              title="Hapus data presensi yang tampil"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{deletingAll ? "Menghapus..." : "Hapus Record"}</span>
            </button>
          )}
        </div>
      </div>

      {/* 3. SEGMENTED PILLS FILTER JADWAL */}
      <div className="flex justify-center">
        <div className="inline-flex p-1 bg-white border border-slate-200/90 rounded-2xl shadow-2xs gap-1">
          {[
            { id: "SEMUA", label: "Semua Jadwal" },
            { id: "materi", label: "Materi" },
            { id: "makan", label: "Makan" },
            { id: "sholat", label: "Sholat" },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => {
                setSelectedJadwal(item.id);
                setCurrentPage(1);
              }}
              className={`px-5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                selectedJadwal === item.id
                  ? "bg-blue-50 text-[#203598] font-bold shadow-2xs"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* 4. CLEAN FILTER CARD */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-5 md:p-6 shadow-2xs space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm md:text-base font-bold text-slate-900">Filter</h3>
          <button
            onClick={handleResetFilter}
            className="text-xs font-semibold text-rose-600 hover:text-rose-700 transition-colors cursor-pointer"
          >
            Atur ulang filter
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3 text-xs">
          {/* Cari Peserta / Smartcard */}
          <div className="space-y-1.5">
            <label className="font-semibold text-slate-700 block">Cari Peserta / UID</label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Cari nama, UID, dapukan..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full pl-8 pr-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#203598] focus:ring-1 focus:ring-[#203598]"
              />
            </div>
          </div>

          {/* Filter Sesi */}
          <div className="space-y-1.5">
            <label className="font-semibold text-slate-700 block">Sesi Presensi</label>
            <select
              value={selectedSesi}
              onChange={(e) => {
                setSelectedSesi(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-[#203598] focus:ring-1 focus:ring-[#203598]"
            >
              <option value="SEMUA">Semua Sesi ({sesiOptions.length})</option>
              {sesiOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          {/* Filter Kelompok */}
          <div className="space-y-1.5">
            <label className="font-semibold text-slate-700 block">Kelompok</label>
            <select
              value={selectedKelompok}
              onChange={(e) => {
                setSelectedKelompok(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-[#203598] focus:ring-1 focus:ring-[#203598]"
            >
              <option value="SEMUA">Semua Kelompok</option>
              {kelompokOptions.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </div>

          {/* Filter Tanggal */}
          <div className="space-y-1.5">
            <label className="font-semibold text-slate-700 block">Tanggal Presensi</label>
            <select
              value={selectedTanggal}
              onChange={(e) => {
                setSelectedTanggal(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-[#203598] focus:ring-1 focus:ring-[#203598]"
            >
              <option value="SEMUA">Semua Tanggal</option>
              {tanggalOptions.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          {/* Filter Status Kehadiran */}
          <div className="space-y-1.5">
            <label className="font-semibold text-slate-700 block">Status Kehadiran</label>
            <select
              value={selectedStatus}
              onChange={(e) => {
                setSelectedStatus(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-[#203598] focus:ring-1 focus:ring-[#203598]"
            >
              <option value="SEMUA">Semua Status</option>
              <option value="Tepat Waktu">Tepat Waktu</option>
              <option value="Terlambat">Terlambat</option>
            </select>
          </div>
        </div>

        <div className="pt-1 flex items-center justify-between">
          <button
            onClick={() => {}}
            className="px-4 py-2 bg-[#203598] hover:bg-[#182978] text-white font-semibold text-xs rounded-xl shadow-xs transition-all active:scale-95"
          >
            Terapkan filter
          </button>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500">
              Menampilkan <strong>{filteredRecords.length}</strong> log kehadiran
            </span>
            <button
              onClick={fetchRekapData}
              disabled={loading}
              className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-xs transition-colors"
              title="Refresh Data"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>
      </div>

      {/* 5. MAIN TABLE CARD CONTAINER */}
      <div className="bg-white border border-slate-200/90 rounded-2xl shadow-2xs overflow-hidden">
        {/* SPREADSHEET STYLE DATA TABLE */}
        <div className="overflow-x-auto min-h-[380px]">
          {loading ? (
            <div className="flex flex-col items-center justify-center p-16 text-slate-400 gap-3">
              <RefreshCw className="w-8 h-8 animate-spin text-[#1d4ed8]" />
              <p className="text-xs font-semibold text-slate-600">Memuat riwayat presensi...</p>
            </div>
          ) : filteredRecords.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-16 text-center text-slate-400 gap-3">
              <FileText className="w-10 h-10 text-slate-300" />
              <p className="text-sm font-semibold text-slate-700">Tidak ada riwayat presensi yang cocok</p>
              <p className="text-xs text-slate-500 max-w-sm">
                Coba sesuaikan kata kunci pencarian atau reset filter dropdown di toolbar atas.
              </p>
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              {/* TABLE HEADER */}
              <thead>
                <tr className="bg-white text-slate-800 font-semibold border-b border-slate-200/90">
                  <th className="py-3.5 px-3 w-28 text-center">
                    <span className="text-[11px] text-slate-400 font-normal">Aksi</span>
                  </th>

                  <th
                    onClick={() => handleSort("nama")}
                    className="py-3.5 px-4 font-semibold text-slate-800 cursor-pointer select-none hover:bg-slate-50/80 transition-colors min-w-[200px]"
                  >
                    <div className="flex items-center gap-1">
                      <span>Nama</span>
                      {renderSortIcon("nama")}
                    </div>
                  </th>

                  <th
                    onClick={() => handleSort("serialNumber")}
                    className="py-3.5 px-4 font-semibold text-slate-800 cursor-pointer select-none hover:bg-slate-50/80 transition-colors min-w-[140px]"
                  >
                    <div className="flex items-center gap-1">
                      <span>Smartcard / UID</span>
                      {renderSortIcon("serialNumber")}
                    </div>
                  </th>

                  <th
                    onClick={() => handleSort("timestamp")}
                    className="py-3.5 px-4 font-semibold text-slate-800 cursor-pointer select-none hover:bg-slate-50/80 transition-colors min-w-[160px]"
                  >
                    <div className="flex items-center gap-1">
                      <span>Waktu Tap</span>
                      {renderSortIcon("timestamp")}
                    </div>
                  </th>

                  <th
                    onClick={() => handleSort("sesiNama")}
                    className="py-3.5 px-4 font-semibold text-slate-800 cursor-pointer select-none hover:bg-slate-50/80 transition-colors min-w-[150px]"
                  >
                    <div className="flex items-center gap-1">
                      <span>Sesi Presensi</span>
                      {renderSortIcon("sesiNama")}
                    </div>
                  </th>

                  <th
                    onClick={() => handleSort("kelompok")}
                    className="py-3.5 px-4 font-semibold text-slate-800 cursor-pointer select-none hover:bg-slate-50/80 transition-colors min-w-[130px]"
                  >
                    <div className="flex items-center gap-1">
                      <span>Kelompok</span>
                      {renderSortIcon("kelompok")}
                    </div>
                  </th>

                  <th
                    onClick={() => handleSort("tenda")}
                    className="py-3.5 px-4 font-semibold text-slate-800 cursor-pointer select-none hover:bg-slate-50/80 transition-colors min-w-[100px]"
                  >
                    <div className="flex items-center gap-1">
                      <span>Grup</span>
                      {renderSortIcon("tenda")}
                    </div>
                  </th>

                  <th
                    onClick={() => handleSort("grupFgd")}
                    className="py-3.5 px-4 font-semibold text-slate-800 cursor-pointer select-none hover:bg-slate-50/80 transition-colors min-w-[100px]"
                  >
                    <div className="flex items-center gap-1">
                      <span>Grup FGD</span>
                      {renderSortIcon("grupFgd")}
                    </div>
                  </th>

                  <th className="py-3.5 px-4 font-semibold text-slate-800 text-center w-36">
                    <span>Status Kehadiran</span>
                  </th>
                </tr>
              </thead>

              {/* TABLE BODY */}
              <tbody className="divide-y divide-slate-100 text-slate-700 font-normal">
                {paginatedRecords.map((item) => (
                  <tr
                    key={item.id}
                    className="hover:bg-slate-50/70 transition-colors"
                  >
                    {/* Aksi */}
                    <td className="py-3.5 px-3 whitespace-nowrap text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleDeleteRecord(item)}
                          disabled={deletingId === item.id}
                          className="p-1.5 text-slate-400 hover:text-rose-600 bg-white hover:bg-rose-50 border border-slate-200 rounded-lg shadow-2xs transition-colors"
                          title="Hapus baris presensi"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>

                    {/* Nama & Avatar */}
                    <td className="py-3.5 px-4 font-normal">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg overflow-hidden shrink-0 flex items-center justify-center font-bold text-xs bg-blue-100 text-[#1d4ed8] border border-blue-200">
                          {item.photoUrl ? (
                            <img src={item.photoUrl} alt={item.nama} className="w-full h-full object-cover" />
                          ) : (
                            <span>{item.nama ? item.nama.charAt(0).toUpperCase() : "U"}</span>
                          )}
                        </div>
                        <div>
                          <div className="font-semibold text-slate-900 text-xs md:text-sm">
                            {item.nama}
                          </div>
                          <div className="text-[11px] text-slate-400 font-mono tracking-tight">
                            {item.dapukan || "Peserta"}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Smartcard / UID */}
                    <td className="py-3.5 px-4">
                      <div className="px-3 py-1 bg-white border border-slate-200 rounded-xl text-xs font-mono text-slate-700 min-w-[120px] max-w-[160px] shadow-2xs truncate">
                        {item.serialNumber}
                      </div>
                    </td>

                    {/* Waktu Tap */}
                    <td className="py-3.5 px-4 font-mono text-xs text-slate-600 whitespace-nowrap">
                      {item.timestamp.toLocaleDateString("id-ID", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}{" "}
                      {item.timestamp.toLocaleTimeString("id-ID", {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </td>

                    {/* Sesi Presensi */}
                    <td className="py-3.5 px-4 font-medium text-slate-800">
                      {item.sesiNama}
                    </td>

                    {/* Kelompok */}
                    <td className="py-3.5 px-4 text-slate-700 font-medium">
                      {item.kelompok || "-"}
                    </td>

                    {/* Grup */}
                    <td className="py-3.5 px-4 text-slate-700 font-medium">
                      {item.tenda || "-"}
                    </td>

                    {/* Grup FGD */}
                    <td className="py-3.5 px-4 text-slate-700 font-medium">
                      {item.grupFgd || "-"}
                    </td>

                    {/* Status Pill Badge */}
                    <td className="py-3.5 px-4 text-center whitespace-nowrap">
                      {item.statusKehadiran === "Terlambat" ||
                      item.statusKehadiran?.toLowerCase().includes("lambat") ||
                      item.statusKehadiran?.toLowerCase().includes("telat") ||
                      Boolean(item.menitTerlambat && item.menitTerlambat > 0) ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-950 border border-amber-300">
                          <span>Terlambat</span>
                          {item.menitTerlambat && item.menitTerlambat > 0 ? (
                            <span className="text-[10px] font-mono text-amber-800 font-semibold">(+{item.menitTerlambat}m)</span>
                          ) : null}
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          Tepat Waktu
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* 5. TABLE FOOTER */}
        <div className="bg-white border-t border-slate-200/80 px-4 py-3.5 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600">
          <div>
            Menampilkan{" "}
            <span className="font-semibold text-slate-800">
              {filteredRecords.length > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0}
            </span>{" "}
            sampai{" "}
            <span className="font-semibold text-slate-800">
              {Math.min(currentPage * itemsPerPage, filteredRecords.length)}
            </span>{" "}
            dari{" "}
            <span className="font-semibold text-slate-800">{filteredRecords.length}</span>{" "}
            hasil
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-slate-500">per halaman</span>
              <select
                value={itemsPerPage}
                onChange={(e) => {
                  setItemsPerPage(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 focus:outline-none focus:border-[#1d4ed8] cursor-pointer shadow-2xs"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className="p-1 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-30 disabled:pointer-events-none"
                title="Halaman Sebelumnya"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <div className="px-2 font-bold text-xs text-slate-800">
                {currentPage} / {totalPages}
              </div>

              <button
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="p-1 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-30 disabled:pointer-events-none"
                title="Halaman Berikutnya"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
