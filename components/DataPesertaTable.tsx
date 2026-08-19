"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Users,
  Search,
  RefreshCw,
  Edit3,
  Trash2,
  Plus,
  X,
  Check,
  Building2,
  Loader2,
  AlertCircle,
  Filter,
  Download,
  FileSpreadsheet,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Eye,
  Clock,
  ArrowLeftRight,
  Printer,
  User,
  Tent,
  MessageSquare,
  ShieldCheck,
  CreditCard,
  Phone,
  Calendar,
  CheckCircle2,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { exportDataToExcel } from "@/lib/excelExport";

export interface Peserta {
  id: number;
  created_at?: string;
  nama: string;
  kelompok: string;
  dapukan?: string;
  grup?: string;
  tenda?: string;
  grup_fgd?: string;
  jenis_kelamin?: string;
  smartcard?: string;
  uid_nfc?: string;
  serial_number?: string;
  no_hp?: string;
  foto_url?: string;
}

interface DataPesertaTableProps {
  onGoToInput?: () => void;
}

export default function DataPesertaTable({ onGoToInput }: DataPesertaTableProps) {
  const [pesertaList, setPesertaList] = useState<Peserta[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Search & Filter
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedKelompok, setSelectedKelompok] = useState<string>("ALL");
  const [selectedGrup, setSelectedGrup] = useState<string>("ALL");
  const [selectedFgd, setSelectedFgd] = useState<string>("ALL");
  const [roleFilter, setRoleFilter] = useState<string>("Semua");
  const [sortField, setSortField] = useState<string>("nama");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  // Selection & Pagination
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [pageSize, setPageSize] = useState<number>(10);
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Modals
  const [viewPeserta, setViewPeserta] = useState<Peserta | null>(null);
  const [editingPeserta, setEditingPeserta] = useState<Peserta | null>(null);
  const [historyPeserta, setHistoryPeserta] = useState<Peserta | null>(null);
  const [historyList, setHistoryList] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [swapPeserta, setSwapPeserta] = useState<Peserta | null>(null);
  const [cardPeserta, setCardPeserta] = useState<Peserta | null>(null);

  // Edit State Form
  const [editNama, setEditNama] = useState("");
  const [editKelompok, setEditKelompok] = useState("");
  const [editDapukan, setEditDapukan] = useState("");
  const [editGrup, setEditGrup] = useState("");
  const [editGrupFgd, setEditGrupFgd] = useState("");
  const [editJenisKelamin, setEditJenisKelamin] = useState("");
  const [editSmartcard, setEditSmartcard] = useState("");
  const [editLoading, setEditLoading] = useState(false);

  // Swap State Form
  const [swapGrup, setSwapGrup] = useState("");
  const [swapFgd, setSwapFgd] = useState("");
  const [swapLoading, setSwapLoading] = useState(false);

  // Delete State Modal
  const [pesertaToDelete, setPesertaToDelete] = useState<Peserta | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Fetch Peserta from Supabase & connect smartcard with nfc_peserta table
  const fetchPeserta = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      // Query peserta table and nfc_peserta table in parallel
      const [pesertaRes, nfcRes] = await Promise.all([
        supabase.from("peserta").select("*").order("id", { ascending: false }),
        supabase.from("nfc_peserta").select("nfc_uid, peserta_id, nama").order("id", { ascending: false }),
      ]);

      if (pesertaRes.error) throw pesertaRes.error;

      // Build lookups from nfc_peserta by peserta_id and by nama
      const nfcMapByPesertaId = new Map<number, string>();
      const nfcMapByName = new Map<string, string>();

      if (nfcRes.data) {
        nfcRes.data.forEach((item: any) => {
          const uidStr = String(item.nfc_uid || "").trim();
          if (uidStr) {
            if (item.peserta_id) {
              nfcMapByPesertaId.set(Number(item.peserta_id), uidStr);
            }
            if (item.nama) {
              nfcMapByName.set(String(item.nama).trim().toLowerCase(), uidStr);
            }
          }
        });
      }

      // Merge smartcard data & support both grup and tenda columns
      const mergedData: Peserta[] = (pesertaRes.data || []).map((p: any) => {
        const smartcardLinked =
          (p.smartcard && String(p.smartcard).trim() !== "-" ? String(p.smartcard).trim() : "") ||
          (p.nfc_uid && String(p.nfc_uid).trim() !== "-" ? String(p.nfc_uid).trim() : "") ||
          (p.uid_nfc && String(p.uid_nfc).trim() !== "-" ? String(p.uid_nfc).trim() : "") ||
          (p.id ? nfcMapByPesertaId.get(Number(p.id)) : undefined) ||
          (p.nama ? nfcMapByName.get(String(p.nama).trim().toLowerCase()) : undefined) ||
          "";

        const grupVal = (p.grup || p.tenda || "-").toString();

        return {
          ...p,
          grup: grupVal,
          tenda: grupVal,
          smartcard: smartcardLinked,
          nfc_uid: smartcardLinked,
          uid_nfc: smartcardLinked,
        };
      });

      setPesertaList(mergedData);

      // Auto-sync missing jenis_kelamin to Supabase database in the background
      const missingGenderPeserta = (pesertaRes.data || []).filter((p: any) => {
        const rawJk = (p.jenis_kelamin || "").toString().trim();
        return !rawJk || rawJk === "-" || rawJk === "null";
      });

      if (missingGenderPeserta.length > 0) {
        // Run asynchronously without blocking UI
        setTimeout(async () => {
          try {
            const updates = missingGenderPeserta.map((p: any) => {
              const determined = getGender(p);
              return supabase
                .from("peserta")
                .update({ jenis_kelamin: determined })
                .eq("id", p.id);
            });
            await Promise.allSettled(updates);
            console.log(`[Auto-Sync] ${missingGenderPeserta.length} data jenis_kelamin otomatis disimpan ke database.`);
          } catch (syncErr) {
            console.warn("[Auto-Sync] Sync gender to Supabase error:", syncErr);
          }
        }, 1000);
      }
    } catch (err: any) {
      console.error("Error fetching data peserta:", err);
      let msg = err.message || "Gagal mengambil data dari tabel 'peserta'.";
      if (err.code === "42501" || msg.toLowerCase().includes("row-level security")) {
        msg = "Akses membaca ditolak oleh RLS Supabase. Tambahkan RLS Policy untuk SELECT pada tabel 'peserta' di dashboard Supabase (atau Disable RLS).";
      }
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPeserta();
  }, [fetchPeserta]);

  // Distinct groups for dropdown filter
  const kelompokOptions = useMemo(() => {
    const groups = new Set<string>();
    pesertaList.forEach((p) => {
      if (p.kelompok && p.kelompok.trim()) {
        groups.add(p.kelompok.trim());
      }
    });
    return Array.from(groups).sort();
  }, [pesertaList]);

  // Distinct grup options
  const grupOptions = useMemo(() => {
    const set = new Set<string>();
    pesertaList.forEach((p) => {
      const g = (p.grup || p.tenda || "").trim();
      if (g && g !== "-") {
        set.add(g);
      }
    });
    return Array.from(set).sort();
  }, [pesertaList]);

  // Distinct FGD options
  const fgdOptions = useMemo(() => {
    const set = new Set<string>();
    pesertaList.forEach((p) => {
      if (p.grup_fgd && p.grup_fgd.trim() && p.grup_fgd.trim() !== "-") {
        set.add(p.grup_fgd.trim());
      }
    });
    return Array.from(set).sort();
  }, [pesertaList]);

  const handleResetFilter = () => {
    setSearchTerm("");
    setSelectedKelompok("ALL");
    setSelectedGrup("ALL");
    setSelectedFgd("ALL");
    setRoleFilter("Semua");
    setCurrentPage(1);
  };

  // Filtered & Sorted List
  const filteredPeserta = useMemo(() => {
    let result = pesertaList.filter((p) => {
      const searchLower = searchTerm.toLowerCase();
      const pGrup = (p.grup || p.tenda || "").toLowerCase();
      const matchesSearch =
        p.nama.toLowerCase().includes(searchLower) ||
        (p.kelompok && p.kelompok.toLowerCase().includes(searchLower)) ||
        (p.dapukan && p.dapukan.toLowerCase().includes(searchLower)) ||
        pGrup.includes(searchLower) ||
        (p.grup_fgd && p.grup_fgd.toLowerCase().includes(searchLower)) ||
        String(p.id).includes(searchTerm) ||
        (p.smartcard && p.smartcard.includes(searchTerm)) ||
        (p.uid_nfc && p.uid_nfc.includes(searchTerm));

      const matchesKelompok =
        selectedKelompok === "ALL" || p.kelompok === selectedKelompok;

      const matchesGrup =
        selectedGrup === "ALL" || (p.grup || p.tenda) === selectedGrup;

      const matchesFgd =
        selectedFgd === "ALL" || p.grup_fgd === selectedFgd;

      const matchesRole =
        roleFilter === "Semua" ||
        (roleFilter === "Peserta" && (!p.dapukan || p.dapukan.toLowerCase().includes("peserta"))) ||
        (roleFilter === "Panitia" && p.dapukan && p.dapukan.toLowerCase().includes("panitia"));

      return matchesSearch && matchesKelompok && matchesGrup && matchesFgd && matchesRole;
    });

    result.sort((a, b) => {
      let valA: any = (a as any)[sortField] ?? "";
      let valB: any = (b as any)[sortField] ?? "";
      if (typeof valA === "string") valA = valA.toLowerCase();
      if (typeof valB === "string") valB = valB.toLowerCase();

      if (valA < valB) return sortOrder === "asc" ? -1 : 1;
      if (valA > valB) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });

    return result;
  }, [pesertaList, searchTerm, selectedKelompok, selectedGrup, selectedFgd, roleFilter, sortField, sortOrder]);

  // Paginated Data
  const totalPages = Math.ceil(filteredPeserta.length / pageSize) || 1;
  const paginatedPeserta = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredPeserta.slice(start, start + pageSize);
  }, [filteredPeserta, currentPage, pageSize]);

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortOrder("asc");
    }
  };

  // Selection handlers
  const handleToggleSelectAll = () => {
    if (selectedIds.length === paginatedPeserta.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(paginatedPeserta.map((p) => p.id));
    }
  };

  const handleToggleSelectOne = (id: number) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  // Helper for Gender determination directly linked with Supabase jenis_kelamin
  const getGender = (p: Peserta): "L" | "P" => {
    if (p.jenis_kelamin) {
      const jk = p.jenis_kelamin.toString().trim().toUpperCase();
      if (
        jk === "P" ||
        jk.startsWith("P") ||
        jk.includes("WANITA") ||
        jk.includes("PUTRI") ||
        jk.includes("PEREMPUAN")
      ) {
        return "P";
      }
      if (
        jk === "L" ||
        jk.startsWith("L") ||
        jk.includes("PRIA") ||
        jk.includes("PUTRA") ||
        jk.includes("LAKI")
      ) {
        return "L";
      }
    }
    // Fallback based on tenda or dapukan
    const t = (p.tenda || "").toLowerCase();
    const d = (p.dapukan || "").toLowerCase();
    if (t.includes("putri") || t.includes("perempuan") || d.includes("putri") || d.includes("perempuan")) {
      return "P";
    }
    return "L";
  };

  // Helper for Smartcard code linked with nfc_uid
  const getSmartcardCode = (p: Peserta): string => {
    const val = p.smartcard || p.nfc_uid || p.uid_nfc || p.serial_number || "";
    return val.trim() === "-" ? "" : val.trim();
  };

  // Fetch Attendance History for Selected Peserta
  const fetchAttendanceHistory = useCallback(async (p: Peserta) => {
    setHistoryLoading(true);
    try {
      const cardCode = getSmartcardCode(p);
      const pName = (p.nama || "").trim();
      const pId = p.id;

      // 1. Fetch from riwayat_absen
      let riwayatData: any[] = [];
      const rwConditions: string[] = [];
      if (pId) rwConditions.push(`peserta_id.eq.${pId}`);
      if (cardCode) rwConditions.push(`serial_number.eq.${cardCode}`);
      if (pName) rwConditions.push(`nama_peserta.ilike.%${pName}%`);

      if (rwConditions.length > 0) {
        const { data, error } = await supabase
          .from("riwayat_absen")
          .select("*")
          .or(rwConditions.join(","))
          .order("timestamp", { ascending: false });

        if (!error && data) {
          riwayatData = data;
        }
      }

      // 2. Fetch from kehadiran
      let kehadiranData: any[] = [];
      const khConditions: string[] = [];
      if (cardCode) khConditions.push(`serial_number.eq.${cardCode}`);
      if (pName) khConditions.push(`nama.ilike.%${pName}%`);

      if (khConditions.length > 0) {
        const { data, error } = await supabase
          .from("kehadiran")
          .select("*")
          .or(khConditions.join(","))
          .order("timestamp", { ascending: false });

        if (!error && data) {
          kehadiranData = data;
        }
      }

      // 3. Merge & Deduplicate
      const mergedMap = new Map<string, any>();

      riwayatData.forEach((item) => {
        const timeKey = item.timestamp ? new Date(item.timestamp).toISOString().slice(0, 16) : `item-${item.id}`;
        const sesiKey = (item.sesi_nama || "Sesi").toLowerCase().trim();
        const uniqueKey = `${sesiKey}_${timeKey}`;

        mergedMap.set(uniqueKey, {
          id: `rw-${item.id}`,
          sesi_nama: item.sesi_nama || "Sesi Kegiatan",
          jadwal: item.jadwal || item.kategori || "materi",
          kategori: item.kategori || item.jadwal || "materi",
          status: item.status || "Hadir",
          timestamp: item.timestamp,
          serial_number: item.serial_number || cardCode,
        });
      });

      kehadiranData.forEach((item) => {
        const timeKey = item.timestamp ? new Date(item.timestamp).toISOString().slice(0, 16) : `item-${item.id}`;
        const sesiKey = (item.sesi_nama || "Sesi").toLowerCase().trim();
        const uniqueKey = `${sesiKey}_${timeKey}`;

        if (!mergedMap.has(uniqueKey)) {
          mergedMap.set(uniqueKey, {
            id: `kh-${item.id}`,
            sesi_nama: item.sesi_nama || "Sesi Kegiatan",
            jadwal: item.jadwal || item.kategori || "materi",
            kategori: item.kategori || item.jadwal || "materi",
            status: item.status || "Hadir",
            timestamp: item.timestamp,
            serial_number: item.serial_number || cardCode,
          });
        }
      });

      const list = Array.from(mergedMap.values()).sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );

      setHistoryList(list);
    } catch (err) {
      console.error("Error fetching attendance history:", err);
      setHistoryList([]);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  // Trigger fetch whenever historyPeserta is opened
  useEffect(() => {
    if (historyPeserta) {
      fetchAttendanceHistory(historyPeserta);
    } else {
      setHistoryList([]);
    }
  }, [historyPeserta, fetchAttendanceHistory]);

  // Helper for ID string formatting
  const getIdFormatted = (p: Peserta): string => {
    return `${26000000000 + p.id}`;
  };

  // Open Edit Dialog
  const handleStartEdit = (p: Peserta) => {
    setEditingPeserta(p);
    setEditNama(p.nama);
    setEditKelompok(p.kelompok || "");
    setEditDapukan(p.dapukan || "");
    setEditGrup(p.grup || p.tenda || "");
    setEditGrupFgd(p.grup_fgd || "");
    setEditJenisKelamin(p.jenis_kelamin || (getGender(p) === "L" ? "L" : "P"));
    setEditSmartcard(getSmartcardCode(p));
  };

  // Save Edit & sync to both peserta and nfc_peserta in Supabase
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPeserta) return;

    setEditLoading(true);
    try {
      const cleanGrup = editGrup.trim();
      const payload: any = {
        nama: editNama.trim(),
        kelompok: editKelompok.trim(),
        dapukan: editDapukan.trim(),
        grup: cleanGrup,
        tenda: cleanGrup,
        grup_fgd: editGrupFgd.trim(),
      };

      if (editJenisKelamin) {
        payload.jenis_kelamin = editJenisKelamin.trim();
      }
      if (editSmartcard !== undefined) {
        const cleanCard = editSmartcard.trim();
        payload.uid_nfc = cleanCard;
        payload.smartcard = cleanCard;
        payload.nfc_uid = cleanCard;
      }

      // Try updating with grup column first
      let { error } = await supabase
        .from("peserta")
        .update(payload)
        .eq("id", editingPeserta.id);

      if (error) {
        // If error might be missing 'grup' or 'tenda' column, try without 'grup' or without 'tenda'
        const payloadOnlyGrup = { ...payload };
        delete payloadOnlyGrup.tenda;
        const resGrup = await supabase.from("peserta").update(payloadOnlyGrup).eq("id", editingPeserta.id);
        
        if (resGrup.error) {
          const payloadOnlyTenda = { ...payload };
          delete payloadOnlyTenda.grup;
          const resTenda = await supabase.from("peserta").update(payloadOnlyTenda).eq("id", editingPeserta.id);
          if (resTenda.error) {
            // Fallback basic payload
            const basicPayload = {
              nama: editNama.trim(),
              kelompok: editKelompok.trim(),
              dapukan: editDapukan.trim(),
              grup_fgd: editGrupFgd.trim(),
            };
            const { error: basicErr } = await supabase
              .from("peserta")
              .update(basicPayload)
              .eq("id", editingPeserta.id);
            if (basicErr) throw basicErr;
          }
        }
      }

      // If smartcard / nfc_uid is set, also sync to nfc_peserta table in Supabase
      if (editSmartcard.trim()) {
        try {
          await supabase.from("nfc_peserta").upsert(
            {
              nfc_uid: editSmartcard.trim(),
              peserta_id: editingPeserta.id,
              nama: editNama.trim(),
              kelompok: editKelompok.trim(),
              dapukan: editDapukan.trim(),
              grup: cleanGrup,
              tenda: cleanGrup,
              grup_fgd: editGrupFgd.trim(),
              jenis_kelamin: editJenisKelamin.trim() || getGender(editingPeserta),
            },
            { onConflict: "nfc_uid" }
          );
        } catch (nfcSyncErr) {
          console.warn("Sync nfc_peserta error (non-fatal):", nfcSyncErr);
        }
      }

      setPesertaList((prev) =>
        prev.map((item) =>
          item.id === editingPeserta.id
            ? {
                ...item,
                ...payload,
                grup: cleanGrup,
                tenda: cleanGrup,
              }
            : item
        )
      );

      setEditingPeserta(null);
    } catch (err: any) {
      console.error("Error updating peserta:", err);
      alert(`Gagal memperbarui data: ${err.message || "Terjadi kesalahan"}`);
    } finally {
      setEditLoading(false);
    }
  };

  // Open Swap Dialog
  const handleStartSwap = (p: Peserta) => {
    setSwapPeserta(p);
    setSwapGrup(p.grup || p.tenda || "");
    setSwapFgd(p.grup_fgd || "");
  };

  // Save Swap Plotting
  const handleSaveSwap = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!swapPeserta) return;

    setSwapLoading(true);
    try {
      const cleanGrup = swapGrup.trim() || "-";
      const payload: any = {
        grup: cleanGrup,
        tenda: cleanGrup,
        grup_fgd: swapFgd.trim() || "-",
      };

      let { error } = await supabase
        .from("peserta")
        .update(payload)
        .eq("id", swapPeserta.id);

      if (error) {
        // Fallback if schema has only 'grup' or only 'tenda'
        const payloadOnlyGrup = { grup: cleanGrup, grup_fgd: swapFgd.trim() || "-" };
        const resG = await supabase.from("peserta").update(payloadOnlyGrup).eq("id", swapPeserta.id);
        if (resG.error) {
          const payloadOnlyTenda = { tenda: cleanGrup, grup_fgd: swapFgd.trim() || "-" };
          const resT = await supabase.from("peserta").update(payloadOnlyTenda).eq("id", swapPeserta.id);
          if (resT.error) throw resT.error;
        }
      }

      setPesertaList((prev) =>
        prev.map((item) =>
          item.id === swapPeserta.id
            ? {
                ...item,
                grup: cleanGrup,
                tenda: cleanGrup,
                grup_fgd: swapFgd.trim() || "-",
              }
            : item
        )
      );

      setSwapPeserta(null);
    } catch (err: any) {
      console.error("Error updating plotting:", err);
      alert(`Gagal memindahkan plotting: ${err.message || "Terjadi kesalahan"}`);
    } finally {
      setSwapLoading(false);
    }
  };

  // Delete Action
  const handleOpenDelete = (p: Peserta) => {
    setPesertaToDelete(p);
    setDeleteError(null);
  };

  const handleConfirmDelete = async () => {
    if (!pesertaToDelete) return;

    setIsDeleting(true);
    setDeleteError(null);
    try {
      const { error } = await supabase
        .from("peserta")
        .delete()
        .eq("id", pesertaToDelete.id);

      if (error) throw error;

      setPesertaList((prev) => prev.filter((p) => p.id !== pesertaToDelete.id));
      setPesertaToDelete(null);
      if (viewPeserta?.id === pesertaToDelete.id) {
        setViewPeserta(null);
      }
    } catch (err: any) {
      console.error("Error deleting peserta:", err);
      setDeleteError(err.message || "Gagal menghapus peserta.");
    } finally {
      setIsDeleting(false);
    }
  };

  // Export Excel
  const handleExport = () => {
    if (filteredPeserta.length === 0) {
      alert("Tidak ada data peserta untuk diekspor.");
      return;
    }
    const headers = [
      "ID",
      "Nama Lengkap",
      "Jenis Kelamin",
      "Status / Dapukan",
      "Smartcard / UID",
      "Kelompok",
      "Grup",
      "Grup FGD",
    ];
    const rows = filteredPeserta.map((p) => [
      getIdFormatted(p),
      p.nama,
      getGender(p) === "L" ? "Laki-laki" : "Perempuan",
      p.dapukan || "Peserta",
      getSmartcardCode(p) || "-",
      p.kelompok || "-",
      p.grup || p.tenda || "-",
      p.grup_fgd || "-",
    ]);

    exportDataToExcel("Data_Peserta_Export", headers, rows);
  };

  const renderSortIcon = (field: string) => {
    return <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${sortField === field && sortOrder === "desc" ? "rotate-180 text-[#1d4ed8]" : ""}`} />;
  };

  return (
    <div className="w-full space-y-6 font-sans text-slate-800 pb-16">
      {/* 1. PAGE TITLE & HEADER ACTIONS */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">
            Data Peserta
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Kelola data registrasi, kartu NFC Smartcard, dan plotting peserta.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleExport}
            className="px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-semibold rounded-xl border border-emerald-200 shadow-2xs flex items-center gap-1.5 transition-all active:scale-95"
            title="Download Excel"
          >
            <Download className="w-4 h-4 text-emerald-600" />
            <span>Unduh Excel</span>
          </button>

          <button
            onClick={fetchPeserta}
            disabled={loading}
            className="px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-xl border border-slate-300 shadow-2xs flex items-center gap-1.5 transition-all active:scale-95"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-slate-600 ${loading ? "animate-spin" : ""}`} />
            <span>Segarkan</span>
          </button>

          {onGoToInput && (
            <button
              onClick={onGoToInput}
              className="px-4 py-2 bg-[#1d4ed8] hover:bg-[#1e40af] text-white text-xs font-semibold rounded-xl shadow-xs flex items-center gap-2 transition-all active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>Buat Peserta</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. SEGMENTED PILLS STATUS FILTER */}
      <div className="flex justify-center">
        <div className="inline-flex p-1 bg-white border border-slate-200/90 rounded-2xl shadow-2xs gap-1">
          {["Semua", "Peserta", "Panitia"].map((role) => (
            <button
              key={role}
              onClick={() => {
                setRoleFilter(role);
                setCurrentPage(1);
              }}
              className={`px-5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                roleFilter === role
                  ? "bg-blue-50 text-[#1d4ed8] font-bold shadow-2xs"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
              }`}
            >
              {role}
            </button>
          ))}
        </div>
      </div>

      {/* 3. CLEAN FILTER CARD */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-5 md:p-6 shadow-2xs space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm md:text-base font-bold text-slate-900">Filter</h3>
          <button
            onClick={handleResetFilter}
            className="text-xs font-semibold text-rose-600 hover:text-rose-700 transition-colors cursor-pointer"
          >
            Reset Filter
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-xs">
          {/* Search */}
          <div className="space-y-1.5">
            <label className="font-semibold text-slate-700 block">Cari Peserta / UID</label>
            <div className="relative">
              <input
                type="text"
                placeholder="Ketik nama, kelompok, UID..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full pl-8 pr-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#1d4ed8] focus:ring-1 focus:ring-[#1d4ed8]"
              />
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            </div>
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
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-[#1d4ed8] focus:ring-1 focus:ring-[#1d4ed8]"
            >
              <option value="ALL">Semua Kelompok</option>
              {kelompokOptions.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </div>

          {/* Filter Grup */}
          <div className="space-y-1.5">
            <label className="font-semibold text-slate-700 block">Grup</label>
            <select
              value={selectedGrup}
              onChange={(e) => {
                setSelectedGrup(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-[#1d4ed8] focus:ring-1 focus:ring-[#1d4ed8]"
            >
              <option value="ALL">Semua Grup</option>
              {grupOptions.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </div>

          {/* Filter Grup FGD */}
          <div className="space-y-1.5">
            <label className="font-semibold text-slate-700 block">Grup FGD</label>
            <select
              value={selectedFgd}
              onChange={(e) => {
                setSelectedFgd(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-[#1d4ed8] focus:ring-1 focus:ring-[#1d4ed8]"
            >
              <option value="ALL">Semua Grup FGD</option>
              {fgdOptions.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* 4. MAIN MODERN TABLE (MATCHING IMAGE EXACTLY) */}
      <div className="bg-white border border-slate-200/90 rounded-2xl shadow-2xs overflow-hidden">
        {/* Error Alert */}
        {errorMsg && (
          <div className="p-3 bg-red-50 border-b border-red-200 text-red-700 flex items-center gap-2 text-xs">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
            <p className="flex-1">{errorMsg}</p>
            <button
              onClick={fetchPeserta}
              className="px-2.5 py-0.5 bg-red-100 hover:bg-red-200 text-red-800 rounded font-semibold text-xs"
            >
              Coba Lagi
            </button>
          </div>
        )}

        <div className="overflow-x-auto min-h-[380px]">
          {loading ? (
            <div className="flex flex-col items-center justify-center p-16 text-slate-400 gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-[#1d4ed8]" />
              <p className="text-xs font-semibold text-slate-600">Memuat data peserta...</p>
            </div>
          ) : filteredPeserta.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-16 text-center text-slate-400 gap-3">
              <Users className="w-10 h-10 text-slate-300" />
              <p className="text-sm font-semibold text-slate-700">Tidak ada data peserta yang cocok</p>
              <p className="text-xs text-slate-500 max-w-sm">
                {searchTerm || selectedKelompok !== "ALL"
                  ? "Tidak ada data yang cocok dengan kriteria pencarian / filter."
                  : "Belum ada data peserta di database."}
              </p>
              {onGoToInput && (
                <button
                  onClick={onGoToInput}
                  className="mt-2 px-4 py-1.5 bg-[#1d4ed8] text-white rounded-lg text-xs font-semibold hover:bg-[#1e40af]"
                >
                  Tambah Peserta Pertama
                </button>
              )}
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              {/* TABLE HEADER */}
              <thead>
                <tr className="bg-white text-slate-800 font-semibold border-b border-slate-200/90">
                  {/* Select All Checkbox & Action Header */}
                  <th className="py-3 px-3 w-40 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <input
                        type="checkbox"
                        checked={
                          paginatedPeserta.length > 0 &&
                          selectedIds.length === paginatedPeserta.length
                        }
                        onChange={handleToggleSelectAll}
                        className="w-4 h-4 rounded border-slate-300 text-[#1d4ed8] focus:ring-[#1d4ed8] cursor-pointer"
                        title="Pilih Semua Halaman Ini"
                      />
                      <span className="text-[11px] text-slate-400 font-normal">Aksi</span>
                    </div>
                  </th>

                  {/* Nama */}
                  <th
                    onClick={() => handleSort("nama")}
                    className="py-3.5 px-4 font-semibold text-slate-800 cursor-pointer select-none hover:bg-slate-50/80 transition-colors min-w-[200px]"
                  >
                    <div className="flex items-center gap-1">
                      <span>Nama</span>
                      {renderSortIcon("nama")}
                    </div>
                  </th>

                  {/* L/P */}
                  <th
                    onClick={() => handleSort("jenis_kelamin")}
                    className="py-3.5 px-4 font-semibold text-slate-800 cursor-pointer select-none hover:bg-slate-50/80 transition-colors w-20 text-center"
                  >
                    <div className="flex items-center justify-center gap-1">
                      <span>L/P</span>
                      {renderSortIcon("jenis_kelamin")}
                    </div>
                  </th>

                  {/* Status / Dapukan */}
                  <th
                    onClick={() => handleSort("dapukan")}
                    className="py-3.5 px-4 font-semibold text-slate-800 cursor-pointer select-none hover:bg-slate-50/80 transition-colors w-32"
                  >
                    <div className="flex items-center gap-1">
                      <span>Status</span>
                      {renderSortIcon("dapukan")}
                    </div>
                  </th>

                  {/* Smartcard */}
                  <th className="py-3.5 px-4 font-semibold text-slate-800 min-w-[170px]">
                    <div className="flex items-center gap-1">
                      <span>Smartcard</span>
                    </div>
                  </th>

                  {/* Kelompok */}
                  <th
                    onClick={() => handleSort("kelompok")}
                    className="py-3.5 px-4 font-semibold text-slate-800 cursor-pointer select-none hover:bg-slate-50/80 transition-colors min-w-[140px]"
                  >
                    <div className="flex items-center gap-1">
                      <span>Kelompok</span>
                      {renderSortIcon("kelompok")}
                    </div>
                  </th>

                  {/* Grup */}
                  <th
                    onClick={() => handleSort("grup")}
                    className="py-3.5 px-4 font-semibold text-slate-800 cursor-pointer select-none hover:bg-slate-50/80 transition-colors min-w-[120px]"
                  >
                    <div className="flex items-center gap-1">
                      <span>Grup</span>
                      {renderSortIcon("grup")}
                    </div>
                  </th>

                  {/* Grup FGD */}
                  <th
                    onClick={() => handleSort("grup_fgd")}
                    className="py-3.5 px-4 font-semibold text-slate-800 cursor-pointer select-none hover:bg-slate-50/80 transition-colors min-w-[120px]"
                  >
                    <div className="flex items-center gap-1">
                      <span>Grup FGD</span>
                      {renderSortIcon("grup_fgd")}
                    </div>
                  </th>
                </tr>
              </thead>

              {/* TABLE BODY */}
              <tbody className="divide-y divide-slate-100 text-slate-700 font-normal">
                {paginatedPeserta.map((p) => {
                  const gender = getGender(p);
                  const isSelected = selectedIds.includes(p.id);
                  const isPanitia = p.dapukan && p.dapukan.toLowerCase().includes("panitia");

                  return (
                    <tr
                      key={p.id}
                      className={`hover:bg-slate-50/70 transition-colors ${
                        isSelected ? "bg-blue-50/30" : ""
                      }`}
                    >
                      {/* 1. Left Action Buttons & Checkbox */}
                      <td className="py-3.5 px-3 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          {/* 1. View Detail (Eye) */}
                          <button
                            type="button"
                            onClick={() => setViewPeserta(p)}
                            className="p-1.5 text-slate-400 hover:text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg shadow-2xs transition-colors"
                            title="Lihat Profil Peserta"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>

                          {/* 2. Edit (Solid Blue Button) */}
                          <button
                            type="button"
                            onClick={() => handleStartEdit(p)}
                            className="p-1.5 text-white bg-[#1d4ed8] hover:bg-[#1e40af] rounded-lg shadow-2xs transition-colors"
                            title="Edit Data Peserta"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>

                          {/* 3. History (Clock Outline) */}
                          <button
                            type="button"
                            onClick={() => setHistoryPeserta(p)}
                            className="p-1.5 text-[#1d4ed8] hover:bg-blue-50 border border-blue-200/70 bg-white rounded-lg shadow-2xs transition-colors"
                            title="Riwayat Presensi Peserta"
                          >
                            <Clock className="w-3.5 h-3.5" />
                          </button>

                          {/* 4. Swap Plotting (Transfer Double Arrow) */}
                          <button
                            type="button"
                            onClick={() => handleStartSwap(p)}
                            className="p-1.5 text-[#1d4ed8] hover:bg-blue-50 border border-blue-200/70 bg-white rounded-lg shadow-2xs transition-colors"
                            title="Pindah Grup / Grup FGD"
                          >
                            <ArrowLeftRight className="w-3.5 h-3.5" />
                          </button>

                          {/* 5. Print (Printer Outline) */}
                          <button
                            type="button"
                            onClick={() => setCardPeserta(p)}
                            className="p-1.5 text-[#1d4ed8] hover:bg-blue-50 border border-blue-200/70 bg-white rounded-lg shadow-2xs transition-colors"
                            title="Cetak Kartu Peserta"
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </button>

                          {/* Checkbox */}
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleSelectOne(p.id)}
                            className="w-4 h-4 ml-1 rounded border-slate-300 text-[#1d4ed8] focus:ring-[#1d4ed8] cursor-pointer"
                          />
                        </div>
                      </td>

                      {/* 2. Nama & Avatar */}
                      <td className="py-3.5 px-4 font-normal">
                        <div className="flex items-center gap-3">
                          {/* Avatar Thumbnail */}
                          <div
                            className={`w-9 h-9 rounded-lg overflow-hidden shrink-0 flex items-center justify-center font-bold text-xs ${
                              gender === "L"
                                ? "bg-amber-100 text-amber-800 border border-amber-200/90"
                                : "bg-emerald-100 text-emerald-800 border border-emerald-200/90"
                            }`}
                          >
                            {p.foto_url ? (
                              <img
                                src={p.foto_url}
                                alt={p.nama}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <span>{p.nama.charAt(0).toUpperCase()}</span>
                            )}
                          </div>

                          <div className="font-semibold text-slate-900 text-xs md:text-sm">
                            {p.nama}
                          </div>
                        </div>
                      </td>

                      {/* 3. L/P Badge */}
                      <td className="py-3.5 px-4 text-center">
                        {gender === "L" ? (
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-lg text-xs font-bold text-[#1d4ed8] bg-blue-50/90 border border-blue-200/80 shadow-2xs">
                            L
                          </span>
                        ) : (
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-lg text-xs font-bold text-emerald-600 bg-emerald-50/90 border border-emerald-200/80 shadow-2xs">
                            P
                          </span>
                        )}
                      </td>

                      {/* 4. Status / Dapukan Badge */}
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium border ${
                            isPanitia
                              ? "bg-indigo-50 text-indigo-700 border-indigo-200"
                              : "bg-blue-50 text-[#1d4ed8] border-blue-200"
                          }`}
                        >
                          {p.dapukan || "Peserta"}
                        </span>
                      </td>

                      {/* 5. Smartcard Input Box Pill */}
                      <td className="py-3.5 px-4">
                        <div className="px-3.5 py-1 bg-white border border-slate-200/90 rounded-full text-xs font-mono text-slate-700 min-w-[120px] max-w-[170px] shadow-2xs text-center truncate">
                          {getSmartcardCode(p) || "-"}
                        </div>
                      </td>

                      {/* 6. Kelompok */}
                      <td className="py-3.5 px-4 text-slate-700 font-medium">
                        {p.kelompok || "-"}
                      </td>

                      {/* 7. Grup */}
                      <td className="py-3.5 px-4 text-slate-700 font-medium">
                        {p.grup || p.tenda || "-"}
                      </td>

                      {/* 8. Grup FGD */}
                      <td className="py-3.5 px-4 text-slate-700 font-medium">
                        {p.grup_fgd || "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* 5. TABLE FOOTER (MATCHING IMAGE EXACTLY) */}
        <div className="bg-white border-t border-slate-200/80 px-4 py-3.5 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600">
          {/* Left: Summary text */}
          <div>
            Menampilkan{" "}
            <span className="font-semibold text-slate-800">
              {filteredPeserta.length > 0 ? (currentPage - 1) * pageSize + 1 : 0}
            </span>{" "}
            sampai{" "}
            <span className="font-semibold text-slate-800">
              {Math.min(currentPage * pageSize, filteredPeserta.length)}
            </span>{" "}
            dari{" "}
            <span className="font-semibold text-slate-800">{filteredPeserta.length}</span>{" "}
            hasil
          </div>

          {/* Right: Per halaman & pagination */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-slate-500">per halaman</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
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

            {/* Page buttons */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
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
                onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
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

      {/* ================= MODAL 1: VIEW DETAIL ================= */}
      {viewPeserta && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between mb-4 border-b pb-3">
              <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                <Eye className="w-4 h-4 text-[#1d4ed8]" />
                Detail Profil Peserta
              </h3>
              <button
                onClick={() => setViewPeserta(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-xl border border-slate-200/80">
                <div
                  className={`w-14 h-14 rounded-xl flex items-center justify-center text-xl font-bold ${
                    getGender(viewPeserta) === "L"
                      ? "bg-amber-100 text-amber-800 border border-amber-200"
                      : "bg-emerald-100 text-emerald-800 border border-emerald-200"
                  }`}
                >
                  {viewPeserta.nama.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900">{viewPeserta.nama}</h4>
                  <p className="text-slate-500 font-mono">ID: {getIdFormatted(viewPeserta)}</p>
                  <span className="inline-block mt-1 px-2.5 py-0.5 bg-blue-50 text-[#1d4ed8] border border-blue-200 rounded-full text-[11px] font-semibold">
                    {viewPeserta.dapukan || "Peserta"}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-white border border-slate-200 rounded-xl">
                  <span className="text-slate-400 block mb-1">Jenis Kelamin</span>
                  <span className="font-bold text-slate-800">
                    {getGender(viewPeserta) === "L" ? "Laki-laki (L)" : "Perempuan (P)"}
                  </span>
                </div>

                <div className="p-3 bg-white border border-slate-200 rounded-xl">
                  <span className="text-slate-400 block mb-1">Smartcard / UID NFC</span>
                  <span className="font-mono font-bold text-[#1d4ed8]">
                    {getSmartcardCode(viewPeserta) || "Belum Terhubung"}
                  </span>
                </div>

                <div className="p-3 bg-white border border-slate-200 rounded-xl">
                  <span className="text-slate-400 block mb-1">Kelompok</span>
                  <span className="font-semibold text-slate-800">{viewPeserta.kelompok || "-"}</span>
                </div>

                <div className="p-3 bg-white border border-slate-200 rounded-xl">
                  <span className="text-slate-400 block mb-1">Grup</span>
                  <span className="font-semibold text-slate-800">{viewPeserta.grup || viewPeserta.tenda || "-"}</span>
                </div>

                <div className="p-3 bg-white border border-slate-200 rounded-xl col-span-2">
                  <span className="text-slate-400 block mb-1">Grup FGD</span>
                  <span className="font-semibold text-slate-800">{viewPeserta.grup_fgd || "-"}</span>
                </div>
              </div>

              <div className="flex justify-between items-center pt-3 border-t">
                <button
                  type="button"
                  onClick={() => {
                    const toDel = viewPeserta;
                    setViewPeserta(null);
                    handleOpenDelete(toDel);
                  }}
                  className="text-rose-600 hover:text-rose-700 font-semibold text-xs flex items-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Hapus Peserta</span>
                </button>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const toEdit = viewPeserta;
                      setViewPeserta(null);
                      handleStartEdit(toEdit);
                    }}
                    className="px-4 py-2 bg-[#1d4ed8] text-white rounded-xl font-semibold hover:bg-[#1e40af] flex items-center gap-1.5"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>Edit Data</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL 2: EDIT DATA ================= */}
      {editingPeserta && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between mb-4 border-b pb-3">
              <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-[#1d4ed8]" />
                Edit Data Peserta
              </h3>
              <button
                onClick={() => setEditingPeserta(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Nama Lengkap
                </label>
                <input
                  type="text"
                  value={editNama}
                  onChange={(e) => setEditNama(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-medium focus:outline-none focus:border-[#1d4ed8]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Jenis Kelamin
                  </label>
                  <select
                    value={editJenisKelamin}
                    onChange={(e) => setEditJenisKelamin(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-medium focus:outline-none focus:border-[#1d4ed8]"
                  >
                    <option value="Laki-laki">Laki-laki</option>
                    <option value="Perempuan">Perempuan</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Dapukan / Status
                  </label>
                  <input
                    type="text"
                    value={editDapukan}
                    onChange={(e) => setEditDapukan(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-medium focus:outline-none focus:border-[#1d4ed8]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Kelompok
                  </label>
                  <input
                    type="text"
                    value={editKelompok}
                    onChange={(e) => setEditKelompok(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-medium focus:outline-none focus:border-[#1d4ed8]"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Smartcard / UID NFC
                  </label>
                  <input
                    type="text"
                    value={editSmartcard}
                    onChange={(e) => setEditSmartcard(e.target.value)}
                    placeholder="Contoh: 1102537971"
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-mono focus:outline-none focus:border-[#1d4ed8]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Grup
                  </label>
                  <input
                    type="text"
                    value={editGrup}
                    onChange={(e) => setEditGrup(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-medium focus:outline-none focus:border-[#1d4ed8]"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Grup FGD
                  </label>
                  <input
                    type="text"
                    value={editGrupFgd}
                    onChange={(e) => setEditGrupFgd(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-medium focus:outline-none focus:border-[#1d4ed8]"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setEditingPeserta(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold transition-all"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={editLoading}
                  className="px-5 py-2 bg-[#1d4ed8] hover:bg-[#1e40af] text-white rounded-xl font-semibold transition-all flex items-center gap-1.5"
                >
                  {editLoading ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Menyimpan...
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      Simpan Perubahan
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL 3: SWAP / TRANSFER PLOTTING ================= */}
      {swapPeserta && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between mb-4 border-b pb-3">
              <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                <ArrowLeftRight className="w-4 h-4 text-[#1d4ed8]" />
                Pindah Plotting Peserta
              </h3>
              <button
                onClick={() => setSwapPeserta(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 mb-4 text-xs">
              <p className="font-bold text-slate-900">{swapPeserta.nama}</p>
              <p className="text-slate-500">Kelompok: {swapPeserta.kelompok || "-"}</p>
            </div>

            <form onSubmit={handleSaveSwap} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Pilih / Ganti Grup
                </label>
                <input
                  type="text"
                  list="swap-grup-list"
                  value={swapGrup}
                  onChange={(e) => setSwapGrup(e.target.value)}
                  placeholder="Contoh: Grup 01, Grup Putra A"
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-medium focus:outline-none focus:border-[#1d4ed8]"
                />
                <datalist id="swap-grup-list">
                  {grupOptions.map((g) => (
                    <option key={g} value={g} />
                  ))}
                </datalist>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Pilih / Ganti Grup FGD
                </label>
                <input
                  type="text"
                  list="swap-fgd-list"
                  value={swapFgd}
                  onChange={(e) => setSwapFgd(e.target.value)}
                  placeholder="Contoh: FGD 01, FGD A"
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-medium focus:outline-none focus:border-[#1d4ed8]"
                />
                <datalist id="swap-fgd-list">
                  {fgdOptions.map((f) => (
                    <option key={f} value={f} />
                  ))}
                </datalist>
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setSwapPeserta(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold transition-all"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={swapLoading}
                  className="px-5 py-2 bg-[#1d4ed8] hover:bg-[#1e40af] text-white rounded-xl font-semibold transition-all flex items-center gap-1.5"
                >
                  {swapLoading ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Memindahkan...
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      Simpan Plotting
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL 4: HISTORY / PRESENSI ================= */}
      {historyPeserta && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-blue-50 border border-blue-200/80 flex items-center justify-center text-[#1d4ed8]">
                  <Clock className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm md:text-base font-bold text-slate-800 flex items-center gap-2">
                    Riwayat Presensi Peserta
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" title="Terkoneksi Real-time" />
                  </h3>
                  <p className="text-[11px] text-slate-500">Log kehadiran & rekaman tap Smartcard NFC</p>
                </div>
              </div>
              <button
                onClick={() => setHistoryPeserta(null)}
                className="text-slate-400 hover:text-slate-600 p-1.5 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                title="Tutup"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3.5 text-xs">
              {/* Participant Profile Card */}
              <div className="bg-slate-50/80 p-3.5 rounded-xl border border-slate-200/80 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${
                      getGender(historyPeserta) === "L"
                        ? "bg-amber-100 text-amber-800 border border-amber-200"
                        : "bg-emerald-100 text-emerald-800 border border-emerald-200"
                    }`}
                  >
                    {historyPeserta.nama ? historyPeserta.nama.charAt(0).toUpperCase() : "P"}
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-900 text-sm leading-tight">{historyPeserta.nama}</h4>
                    <div className="flex flex-wrap items-center gap-2 mt-1 text-[11px] text-slate-500">
                      <span>Kelompok: <strong className="text-slate-700">{historyPeserta.kelompok || "-"}</strong></span>
                      <span>•</span>
                      <span>Grup: <strong className="text-slate-700">{historyPeserta.grup || historyPeserta.tenda || "-"}</strong></span>
                    </div>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">UID Smartcard</div>
                  <div className="font-mono text-xs font-bold text-[#1d4ed8] bg-blue-50 border border-blue-200/70 px-2 py-0.5 rounded-md mt-0.5">
                    {getSmartcardCode(historyPeserta) || "Belum Terdaftar"}
                  </div>
                </div>
              </div>

              {/* Quick Summary Pill Bar */}
              <div className="grid grid-cols-2 gap-2">
                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/70 flex items-center justify-between">
                  <span className="text-slate-500 font-medium text-[11px]">Total Sesi Hadir</span>
                  <span className="font-bold text-[#1d4ed8] text-sm bg-blue-50 px-2 py-0.5 rounded-md border border-blue-100">
                    {historyList.length} Sesi
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/70 flex items-center justify-between">
                  <span className="text-slate-500 font-medium text-[11px]">Status Terkini</span>
                  <span
                    className={`font-bold text-[11px] px-2 py-0.5 rounded-md ${
                      historyList.length > 0
                        ? "text-emerald-700 bg-emerald-50 border border-emerald-200"
                        : "text-slate-500 bg-slate-100 border border-slate-200"
                    }`}
                  >
                    {historyList.length > 0 ? historyList[0].status || "Hadir" : "Belum Absen"}
                  </span>
                </div>
              </div>

              {/* History Log List */}
              <div>
                <div className="flex items-center justify-between mb-2 px-0.5">
                  <span className="font-bold text-slate-700 text-xs">Catatan Riwayat Sesi</span>
                  <button
                    type="button"
                    onClick={() => fetchAttendanceHistory(historyPeserta)}
                    disabled={historyLoading}
                    className="inline-flex items-center gap-1 text-[11px] text-[#1d4ed8] hover:text-[#1e40af] font-semibold transition-colors cursor-pointer"
                  >
                    <RefreshCw className={`w-3 h-3 ${historyLoading ? "animate-spin" : ""}`} />
                    <span>Segarkan</span>
                  </button>
                </div>

                {historyLoading ? (
                  <div className="p-8 text-center bg-slate-50/50 border border-dashed border-slate-200 rounded-xl space-y-2">
                    <Loader2 className="w-6 h-6 text-[#1d4ed8] animate-spin mx-auto" />
                    <p className="text-xs font-semibold text-slate-600">Mengambil catatan presensi dari Supabase...</p>
                  </div>
                ) : historyList.length === 0 ? (
                  <div className="p-6 text-center text-slate-400 bg-slate-50/50 border border-dashed border-slate-200 rounded-xl space-y-2">
                    <Clock className="w-8 h-8 text-slate-300 mx-auto" />
                    <p className="font-semibold text-slate-700 text-xs">Belum Ada Riwayat Presensi</p>
                    <p className="text-[11px] text-slate-400 max-w-xs mx-auto">
                      Peserta ini belum tercatat melakukan tap Smartcard NFC pada sesi materi / kegiatan yang berlangsung.
                    </p>
                  </div>
                ) : (
                  <div className="max-h-64 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                    {historyList.map((item, idx) => {
                      const dt = item.timestamp ? new Date(item.timestamp) : null;
                      const dateStr = dt
                        ? dt.toLocaleDateString("id-ID", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })
                        : "-";
                      const timeStr = dt
                        ? dt.toLocaleTimeString("id-ID", {
                            hour: "2-digit",
                            minute: "2-digit",
                            second: "2-digit",
                            hour12: false,
                          }) + " WIB"
                        : "-";

                      const kat = (item.kategori || item.jadwal || "materi").toLowerCase();

                      return (
                        <div
                          key={item.id || idx}
                          className="p-3 bg-white hover:bg-blue-50/20 border border-slate-200/90 rounded-xl shadow-2xs transition-all flex items-center justify-between gap-3"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <h5 className="font-bold text-slate-900 text-xs">{item.sesi_nama}</h5>
                              <span
                                className={`text-[10px] font-bold px-1.5 py-0.5 rounded capitalize ${
                                  kat === "materi"
                                    ? "bg-blue-50 text-[#1d4ed8] border border-blue-200/80"
                                    : kat === "sholat"
                                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200/80"
                                    : kat === "kegiatan"
                                    ? "bg-purple-50 text-purple-700 border border-purple-200/80"
                                    : "bg-amber-50 text-amber-700 border border-amber-200/80"
                                }`}
                              >
                                {item.kategori || item.jadwal || "Sesi"}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-[11px] text-slate-400">
                              <Calendar className="w-3 h-3 text-slate-400" />
                              <span>{dateStr}</span>
                              <span>•</span>
                              <Clock className="w-3 h-3 text-slate-400" />
                              <span className="font-mono text-slate-600">{timeStr}</span>
                            </div>
                          </div>

                          <div className="shrink-0 text-right">
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 shadow-2xs">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                              <span>{item.status || "Hadir"}</span>
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Footer Actions */}
              <div className="flex justify-between items-center pt-3 border-t border-slate-100">
                <span className="text-[11px] text-slate-400 font-mono">
                  {historyList.length} data ditemukan
                </span>
                <button
                  type="button"
                  onClick={() => setHistoryPeserta(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold transition-colors cursor-pointer"
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL 5: PRINT CARD PREVIEW ================= */}
      {cardPeserta && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between mb-4 border-b pb-3">
              <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                <Printer className="w-4 h-4 text-[#1d4ed8]" />
                Kartu Peserta Smartcard
              </h3>
              <button
                onClick={() => setCardPeserta(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Virtual Badge Card */}
              <div className="bg-gradient-to-br from-[#1d4ed8] to-[#1e3a8a] text-white p-5 rounded-2xl shadow-md space-y-4 text-center">
                <div className="text-[11px] tracking-widest font-semibold uppercase opacity-80">
                  KARTU PESERTA ASRAMA
                </div>
                <div className="w-16 h-16 bg-white/20 rounded-full mx-auto flex items-center justify-center text-2xl font-bold border-2 border-white/40">
                  {cardPeserta.nama.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h4 className="font-extrabold text-sm text-white">{cardPeserta.nama}</h4>
                  <p className="text-[11px] text-blue-200">{cardPeserta.kelompok || "Umum"}</p>
                </div>
                <div className="bg-white/10 rounded-xl p-2 font-mono text-xs flex justify-between px-3">
                  <span className="opacity-70">UID:</span>
                  <span className="font-bold">{getSmartcardCode(cardPeserta) || getIdFormatted(cardPeserta)}</span>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setCardPeserta(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold"
                >
                  Tutup
                </button>
                <button
                  onClick={() => window.print()}
                  className="px-4 py-2 bg-[#1d4ed8] hover:bg-[#1e40af] text-white rounded-xl text-xs font-semibold flex items-center gap-1.5"
                >
                  <Printer className="w-4 h-4" />
                  <span>Cetak Kartu</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL 6: DELETE CONFIRMATION ================= */}
      {pesertaToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-red-100 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Hapus Data Peserta?
                </h3>
                <p className="text-xs text-slate-500">
                  Tindakan ini tidak dapat dibatalkan.
                </p>
              </div>
            </div>

            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/80 mb-4 space-y-1.5 text-xs text-slate-700">
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Nama:</span>
                <span className="font-bold text-slate-900">{pesertaToDelete.nama}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Kelompok:</span>
                <span className="font-semibold">{pesertaToDelete.kelompok || "-"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Dapukan / Grup:</span>
                <span>{pesertaToDelete.dapukan || "-"} / {pesertaToDelete.grup || pesertaToDelete.tenda || "-"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Grup FGD:</span>
                <span>{pesertaToDelete.grup_fgd || "-"}</span>
              </div>
            </div>

            {deleteError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                <p>{deleteError}</p>
              </div>
            )}

            <div className="flex justify-end gap-2.5 pt-3 border-t">
              <button
                type="button"
                onClick={() => setPesertaToDelete(null)}
                disabled={isDeleting}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-all disabled:opacity-50"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 disabled:opacity-50 shadow-sm"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Menghapus...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    Ya, Hapus Peserta
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
