"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Clock,
  Search,
  Plus,
  Play,
  CheckCircle2,
  AlertCircle,
  Download,
  RefreshCw,
  RotateCw,
  Loader2,
  X,
  UserX,
  Filter,
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Trash2,
  LayoutGrid,
  List,
  User,
  ShieldCheck,
  Building2,
  Check,
  Eye,
  AlertTriangle,
  FileSpreadsheet
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import * as XLSX from "xlsx";
import { toTitleCase } from "@/lib/utils";

export interface PerizinanRecord {
  id: string;
  peserta_id?: string;
  nama_peserta: string;
  nama?: string;
  nfc_uid?: string;
  kelompok?: string;
  grup?: string;
  sesi_id?: string;
  sesi_nama: string;
  tanggal: string;
  alasan: string; // Manual short text input
  keterangan?: string;
  waktu_mulai: string; // ISO string
  waktu_kembali?: string | null; // ISO string
  durasi_menit?: number;
  target_durasi_menit?: number; // Manual target duration in minutes
  status: "Sedang Izin" | "Kembali" | "Ditolak";
  petugas?: string;
  created_at?: string;
}

interface PesertaSimple {
  id: string;
  nama: string;
  kelompok?: string;
  grup?: string;
  jenis_kelamin?: string;
  nfc_uid?: string;
  foto?: string;
}

interface SesiSimple {
  id: string;
  nama_sesi: string;
  tanggal: string;
  jam_mulai?: string;
  jam_selesai?: string;
  kategori?: string;
}

interface PerizinanSesiProps {
  activeSessionName?: string;
}

export default function PerizinanSesi({ activeSessionName }: PerizinanSesiProps) {
  const [records, setRecords] = useState<PerizinanRecord[]>([]);
  const [pesertaList, setPesertaList] = useState<PesertaSimple[]>([]);
  const [sesiList, setSesiList] = useState<SesiSimple[]>([]);
  const [autoDetectedActiveSession, setAutoDetectedActiveSession] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);

  // View Mode: "table" (default) or "grid"
  const [viewMode, setViewMode] = useState<"table" | "grid">("table");

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState("");
  const [filterSesi, setFilterSesi] = useState("SEMUA");
  const [filterStatus, setFilterStatus] = useState("SEMUA");

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Modal Create Form State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedPeserta, setSelectedPeserta] = useState<PesertaSimple | null>(null);
  const [searchPesertaModal, setSearchPesertaModal] = useState("");
  const [isManualMode, setIsManualMode] = useState(false);
  const [manualNama, setManualNama] = useState("");
  const [manualKelompok, setManualKelompok] = useState("");
  const [manualGrup, setManualGrup] = useState("");
  const [manualNfc, setManualNfc] = useState("");

  const [formSesiNama, setFormSesiNama] = useState("");
  const [formAlasan, setFormAlasan] = useState("");
  const [formTargetDurasi, setFormTargetDurasi] = useState("15");

  // Modal Detail / Edit
  const [detailRecord, setDetailRecord] = useState<PerizinanRecord | null>(null);
  const [detailCatatan, setDetailCatatan] = useState("");
  const [detailPetugas, setDetailPetugas] = useState("");
  const [isSavingDetail, setIsSavingDetail] = useState(false);

  // Modal Delete Confirmation
  const [recordToDelete, setRecordToDelete] = useState<PerizinanRecord | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Real-time ticking state for live stopwatch
  const [currentTime, setCurrentTime] = useState<Date>(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Compute Active Session Automatically based on current date & time
  const computeActiveSession = useCallback((sessions: SesiSimple[]): string => {
    if (!sessions || sessions.length === 0) return activeSessionName || "Sesi Umum";

    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    // 1. Try to find session matching today and current time
    const matched = sessions.find((s) => {
      if (s.tanggal !== todayStr) return false;
      if (!s.jam_mulai || !s.jam_selesai) return false;
      const [sh, sm] = s.jam_mulai.split(":").map(Number);
      const [eh, em] = s.jam_selesai.split(":").map(Number);
      if (isNaN(sh) || isNaN(sm) || isNaN(eh) || isNaN(em)) return false;
      const startM = sh * 60 + sm;
      const endM = eh * 60 + em;
      return currentMinutes >= startM && currentMinutes <= endM;
    });

    if (matched) return matched.nama_sesi;

    // 2. If prop activeSessionName is provided
    if (activeSessionName && activeSessionName.trim()) return activeSessionName.trim();

    // 3. Fallback: Return today's closest session or first session
    const todaySessions = sessions.filter((s) => s.tanggal === todayStr);
    if (todaySessions.length > 0) return todaySessions[0].nama_sesi;

    return sessions[0].nama_sesi;
  }, [activeSessionName]);

  // Load Data
  const loadData = useCallback(async () => {
    setRefreshing(true);
    try {
      // 1. Fetch Peserta from multiple sources to guarantee no missing names
      const [resPeserta, resNfc, resSesi, resPerizinan] = await Promise.all([
        supabase.from("peserta").select("*").order("id", { ascending: false }),
        supabase.from("nfc_peserta").select("*").order("id", { ascending: false }),
        supabase.from("jadwal_absensi").select("*").order("tanggal", { ascending: false }),
        supabase.from("perizinan_sesi").select("*").order("created_at", { ascending: false }),
      ]);

      // Merge peserta metadata into a unified lookup map
      const mapPeserta = new Map<string, PesertaSimple>();

      // From peserta table
      if (resPeserta.data) {
        resPeserta.data.forEach((p: any) => {
          const rawName = p.nama || p.nama_peserta || p.name || p.full_name || "";
          if (rawName && rawName.trim()) {
            const cleanName = toTitleCase(rawName);
            const idKey = String(p.id);
            const rawGrup = String(p.grup || p.tenda || "-").trim();
            const rawKel = String(p.kelompok || "-").trim();
            const grupVal = rawGrup !== "-" ? toTitleCase(rawGrup) : "-";
            const kelVal = rawKel !== "-" ? toTitleCase(rawKel) : "-";
            const uidVal = String(p.nfc_uid || p.smartcard || p.serial_number || p.uid_nfc || "").trim();

            mapPeserta.set(idKey, {
              id: idKey,
              nama: cleanName,
              kelompok: kelVal,
              grup: grupVal,
              jenis_kelamin: p.jenis_kelamin || "-",
              nfc_uid: uidVal,
              foto: p.foto || p.foto_url || undefined,
            });

            // Also map by lowercase name for cross-lookup
            mapPeserta.set(cleanName.toLowerCase(), {
              id: idKey,
              nama: cleanName,
              kelompok: kelVal,
              grup: grupVal,
              jenis_kelamin: p.jenis_kelamin || "-",
              nfc_uid: uidVal,
              foto: p.foto || p.foto_url || undefined,
            });
          }
        });
      }

      // From nfc_peserta table
      if (resNfc.data) {
        resNfc.data.forEach((n: any) => {
          const rawName = n.nama || n.nama_peserta || "";
          if (rawName && rawName.trim()) {
            const cleanName = rawName.trim();
            const keyById = n.peserta_id ? String(n.peserta_id) : "";
            const keyByName = cleanName.toLowerCase();

            const existing = (keyById ? mapPeserta.get(keyById) : null) || mapPeserta.get(keyByName) || {
              id: keyById || `nfc-${n.nfc_uid || Date.now()}`,
              nama: cleanName,
              kelompok: n.kelompok || "-",
              grup: n.grup || "-",
              nfc_uid: n.nfc_uid || "",
            };

            if (n.nfc_uid && !existing.nfc_uid) existing.nfc_uid = n.nfc_uid;
            if (n.kelompok && existing.kelompok === "-") existing.kelompok = n.kelompok;
            if (n.grup && existing.grup === "-") existing.grup = n.grup;

            if (keyById) mapPeserta.set(keyById, existing);
            mapPeserta.set(keyByName, existing);
          }
        });
      }

      // Deduplicate unique peserta list by name
      const uniqueByName = new Map<string, PesertaSimple>();
      mapPeserta.forEach((val) => {
        if (!uniqueByName.has(val.nama.toLowerCase())) {
          uniqueByName.set(val.nama.toLowerCase(), val);
        }
      });

      const finalPesertaList = Array.from(uniqueByName.values()).sort((a, b) =>
        a.nama.localeCompare(b.nama)
      );
      setPesertaList(finalPesertaList);

      // Parse sessions
      let loadedSessions: SesiSimple[] = [];
      if (resSesi.data && resSesi.data.length > 0) {
        loadedSessions = resSesi.data.map((s: any) => ({
          id: String(s.id),
          nama_sesi: s.nama_sesi,
          tanggal: s.tanggal,
          jam_mulai: s.jam_mulai,
          jam_selesai: s.jam_selesai,
          kategori: s.kategori,
        }));
        setSesiList(loadedSessions);
      }

      // Compute and set current active session
      const detected = computeActiveSession(loadedSessions);
      setAutoDetectedActiveSession(detected);

      // Parse perizinan records with fallback name mapping
      if (resPerizinan.data) {
        const mappedRecords: PerizinanRecord[] = resPerizinan.data.map((r: any) => {
          let resolvedName = (r.nama_peserta || r.nama || "").trim();
          if (!resolvedName && r.peserta_id) {
            const foundP = mapPeserta.get(String(r.peserta_id));
            if (foundP) resolvedName = foundP.nama;
          }
          if (!resolvedName) resolvedName = "Peserta Izin";
          resolvedName = toTitleCase(resolvedName);

          return {
            ...r,
            nama_peserta: resolvedName,
            nama: resolvedName,
            kelompok: r.kelompok ? toTitleCase(r.kelompok) : "-",
            grup: r.grup ? toTitleCase(r.grup) : "-",
            sesi_nama: r.sesi_nama ? toTitleCase(r.sesi_nama) : "-",
            alasan: r.alasan ? toTitleCase(r.alasan) : "-",
            petugas: r.petugas ? toTitleCase(r.petugas) : "-",
            target_durasi_menit: r.target_durasi_menit ? Number(r.target_durasi_menit) : undefined,
          };
        });
        setRecords(mappedRecords);
      } else {
        const local = localStorage.getItem("cai_perizinan_sesi");
        if (local) {
          try {
            setRecords(JSON.parse(local));
          } catch (e) {
            setRecords([]);
          }
        }
      }
    } catch (err) {
      console.error("Error loading perizinan data:", err);
      const local = localStorage.getItem("cai_perizinan_sesi");
      if (local) {
        try {
          setRecords(JSON.parse(local));
        } catch (e) {}
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [computeActiveSession]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Open Modal Create & Auto-Fill Sesi Aktif
  const handleOpenModal = () => {
    setSelectedPeserta(null);
    setSearchPesertaModal("");
    setIsManualMode(false);
    setManualNama("");
    setManualKelompok("");
    setManualGrup("");
    setManualNfc("");

    // Auto-select session currently running
    const currentActive = autoDetectedActiveSession || computeActiveSession(sesiList);
    setFormSesiNama(currentActive);

    setFormAlasan("");
    setFormTargetDurasi("15");
    setIsModalOpen(true);
  };

  // Handle Submit Form - captures exact current second when button is clicked
  const handleSubmitIzin = async (e: React.FormEvent) => {
    e.preventDefault();

    let namaPeserta = "";
    let kelompokPeserta = "-";
    let grupPeserta = "-";
    let nfcUid = "";
    let pesertaId: string | undefined = undefined;

    if (isManualMode) {
      if (!manualNama.trim()) {
        alert("Silakan masukkan Nama Peserta!");
        return;
      }
      namaPeserta = manualNama.trim();
      kelompokPeserta = manualKelompok.trim() || "-";
      grupPeserta = manualGrup.trim() || "-";
      nfcUid = manualNfc.trim();
    } else {
      if (!selectedPeserta) {
        alert("Silakan pilih salah satu peserta dari daftar atau gunakan Mode Input Manual!");
        return;
      }
      namaPeserta = selectedPeserta.nama;
      kelompokPeserta = selectedPeserta.kelompok || "-";
      grupPeserta = selectedPeserta.grup || "-";
      nfcUid = selectedPeserta.nfc_uid || "";
      pesertaId = selectedPeserta.id;
    }

    if (!formAlasan.trim()) {
      alert("Silakan tuliskan alasan izin singkat!");
      return;
    }

    const sesiFinal = formSesiNama.trim() || autoDetectedActiveSession || "Sesi Umum";

    setSaving(true);

    // Timer starts EXACTLY at this click instant
    const exactStartTime = new Date();
    const waktuMulaiIso = exactStartTime.toISOString();
    const todayStr = exactStartTime.toISOString().split("T")[0];
    const parsedTargetDuration = formTargetDurasi.trim() ? parseInt(formTargetDurasi.trim(), 10) : 15;

    const payload: any = {
      nama_peserta: namaPeserta,
      nama: namaPeserta,
      nfc_uid: nfcUid || null,
      kelompok: kelompokPeserta,
      grup: grupPeserta,
      sesi_nama: sesiFinal,
      tanggal: todayStr,
      alasan: formAlasan.trim(),
      keterangan: "",
      waktu_mulai: waktuMulaiIso,
      target_durasi_menit: !isNaN(parsedTargetDuration) ? parsedTargetDuration : 15,
      status: "Sedang Izin",
      petugas: "Panitia",
    };

    const isUUID = pesertaId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(pesertaId);
    if (isUUID) {
      payload.peserta_id = pesertaId;
    }

    try {
      const { data, error } = await supabase
        .from("perizinan_sesi")
        .insert([payload])
        .select()
        .single();

      if (error) {
        // Retry without peserta_id in case of foreign key constraint
        delete payload.peserta_id;
        const { data: data2, error: error2 } = await supabase
          .from("perizinan_sesi")
          .insert([payload])
          .select()
          .single();

        if (error2) {
          const localId = "local-" + Date.now();
          const createdRec: PerizinanRecord = {
            id: localId,
            ...payload,
            waktu_kembali: null,
            durasi_menit: 0,
          };
          const updated = [createdRec, ...records];
          setRecords(updated);
          localStorage.setItem("cai_perizinan_sesi", JSON.stringify(updated));
        } else if (data2) {
          const updated = [{ ...(data2 as PerizinanRecord), nama_peserta: namaPeserta }, ...records];
          setRecords(updated);
          localStorage.setItem("cai_perizinan_sesi", JSON.stringify(updated));
        }
      } else if (data) {
        const updated = [{ ...(data as PerizinanRecord), nama_peserta: namaPeserta }, ...records];
        setRecords(updated);
        localStorage.setItem("cai_perizinan_sesi", JSON.stringify(updated));
      }

      setIsModalOpen(false);
    } catch (err) {
      console.error("Error creating perizinan:", err);
      const localId = "local-" + Date.now();
      const createdRec: PerizinanRecord = {
        id: localId,
        ...payload,
        waktu_kembali: null,
        durasi_menit: 0,
      };
      const updated = [createdRec, ...records];
      setRecords(updated);
      localStorage.setItem("cai_perizinan_sesi", JSON.stringify(updated));
      setIsModalOpen(false);
    } finally {
      setSaving(false);
    }
  };

  // Mark Participant Returned
  const handleMarkReturn = async (item: PerizinanRecord) => {
    const returnTime = new Date();
    const startTime = new Date(item.waktu_mulai);
    const durationMinutes = Math.max(1, Math.round((returnTime.getTime() - startTime.getTime()) / (1000 * 60)));

    const updatePayload = {
      waktu_kembali: returnTime.toISOString(),
      durasi_menit: durationMinutes,
      status: "Kembali" as const,
    };

    // Optimistic UI update
    const updatedRecords = records.map((r) =>
      r.id === item.id ? { ...r, ...updatePayload } : r
    );
    setRecords(updatedRecords);
    localStorage.setItem("cai_perizinan_sesi", JSON.stringify(updatedRecords));

    try {
      await supabase
        .from("perizinan_sesi")
        .update(updatePayload)
        .eq("id", item.id);
    } catch (err) {
      console.error("Error marking return:", err);
    }
  };

  // Delete Record
  const handleConfirmDelete = async () => {
    if (!recordToDelete) return;
    setIsDeleting(true);

    const updated = records.filter((r) => r.id !== recordToDelete.id);
    setRecords(updated);
    localStorage.setItem("cai_perizinan_sesi", JSON.stringify(updated));

    try {
      await supabase.from("perizinan_sesi").delete().eq("id", recordToDelete.id);
    } catch (err) {
      console.error("Error deleting record:", err);
    } finally {
      setIsDeleting(false);
      setRecordToDelete(null);
    }
  };

  // Open Detail / Edit Modal
  const handleOpenDetail = (record: PerizinanRecord) => {
    setDetailRecord(record);
    setDetailCatatan(record.keterangan || "");
    setDetailPetugas(record.petugas || "");
  };

  // Save Detail Modal
  const handleSaveDetail = async () => {
    if (!detailRecord) return;
    setIsSavingDetail(true);

    const updatePayload = {
      keterangan: detailCatatan.trim(),
      petugas: detailPetugas.trim() || "Panitia Kehadiran",
    };

    const updated = records.map((r) =>
      r.id === detailRecord.id ? { ...r, ...updatePayload } : r
    );
    setRecords(updated);
    localStorage.setItem("cai_perizinan_sesi", JSON.stringify(updated));

    try {
      await supabase
        .from("perizinan_sesi")
        .update(updatePayload)
        .eq("id", detailRecord.id);
    } catch (err) {
      console.error("Error updating detail:", err);
    } finally {
      setIsSavingDetail(false);
      setDetailRecord(null);
    }
  };

  // Export to Excel
  const handleExportExcel = () => {
    if (records.length === 0) {
      alert("Belum ada data perizinan untuk diexport.");
      return;
    }

    const exportRows = filteredRecords.map((r, idx) => ({
      No: idx + 1,
      "Nama Peserta": r.nama_peserta || r.nama || "-",
      Kelompok: r.kelompok || "-",
      Grup: r.grup || "-",
      "UID Kartu": r.nfc_uid || "-",
      "Sesi Absensi": r.sesi_nama,
      Tanggal: r.tanggal,
      "Alasan Izin": r.alasan,
      "Target Waktu": r.target_durasi_menit ? `${r.target_durasi_menit} Menit` : "-",
      Keterangan: r.keterangan || "-",
      "Waktu Keluar": new Date(r.waktu_mulai).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }),
      "Waktu Kembali": r.waktu_kembali ? new Date(r.waktu_kembali).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "Belum Kembali",
      "Durasi Aktual": r.status === "Kembali" ? `${r.durasi_menit} menit` : "Sedang Izin",
      Status: r.status,
      "Petugas Pencatat": r.petugas || "-",
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Perizinan Sesi");

    const fileName = `Laporan_Perizinan_Sesi_CAI2026_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(workbook, fileName);
  };

  // Filtered Records
  const filteredRecords = useMemo(() => {
    return records.filter((r) => {
      if (filterSesi !== "SEMUA" && r.sesi_nama.toLowerCase() !== filterSesi.toLowerCase()) {
        return false;
      }
      if (filterStatus !== "SEMUA" && r.status !== filterStatus) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const nameStr = (r.nama_peserta || r.nama || "").toLowerCase();
        const kelStr = (r.kelompok || "").toLowerCase();
        const grupStr = (r.grup || "").toLowerCase();
        const uidStr = (r.nfc_uid || "").toLowerCase();
        const alasanStr = (r.alasan || "").toLowerCase();
        const ketStr = (r.keterangan || "").toLowerCase();
        const petStr = (r.petugas || "").toLowerCase();

        if (
          !nameStr.includes(q) &&
          !kelStr.includes(q) &&
          !grupStr.includes(q) &&
          !uidStr.includes(q) &&
          !alasanStr.includes(q) &&
          !ketStr.includes(q) &&
          !petStr.includes(q)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [records, filterSesi, filterStatus, searchQuery]);

  // Paginated records
  const totalPages = Math.max(1, Math.ceil(filteredRecords.length / pageSize));
  const paginatedRecords = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredRecords.slice(start, start + pageSize);
  }, [filteredRecords, currentPage, pageSize]);

  // Statistics Summary
  const stats = useMemo(() => {
    const total = filteredRecords.length;
    const sedangIzin = filteredRecords.filter((r) => r.status === "Sedang Izin").length;
    const sudahKembali = filteredRecords.filter((r) => r.status === "Kembali").length;
    const completedWithDuration = filteredRecords.filter((r) => r.status === "Kembali" && (r.durasi_menit || 0) > 0);
    const totalMinutes = completedWithDuration.reduce((acc, curr) => acc + (curr.durasi_menit || 0), 0);
    const avgDuration = completedWithDuration.length > 0 ? Math.round(totalMinutes / completedWithDuration.length) : 0;

    return { total, sedangIzin, sudahKembali, avgDuration };
  }, [filteredRecords]);

  // Lookup map for fast peserta metadata resolution
  const mapPeserta = useMemo(() => {
    const map = new Map<string, PesertaSimple>();
    pesertaList.forEach((p) => {
      if (p.id) map.set(String(p.id), p);
      if (p.nama) map.set(p.nama.toLowerCase().trim(), p);
    });
    return map;
  }, [pesertaList]);

  // Filtered Peserta inside Modal Picker
  const modalPesertaResults = useMemo(() => {
    if (!searchPesertaModal.trim()) {
      return pesertaList.slice(0, 50);
    }
    const q = searchPesertaModal.toLowerCase().trim();
    return pesertaList.filter((p) => {
      const matchNama = (p.nama || "").toLowerCase().includes(q);
      const matchKelompok = (p.kelompok || "").toLowerCase().includes(q);
      const matchGrup = (p.grup || "").toLowerCase().includes(q);
      const matchUid = (p.nfc_uid || "").toLowerCase().includes(q);
      return matchNama || matchKelompok || matchGrup || matchUid;
    });
  }, [pesertaList, searchPesertaModal]);

  // Safe Date / Time Formatters
  const formatTime = (timeStr?: string | null) => {
    if (!timeStr) return "-";
    try {
      const d = new Date(timeStr);
      if (isNaN(d.getTime())) return "-";
      return d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
    } catch {
      return "-";
    }
  };

  const formatDate = (timeStr?: string | null) => {
    if (!timeStr) return "-";
    try {
      const d = new Date(timeStr);
      if (isNaN(d.getTime())) return "-";
      return d.toLocaleDateString("id-ID", { day: "numeric", month: "short" });
    } catch {
      return "-";
    }
  };

  // Helper format live stopwatch
  const formatLiveStopwatch = (startTimeIso: string) => {
    if (!startTimeIso) return "00:00";
    try {
      const start = new Date(startTimeIso).getTime();
      if (isNaN(start)) return "00:00";
      const now = currentTime.getTime();
      const diffSec = Math.max(0, Math.floor((now - start) / 1000));
      const hours = Math.floor(diffSec / 3600);
      const minutes = Math.floor((diffSec % 3600) / 60);
      const seconds = diffSec % 60;

      if (hours > 0) {
        return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
      }
      return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    } catch {
      return "00:00";
    }
  };

  // Helper check if elapsed time exceeds target duration
  const isOverTargetDuration = (startTimeIso: string, targetMins?: number) => {
    if (!targetMins || targetMins <= 0 || !startTimeIso) return false;
    try {
      const start = new Date(startTimeIso).getTime();
      if (isNaN(start)) return false;
      const now = currentTime.getTime();
      const elapsedMin = Math.floor((now - start) / (1000 * 60));
      return elapsedMin >= targetMins;
    } catch {
      return false;
    }
  };

  return (
    <div className="w-full space-y-5 font-sans text-slate-800 pb-16">
      {/* 1. BREADCRUMB */}
      <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
        <span>Presensi</span>
        <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
        <span className="text-slate-800 font-semibold">Perizinan Sesi</span>
      </div>

      {/* 2. PAGE HEADER ROW (Clean, Polos & Seragam) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">
              Perizinan Sesi
            </h1>
            {autoDetectedActiveSession && (
              <span className="px-2.5 py-0.5 rounded-md text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#203598] animate-pulse" />
                Sesi Aktif: <strong>{autoDetectedActiveSession}</strong>
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Monitoring perizinan peserta selama sesi berlangsung dengan pencatatan durasi otomatis dan rekapitulasi data.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleExportExcel}
            className="px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-xl border border-slate-300 shadow-2xs flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer"
            title="Download Excel Spreadsheet"
          >
            <Download className="w-4 h-4 text-slate-600" />
            <span>Unduh Excel</span>
          </button>

          <button
            onClick={loadData}
            disabled={refreshing}
            className="px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-xl border border-slate-300 shadow-2xs flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-slate-600 ${refreshing ? "animate-spin text-[#203598]" : ""}`} />
            <span>Segarkan</span>
          </button>

          <button
            onClick={handleOpenModal}
            className="px-4 py-2 bg-[#203598] hover:bg-[#1a2c7d] text-white text-xs font-bold rounded-xl shadow-xs flex items-center gap-2 transition-all active:scale-95 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>+ Catat Izin Baru</span>
          </button>
        </div>
      </div>

      {/* 3. METRIC STAT CARDS (Clean, Neutral, Polos & Seragam) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Total Izin */}
        <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-2xs flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-slate-100 text-slate-700 border border-slate-200/80 flex items-center justify-center shrink-0">
            <List className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total Izin Sesi</div>
            <div className="text-xl sm:text-2xl font-extrabold text-slate-900 mt-0.5">{stats.total}</div>
          </div>
        </div>

        {/* Sedang Izin (Aktif) */}
        <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-2xs flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-slate-100 text-slate-800 border border-slate-200/80 flex items-center justify-center shrink-0">
            <Clock className="w-5 h-5 text-[#203598]" />
          </div>
          <div>
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#203598] animate-pulse" />
              Sedang Izin
            </div>
            <div className="text-xl sm:text-2xl font-extrabold text-slate-900 mt-0.5">
              {stats.sedangIzin} <span className="text-xs font-medium text-slate-500">Peserta</span>
            </div>
          </div>
        </div>

        {/* Sudah Kembali */}
        <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-2xs flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-slate-100 text-slate-800 border border-slate-200/80 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-5 h-5 text-slate-700" />
          </div>
          <div>
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Sudah Kembali</div>
            <div className="text-xl sm:text-2xl font-extrabold text-slate-900 mt-0.5">
              {stats.sudahKembali} <span className="text-xs font-medium text-slate-500">Peserta</span>
            </div>
          </div>
        </div>

        {/* Rata-Rata Durasi */}
        <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-2xs flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-slate-100 text-slate-800 border border-slate-200/80 flex items-center justify-center shrink-0">
            <Clock className="w-5 h-5 text-slate-600" />
          </div>
          <div>
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Rata-Rata Durasi</div>
            <div className="text-xl sm:text-2xl font-extrabold text-slate-900 mt-0.5">
              {stats.avgDuration} <span className="text-xs font-medium text-slate-500">Menit</span>
            </div>
          </div>
        </div>
      </div>

      {/* 4. SEARCH & FILTER CONTROL BAR */}
      <div className="bg-white rounded-2xl border border-slate-200 p-3.5 shadow-2xs space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Search Box */}
          <div className="relative flex-1 min-w-[240px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Cari nama peserta, kelompok, grup, alasan, catatan..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full pl-9 pr-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-1 focus:ring-[#203598] focus:bg-white text-slate-800 placeholder:text-slate-400"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold"
              >
                ✕
              </button>
            )}
          </div>

          {/* Filter Dropdowns & View Switcher */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Sesi Filter */}
            <select
              value={filterSesi}
              onChange={(e) => {
                setFilterSesi(e.target.value);
                setCurrentPage(1);
              }}
              className="text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-medium text-slate-700 focus:outline-hidden focus:bg-white"
            >
              <option value="SEMUA">Semua Sesi</option>
              {sesiList.map((s) => (
                <option key={s.id} value={s.nama_sesi}>
                  {s.nama_sesi} ({s.tanggal})
                </option>
              ))}
              <option value="Sesi Umum">Sesi Umum</option>
            </select>

            {/* Status Filter */}
            <select
              value={filterStatus}
              onChange={(e) => {
                setFilterStatus(e.target.value);
                setCurrentPage(1);
              }}
              className="text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-medium text-slate-700 focus:outline-hidden focus:bg-white"
            >
              <option value="SEMUA">Semua Status</option>
              <option value="Sedang Izin">Sedang Izin</option>
              <option value="Kembali">Sudah Kembali</option>
            </select>

            {/* View Mode Toggle Button */}
            <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
              <button
                type="button"
                onClick={() => setViewMode("table")}
                className={`p-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                  viewMode === "table"
                    ? "bg-white text-[#203598] shadow-xs font-bold"
                    : "text-slate-500 hover:text-slate-800"
                }`}
                title="Tampilan Tabel"
              >
                <List className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Tabel</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode("grid")}
                className={`p-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                  viewMode === "grid"
                    ? "bg-white text-[#203598] shadow-xs font-bold"
                    : "text-slate-500 hover:text-slate-800"
                }`}
                title="Tampilan Kartu Grid"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Kartu</span>
              </button>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-slate-500 pt-1 border-t border-slate-100">
          <div>
            Menampilkan <strong className="text-slate-800">{filteredRecords.length}</strong> catatan perizinan
          </div>
          {(searchQuery || filterSesi !== "SEMUA" || filterStatus !== "SEMUA") && (
            <button
              onClick={() => {
                setSearchQuery("");
                setFilterSesi("SEMUA");
                setFilterStatus("SEMUA");
                setCurrentPage(1);
              }}
              className="text-[#203598] hover:underline font-bold text-xs cursor-pointer"
            >
              Reset Filter
            </button>
          )}
        </div>
      </div>

      {/* 5. MAIN DATA VIEW: TABLE (DEFAULT) & GRID */}
      {loading ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400 shadow-xs">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto text-[#203598] mb-3" />
          <p className="text-sm font-semibold text-slate-700">Memuat data perizinan sesi...</p>
          <p className="text-xs text-slate-400 mt-0.5">Menyelaraskan data peserta & jadwal</p>
        </div>
      ) : filteredRecords.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-xs">
          <div className="w-14 h-14 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3 border border-slate-200/80">
            <Clock className="w-7 h-7" />
          </div>
          <h3 className="text-base font-bold text-slate-800">Tidak ada data perizinan ditemukan</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
            Tidak ada catatan izin yang cocok dengan filter yang Anda gunakan. Klik tombol <strong>+ Catat Izin Baru</strong> untuk mencatat izin peserta.
          </p>
        </div>
      ) : viewMode === "table" ? (
        /* TABLE VIEW (Standard, Polos & Terstruktur) */
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50/90 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-3.5 text-center w-12">No</th>
                  <th className="py-3 px-4 min-w-[200px]">Nama Peserta</th>
                  <th className="py-3 px-3.5 min-w-[140px]">Sesi Presensi</th>
                  <th className="py-3 px-3.5 min-w-[150px]">Alasan Izin</th>
                  <th className="py-3 px-3.5 min-w-[110px]">Waktu Keluar</th>
                  <th className="py-3 px-3.5 min-w-[110px]">Waktu Kembali</th>
                  <th className="py-3 px-3.5 min-w-[140px]">Durasi / Stopwatch</th>
                  <th className="py-3 px-3.5 min-w-[110px] text-center">Status</th>
                  <th className="py-3 px-3.5 min-w-[160px]">Catatan / Petugas</th>
                  <th className="py-3 px-4 text-center min-w-[130px] sticky right-0 bg-slate-50/95 shadow-xs">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-150">
                {paginatedRecords.map((item, idx) => {
                  const rowNumber = (currentPage - 1) * pageSize + idx + 1;
                  const isOngoing = item.status === "Sedang Izin";
                  const displayName = item.nama_peserta || item.nama || "Peserta Izin";
                  const isOverLimit = isOngoing && isOverTargetDuration(item.waktu_mulai, item.target_durasi_menit);

                  const pMeta = (item.peserta_id ? mapPeserta.get(item.peserta_id) : null) || mapPeserta.get(displayName.toLowerCase());
                  const fotoUrl = pMeta?.foto;

                  return (
                    <tr
                      key={item.id}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        isOngoing ? "bg-slate-50/40" : ""
                      }`}
                    >
                      {/* No */}
                      <td className="py-3 px-3.5 text-center text-slate-400 font-semibold text-[11px]">
                        {rowNumber}
                      </td>

                      {/* Nama Peserta & Detail Info */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg overflow-hidden bg-slate-100 text-slate-700 border border-slate-200 flex items-center justify-center font-bold text-xs shrink-0">
                            {fotoUrl ? (
                              <img src={fotoUrl} alt={displayName} className="w-full h-full object-cover" />
                            ) : (
                              <span>{displayName.charAt(0).toUpperCase()}</span>
                            )}
                          </div>
                          <div>
                            <div className="font-bold text-slate-900 text-xs">
                              {displayName}
                            </div>
                            <div className="flex flex-wrap items-center gap-1 text-[10px] text-slate-500 mt-0.5">
                              <span>{item.kelompok || "-"}</span>
                              <span>•</span>
                              <span>Grup: <strong>{item.grup || "-"}</strong></span>
                              {item.nfc_uid && (
                                <>
                                  <span>•</span>
                                  <span className="font-mono text-[9px] text-slate-600 bg-slate-100 px-1 rounded">
                                    {item.nfc_uid}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Sesi */}
                      <td className="py-3 px-3.5">
                        <span className="font-semibold text-slate-800 block text-xs truncate max-w-[140px]">
                          {item.sesi_nama}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {item.tanggal || "-"}
                        </span>
                      </td>

                      {/* Alasan Izin (Manual Text) */}
                      <td className="py-3 px-3.5">
                        <span className="inline-block px-2.5 py-1 rounded-md text-[11px] font-semibold bg-slate-100 text-slate-800 border border-slate-200 max-w-[170px] truncate" title={item.alasan}>
                          {item.alasan || "-"}
                        </span>
                        {item.target_durasi_menit ? (
                          <span className="block text-[10px] text-slate-400 mt-0.5">
                            Target: {item.target_durasi_menit}m
                          </span>
                        ) : null}
                      </td>

                      {/* Waktu Mulai */}
                      <td className="py-3 px-3.5">
                        <div className="font-mono text-slate-800 font-semibold text-xs">
                          {formatTime(item.waktu_mulai)}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {formatDate(item.waktu_mulai)}
                        </div>
                      </td>

                      {/* Waktu Kembali */}
                      <td className="py-3 px-3.5">
                        {item.waktu_kembali ? (
                          <>
                            <div className="font-mono text-slate-800 font-semibold text-xs">
                              {formatTime(item.waktu_kembali)}
                            </div>
                            <div className="text-[10px] text-slate-500 font-medium">
                              Selesai
                            </div>
                          </>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-md">
                            <Clock className="w-3 h-3 text-slate-400" />
                            Belum Kembali
                          </span>
                        )}
                      </td>

                      {/* Durasi / Live Stopwatch */}
                      <td className="py-3 px-3.5">
                        {isOngoing ? (
                          <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border font-mono font-bold text-xs shadow-2xs ${
                            isOverLimit
                              ? "bg-rose-50 border-rose-200 text-rose-800"
                              : "bg-slate-100 border-slate-200 text-slate-800"
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${isOverLimit ? "bg-rose-500 animate-pulse" : "bg-[#203598] animate-pulse"}`} />
                            <span>{formatLiveStopwatch(item.waktu_mulai)}</span>
                            {item.target_durasi_menit ? (
                              <span className="text-[10px] text-slate-500 font-normal">
                                /{item.target_durasi_menit}m
                              </span>
                            ) : null}
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 font-medium text-xs">
                            <span>{item.durasi_menit || 0} Menit</span>
                          </span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-3 px-3.5 text-center">
                        {isOngoing ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-800 border border-slate-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#203598] animate-pulse" />
                            Sedang Izin
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                            <Check className="w-3 h-3 text-slate-600" />
                            Kembali
                          </span>
                        )}
                      </td>

                      {/* Catatan / Petugas */}
                      <td className="py-3 px-3.5">
                        <div className="text-[11px] text-slate-700 truncate max-w-[160px]" title={item.keterangan || "Tidak ada catatan"}>
                          {item.keterangan ? `"${item.keterangan}"` : <span className="text-slate-400 italic">-</span>}
                        </div>
                        {item.petugas && (
                          <div className="text-[10px] text-slate-400 truncate max-w-[160px]">
                            Oleh: <span className="font-medium text-slate-600">{item.petugas}</span>
                          </div>
                        )}
                      </td>

                      {/* Aksi */}
                      <td className="py-3 px-4 text-center sticky right-0 bg-white/95 shadow-xs">
                        <div className="flex items-center justify-center gap-1">
                          {isOngoing && (
                            <button
                              onClick={() => handleMarkReturn(item)}
                              className="px-2.5 py-1.5 bg-[#203598] hover:bg-[#1a2c7d] text-white rounded-lg text-[11px] font-semibold flex items-center gap-1 shadow-2xs transition-all active:scale-95 cursor-pointer"
                              title="Tandai Peserta Sudah Kembali"
                            >
                              <Check className="w-3 h-3" />
                              <span>Kembali</span>
                            </button>
                          )}

                          <button
                            onClick={() => handleOpenDetail(item)}
                            className="p-1.5 text-slate-500 hover:text-[#203598] hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                            title="Lihat Detail / Edit Catatan"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          <button
                            onClick={() => setRecordToDelete(item)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                            title="Hapus Catatan Izin"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination Footer */}
          <div className="p-3.5 bg-slate-50/80 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-600">
            <div className="flex items-center gap-2">
              <span>Baris:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="bg-white border border-slate-300 rounded-lg px-2 py-1 font-semibold text-slate-700 focus:outline-hidden"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
              <span className="text-slate-400">|</span>
              <span>
                Menampilkan {(currentPage - 1) * pageSize + 1} -{" "}
                {Math.min(currentPage * pageSize, filteredRecords.length)} dari {filteredRecords.length} data
              </span>
            </div>

            <div className="flex items-center gap-1.5 self-end sm:self-auto">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:pointer-events-none transition-colors font-medium flex items-center gap-1 cursor-pointer"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Sebelumnya</span>
              </button>

              <span className="px-3 py-1 font-bold text-slate-800">
                {currentPage} / {totalPages}
              </span>

              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:pointer-events-none transition-colors font-medium flex items-center gap-1 cursor-pointer"
              >
                <span className="hidden sm:inline">Berikutnya</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* GRID CARD VIEW (Clean, Polos & Seragam) */
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {paginatedRecords.map((item) => {
              const isOngoing = item.status === "Sedang Izin";
              const displayName = item.nama_peserta || item.nama || "Peserta Izin";
              const isOverLimit = isOngoing && isOverTargetDuration(item.waktu_mulai, item.target_durasi_menit);

              return (
                <div
                  key={item.id}
                  className="bg-white rounded-2xl border border-slate-200 shadow-2xs flex flex-col justify-between overflow-hidden hover:border-slate-300 transition-all"
                >
                  {/* Top Status & Reason Badge */}
                  <div className="p-3.5 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between gap-2">
                    <span className="inline-block px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-slate-100 text-slate-800 border border-slate-200 truncate max-w-[180px]">
                      {item.alasan || "-"}
                    </span>

                    {isOngoing ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-800 border border-slate-200">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#203598] animate-pulse" />
                        Sedang Izin
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                        <Check className="w-3 h-3 text-slate-600" />
                        Kembali ({item.durasi_menit}m)
                      </span>
                    )}
                  </div>

                  {/* Body Content */}
                  <div className="p-3.5 flex-1 space-y-2.5">
                    <div>
                      <h3 className="font-bold text-sm text-slate-900 line-clamp-1">{displayName}</h3>
                      <div className="flex flex-wrap items-center gap-1 text-[11px] text-slate-500 mt-0.5">
                        <span>{item.kelompok || "-"}</span>
                        <span>•</span>
                        <span>Grup: <strong>{item.grup || "-"}</strong></span>
                        {item.nfc_uid && (
                          <>
                            <span>•</span>
                            <span className="font-mono text-[10px] text-slate-600 bg-slate-100 px-1 rounded">
                              {item.nfc_uid}
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-150 text-xs space-y-1.5">
                      <div className="flex items-center justify-between text-slate-600">
                        <span className="text-[10px] uppercase font-bold text-slate-400">Sesi:</span>
                        <span className="font-semibold text-slate-800 truncate max-w-[180px]">{item.sesi_nama}</span>
                      </div>

                      <div className="flex items-center justify-between text-slate-600">
                        <span className="text-[10px] uppercase font-bold text-slate-400">Keluar:</span>
                        <span className="font-mono font-medium text-slate-700">
                          {formatTime(item.waktu_mulai)} WIB
                        </span>
                      </div>

                      {item.waktu_kembali ? (
                        <div className="flex items-center justify-between text-slate-600">
                          <span className="text-[10px] uppercase font-bold text-slate-400">Kembali:</span>
                          <span className="font-mono font-medium text-slate-800">
                            {formatTime(item.waktu_kembali)} WIB
                          </span>
                        </div>
                      ) : null}

                      {/* Live Stopwatch Timer */}
                      {isOngoing ? (
                        <div className={`p-2 rounded-lg border flex items-center justify-between mt-1 ${
                          isOverLimit ? "bg-rose-50 border-rose-200" : "bg-white border-slate-200"
                        }`}>
                          <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-700">
                            <Clock className="w-3.5 h-3.5 text-[#203598]" />
                            <span>Stopwatch:</span>
                          </div>
                          <div className="font-mono font-bold text-sm text-slate-900 tracking-wider">
                            {formatLiveStopwatch(item.waktu_mulai)}
                            {item.target_durasi_menit ? (
                              <span className="text-[10px] text-slate-400 font-normal ml-1">
                                /{item.target_durasi_menit}m
                              </span>
                            ) : null}
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between text-slate-600 pt-1 border-t border-slate-200">
                          <span className="text-[10px] uppercase font-bold text-slate-400">Durasi:</span>
                          <span className="font-bold text-slate-900">{item.durasi_menit} Menit</span>
                        </div>
                      )}
                    </div>

                    {item.keterangan ? (
                      <div className="text-[11px] text-slate-600 bg-white p-2 rounded-lg border border-slate-200 italic">
                        &quot;{item.keterangan}&quot;
                      </div>
                    ) : null}
                  </div>

                  {/* Footer Action */}
                  <div className="p-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleOpenDetail(item)}
                        className="p-1.5 text-slate-500 hover:text-[#203598] hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                        title="Lihat Detail"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setRecordToDelete(item)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                        title="Hapus Catatan Izin"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    {isOngoing ? (
                      <button
                        onClick={() => handleMarkReturn(item)}
                        className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-[#203598] hover:bg-[#1a2c7d] transition-colors shadow-2xs cursor-pointer"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Tandai Kembali</span>
                      </button>
                    ) : (
                      <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                        Selesai
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination for Grid */}
          <div className="flex items-center justify-between text-xs text-slate-600 pt-2">
            <span>
              Menampilkan {paginatedRecords.length} dari {filteredRecords.length} data
            </span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:pointer-events-none"
              >
                Sebelumnya
              </button>
              <span className="font-bold">
                {currentPage} / {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-3 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:pointer-events-none"
              >
                Berikutnya
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. MODAL CATAT IZIN BARU (Tampilan Form Standar, Polos & Seragam) */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full overflow-hidden animate-in fade-in zoom-in duration-150 my-auto">
            {/* Header Modal */}
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-[#203598] text-white flex items-center justify-center font-bold">
                  <Plus className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm sm:text-base text-slate-900">
                    Catat Perizinan Sesi Peserta
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Timer stopwatch akan langsung berjalan saat formulir disimpan
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitIzin} className="p-4 sm:p-5 space-y-4 max-h-[80vh] overflow-y-auto">
              {/* Field 1: Pilih / Input Nama Peserta */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-slate-700">
                    Nama Peserta <span className="text-rose-500">*</span>
                  </label>
                  <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-[11px]">
                    <button
                      type="button"
                      onClick={() => setIsManualMode(false)}
                      className={`px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                        !isManualMode
                          ? "bg-white text-[#203598] shadow-xs font-bold"
                          : "text-slate-500 hover:text-slate-800"
                      }`}
                    >
                      Pilih dari Data ({pesertaList.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsManualMode(true)}
                      className={`px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                        isManualMode
                          ? "bg-white text-[#203598] shadow-xs font-bold"
                          : "text-slate-500 hover:text-slate-800"
                      }`}
                    >
                      Tulis Manual
                    </button>
                  </div>
                </div>

                {/* MODE 1: PILIH DARI DATA PESERTA */}
                {!isManualMode ? (
                  <div>
                    {selectedPeserta ? (
                      <div className="p-3 bg-slate-50 border border-slate-300 rounded-xl flex items-center justify-between">
                        <div className="space-y-0.5">
                          <div className="font-bold text-xs text-slate-900 flex items-center gap-1.5">
                            <CheckCircle2 className="w-3.5 h-3.5 text-slate-700 shrink-0" />
                            <span>{selectedPeserta.nama}</span>
                          </div>
                          <div className="text-[11px] text-slate-600">
                            Kelompok: <span className="font-semibold">{selectedPeserta.kelompok || "-"}</span> • Grup: <span className="font-semibold">{selectedPeserta.grup || "-"}</span>
                            {selectedPeserta.nfc_uid && (
                              <span className="ml-1 text-slate-500 font-mono text-[10px]">
                                (UID: {selectedPeserta.nfc_uid})
                              </span>
                            )}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setSelectedPeserta(null)}
                          className="text-xs font-semibold text-slate-700 hover:text-slate-900 bg-white px-2.5 py-1 rounded-lg border border-slate-300 hover:bg-slate-100 transition-colors shadow-2xs cursor-pointer"
                        >
                          Ganti
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex items-center gap-1.5">
                          <div className="relative flex-1">
                            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                            <input
                              type="text"
                              placeholder="Ketik nama atau kelompok untuk mencari..."
                              value={searchPesertaModal}
                              onChange={(e) => setSearchPesertaModal(e.target.value)}
                              className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-xl focus:outline-hidden focus:ring-1 focus:ring-[#203598]"
                            />
                            {searchPesertaModal && (
                              <button
                                type="button"
                                onClick={() => setSearchPesertaModal("")}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
                              >
                                ✕
                              </button>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={loadData}
                            title="Muat Ulang Peserta"
                            disabled={refreshing}
                            className="p-1.5 text-slate-600 hover:text-[#203598] bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-xl transition-colors flex items-center gap-1 text-[11px] font-semibold cursor-pointer"
                          >
                            <RotateCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin text-[#203598]" : ""}`} />
                          </button>
                        </div>

                        {/* List Peserta */}
                        <div className="max-h-40 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-xl bg-white shadow-inner">
                          {modalPesertaResults.length === 0 ? (
                            <div className="p-3 text-center space-y-1">
                              <p className="text-xs text-slate-400">
                                Peserta &ldquo;{searchPesertaModal}&rdquo; tidak ditemukan.
                              </p>
                              <button
                                type="button"
                                onClick={() => {
                                  setManualNama(searchPesertaModal);
                                  setIsManualMode(true);
                                }}
                                className="text-xs font-bold text-[#203598] hover:underline cursor-pointer"
                              >
                                Gunakan Mode Tulis Manual ➔
                              </button>
                            </div>
                          ) : (
                            modalPesertaResults.map((p) => (
                              <div
                                key={p.id + p.nama}
                                onClick={() => setSelectedPeserta(p)}
                                className="p-2.5 hover:bg-slate-50 cursor-pointer transition-colors flex items-center justify-between group"
                              >
                                <div>
                                  <div className="font-bold text-xs text-slate-900 group-hover:text-[#203598]">
                                    {p.nama}
                                  </div>
                                  <div className="text-[10px] text-slate-500 flex items-center gap-1.5 mt-0.5">
                                    <span>{p.kelompok || "-"}</span>
                                    <span>•</span>
                                    <span>Grup {p.grup || "-"}</span>
                                  </div>
                                </div>
                                <span className="text-[10px] font-semibold text-slate-700 bg-slate-100 group-hover:bg-[#203598] group-hover:text-white px-2 py-0.5 rounded transition-colors">
                                  Pilih
                                </span>
                              </div>
                            ))
                          )}
                        </div>
                        <div className="text-[10px] text-slate-400 px-1">
                          * Klik nama peserta dari daftar di atas
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  /* MODE 2: TULIS MANUAL */
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        Nama Lengkap Peserta <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="Masukkan nama lengkap peserta..."
                        value={manualNama}
                        onChange={(e) => setManualNama(e.target.value)}
                        className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-[#203598]"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">
                          Kelompok / Desa
                        </label>
                        <input
                          type="text"
                          placeholder="Kelompok..."
                          value={manualKelompok}
                          onChange={(e) => setManualKelompok(e.target.value)}
                          className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-slate-800 focus:outline-hidden"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">
                          Grup
                        </label>
                        <input
                          type="text"
                          placeholder="Grup..."
                          value={manualGrup}
                          onChange={(e) => setManualGrup(e.target.value)}
                          className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-slate-800 focus:outline-hidden"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Field 2: Sesi Presensi (Otomatis Sesuai Sesi Berjalan) */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-slate-700">
                    Sesi Presensi <span className="text-rose-500">*</span>
                  </label>
                  <span className="text-[11px] font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                    Otomatis Sesi Berjalan
                  </span>
                </div>
                <select
                  value={formSesiNama}
                  onChange={(e) => setFormSesiNama(e.target.value)}
                  required
                  className="w-full text-xs bg-white border border-slate-300 rounded-xl px-3 py-2 text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-[#203598]"
                >
                  {sesiList.map((s) => (
                    <option key={s.id} value={s.nama_sesi}>
                      {s.nama_sesi} ({s.tanggal})
                    </option>
                  ))}
                  <option value="Sesi Umum">Sesi Umum / Di Luar Jadwal</option>
                </select>
              </div>

              {/* Field 3: Alasan Izin (Ditulis Manual Jawaban Singkat) */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700">
                  Alasan Izin (Jawaban Singkat) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Sakit demam, MCK, Mengambil barang di tenda, Tugas panitia..."
                  value={formAlasan}
                  onChange={(e) => setFormAlasan(e.target.value)}
                  className="w-full text-xs bg-white border border-slate-300 rounded-xl px-3 py-2 text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-[#203598]"
                />
                {/* Quick chip suggestions */}
                <div className="flex flex-wrap gap-1 pt-1">
                  {["Sakit / Medis", "MCK / Toilet", "Mengambil Barang", "Tugas Panitia", "Keperluan Keluarga"].map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => setFormAlasan(chip)}
                      className="text-[10px] px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded border border-slate-200 transition-colors cursor-pointer"
                    >
                      + {chip}
                    </button>
                  ))}
                </div>
              </div>

              {/* Field 4: Durasi Izin (Input Manual dalam Menit) */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-slate-700">
                    Target Durasi Izin (Menit) <span className="text-slate-400 font-normal">(Input Manual)</span>
                  </label>
                  <span className="text-[11px] text-slate-400">Estimasi waktu kembali</span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    max="720"
                    placeholder="Contoh: 15"
                    value={formTargetDurasi}
                    onChange={(e) => setFormTargetDurasi(e.target.value)}
                    className="w-full text-xs bg-white border border-slate-300 rounded-xl px-3 py-2 text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-[#203598]"
                  />
                  <span className="text-xs font-bold text-slate-600 shrink-0">Menit</span>
                </div>
                <div className="flex items-center gap-1.5 pt-0.5">
                  {[10, 15, 20, 30, 45, 60].map((mins) => (
                    <button
                      key={mins}
                      type="button"
                      onClick={() => setFormTargetDurasi(String(mins))}
                      className={`px-2 py-0.5 rounded text-[11px] font-semibold border transition-colors cursor-pointer ${
                        formTargetDurasi === String(mins)
                          ? "bg-[#203598] text-white border-[#203598]"
                          : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                      }`}
                    >
                      {mins}m
                    </button>
                  ))}
                </div>
              </div>

              {/* Field 5: Waktu Mulai & Stopwatch Info */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-[#203598]" />
                    <span>Waktu Mulai:</span>
                  </span>
                  <span className="font-mono text-xs font-bold text-slate-800 bg-white px-2 py-0.5 rounded border border-slate-200">
                    {currentTime.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" })} WIB
                  </span>
                </div>
                <p className="text-[11px] text-slate-500">
                  Timer stopwatch otomatis dihitung mulai tepat saat Anda mengklik tombol <strong>Simpan Perizinan</strong>.
                </p>
              </div>

              {/* Action Buttons Modal */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving || (!isManualMode && !selectedPeserta) || (isManualMode && !manualNama.trim())}
                  className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-[#203598] hover:bg-[#1a2c7d] disabled:opacity-50 transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
                >
                  {saving ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Play className="w-3.5 h-3.5 fill-white" />
                  )}
                  <span>{saving ? "Menyimpan..." : "Simpan Perizinan & Mulai Timer"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 7. MODAL DETAIL / EDIT CATATAN */}
      {detailRecord && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in duration-150 my-auto">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 border border-slate-200 flex items-center justify-center font-bold">
                  <Eye className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-900">
                    Detail Perizinan
                  </h3>
                  <p className="text-[10px] text-slate-500">ID: {detailRecord.id}</p>
                </div>
              </div>
              <button
                onClick={() => setDetailRecord(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 sm:p-5 space-y-3.5 text-xs">
              {/* Peserta Info */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                <div className="font-bold text-slate-900 text-sm">
                  {detailRecord.nama_peserta || detailRecord.nama || "-"}
                </div>
                <div className="text-slate-500 text-[11px] flex flex-wrap gap-2">
                  <span>Kelompok: <strong>{detailRecord.kelompok || "-"}</strong></span>
                  <span>•</span>
                  <span>Grup: <strong>{detailRecord.grup || "-"}</strong></span>
                  {detailRecord.nfc_uid && (
                    <span>• UID: <strong className="font-mono text-slate-700">{detailRecord.nfc_uid}</strong></span>
                  )}
                </div>
              </div>

              {/* Sesi & Alasan */}
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                  <span className="text-slate-400 font-bold block">Sesi Presensi:</span>
                  <span className="font-semibold text-slate-800">{detailRecord.sesi_nama}</span>
                </div>
                <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                  <span className="text-slate-400 font-bold block">Alasan Izin:</span>
                  <span className="font-semibold text-slate-800">
                    {detailRecord.alasan || "-"}
                  </span>
                </div>
              </div>

              {/* Waktu Mulai & Selesai */}
              <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1 text-[11px]">
                <div className="flex justify-between">
                  <span className="text-slate-500">Waktu Mulai:</span>
                  <span className="font-mono font-bold text-slate-800">
                    {formatTime(detailRecord.waktu_mulai)} WIB
                  </span>
                </div>
                {detailRecord.waktu_kembali && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Waktu Kembali:</span>
                    <span className="font-mono font-bold text-slate-800">
                      {formatTime(detailRecord.waktu_kembali)} WIB
                    </span>
                  </div>
                )}
                <div className="flex justify-between pt-1 border-t border-slate-200">
                  <span className="text-slate-500">Durasi:</span>
                  <span className="font-bold text-slate-900">
                    {detailRecord.status === "Sedang Izin"
                      ? formatLiveStopwatch(detailRecord.waktu_mulai)
                      : `${detailRecord.durasi_menit} Menit`}
                  </span>
                </div>
              </div>

              {/* Catatan / Keterangan Edit */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Catatan / Keterangan Tambahan
                </label>
                <textarea
                  rows={2}
                  value={detailCatatan}
                  onChange={(e) => setDetailCatatan(e.target.value)}
                  placeholder="Tambahkan atau perbarui catatan izin..."
                  className="w-full text-xs bg-white border border-slate-300 rounded-xl p-2.5 text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-[#203598]"
                />
              </div>

              {/* Petugas */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Petugas Pencatat
                </label>
                <input
                  type="text"
                  value={detailPetugas}
                  onChange={(e) => setDetailPetugas(e.target.value)}
                  placeholder="Nama petugas panitia"
                  className="w-full text-xs bg-white border border-slate-300 rounded-xl px-3 py-2 text-slate-800 focus:outline-hidden"
                />
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-2">
              {detailRecord.status === "Sedang Izin" ? (
                <button
                  type="button"
                  onClick={() => {
                    handleMarkReturn(detailRecord);
                    setDetailRecord(null);
                  }}
                  className="px-3.5 py-2 bg-[#203598] hover:bg-[#1a2c7d] text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-2xs"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Tandai Kembali</span>
                </button>
              ) : (
                <div />
              )}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setDetailRecord(null)}
                  className="px-3 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-200 cursor-pointer"
                >
                  Tutup
                </button>
                <button
                  type="button"
                  onClick={handleSaveDetail}
                  disabled={isSavingDetail}
                  className="px-4 py-2 bg-[#203598] hover:bg-[#1a2c7d] text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-2xs"
                >
                  {isSavingDetail && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>{isSavingDetail ? "Menyimpan..." : "Simpan"}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 8. MODAL KONFIRMASI HAPUS (Custom UI) */}
      {recordToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-sm w-full p-5 space-y-4 animate-in fade-in zoom-in duration-150">
            <div className="w-11 h-11 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
              <Trash2 className="w-5 h-5" />
            </div>
            <div className="text-center space-y-1">
              <h3 className="font-bold text-sm sm:text-base text-slate-900">
                Hapus Catatan Perizinan?
              </h3>
              <p className="text-xs text-slate-500">
                Apakah Anda yakin ingin menghapus data perizinan untuk peserta{" "}
                <strong className="text-slate-900">{recordToDelete.nama_peserta || recordToDelete.nama || "-"}</strong>?
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRecordToDelete(null)}
                disabled={isDeleting}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-xs shadow-rose-600/20"
              >
                {isDeleting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>{isDeleting ? "Menghapus..." : "Ya, Hapus"}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
