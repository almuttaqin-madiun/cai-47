"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Image from "next/image";
import {
  Nfc,
  AlertCircle,
  Users,
  Activity,
  UserPlus,
  Table,
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Usb,
  CheckCircle2,
  Volume2,
  PieChart,
  Clock,
  LogOut,
  ShieldCheck,
  UserCheck,
  Smartphone,
  HelpCircle,
  Radio,
  Sparkles,
  Info,
  ExternalLink,
  Copy,
  Search,
  RefreshCw,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { getAllUidCandidates, hexToDecimal, toTitleCase } from "@/lib/utils";
import InputPesertaForm from "./InputPesertaForm";
import DataPesertaTable from "./DataPesertaTable";
import InputNFCPesertaForm from "./InputNFCPesertaForm";
import ManajemenSesi, { SesiAbsensi, calculateWaktuTelat } from "./ManajemenSesi";
import RekapPresensi from "./RekapPresensi";
import SuccessDialog from "./SuccessDialog";
import PlottingPeserta from "./PlottingPeserta";
import StatistikKehadiran from "./StatistikKehadiran";
import PerizinanSesi from "./PerizinanSesi";
import AuthRoleModal, { UserSession, RoleType, normalizeRoleKey } from "./AuthRoleModal";

interface AttendanceRecord {
  id: string;
  serialNumber: string;
  timestamp: Date;
  status: "success" | "error";
  statusKehadiran?: string;
  menitTerlambat?: number;
  photoUrl?: string;
  name?: string;
  sesiNama?: string;
}

// Role-to-Tabs Permissions Matrix
const ROLE_ALLOWED_TABS: Record<string, string[]> = {
  kesekretariatan: [
    "presensi",
    "presensi_grafik",
    "presensi_izin",
    "peserta",
    "input",
    "nfc",
    "plotting_tenda",
    "plotting_fgd",
    "jadwal_materi",
    "jadwal_makan",
    "jadwal_sholat",
    "rekap_presensi",
    "sesi",
    "statistik",
  ],
  kesekertariatan: [
    "presensi",
    "presensi_grafik",
    "presensi_izin",
    "peserta",
    "input",
    "nfc",
    "plotting_tenda",
    "plotting_fgd",
    "jadwal_materi",
    "jadwal_makan",
    "jadwal_sholat",
    "rekap_presensi",
    "sesi",
    "statistik",
  ],
  acara: [
    "jadwal_materi",
    "jadwal_makan",
    "jadwal_sholat",
    "presensi_grafik",
    "presensi_izin",
    "rekap_presensi",
    "sesi",
    "statistik",
  ],
  operator: [
    "presensi",
    "presensi_grafik",
    "presensi_izin",
    "nfc",
    "peserta",
    "statistik",
  ],
  "steering committee": [
    "presensi_grafik",
    "peserta",
    "jadwal_materi",
    "jadwal_makan",
    "jadwal_sholat",
    "rekap_presensi",
    "sesi",
    "statistik",
  ],
  "organizing committee": [
    "presensi",
    "presensi_grafik",
    "presensi_izin",
    "peserta",
    "plotting_tenda",
    "plotting_fgd",
    "jadwal_materi",
    "jadwal_makan",
    "jadwal_sholat",
    "rekap_presensi",
    "sesi",
    "statistik",
  ],
  fasilitator: [
    "peserta",
    "plotting_tenda",
    "plotting_fgd",
    "presensi_grafik",
    "presensi_izin",
    "jadwal_materi",
    "jadwal_makan",
    "jadwal_sholat",
    "sesi",
    "statistik",
  ],
};

export default function NFCAttendanceApp() {
  // User Authentication & Role State
  const [currentUser, setCurrentUser] = useState<UserSession | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  const [activeTab, setActiveTab] = useState<
    "presensi" | "presensi_grafik" | "presensi_izin" | "input" | "peserta" | "nfc" | "plotting_tenda" | "plotting_fgd" | "sesi" | "jadwal_materi" | "jadwal_makan" | "jadwal_sholat" | "rekap_presensi" | "statistik"
  >("presensi");
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  const [isScanning, setIsScanning] = useState(false);
  const [isSupported, setIsSupported] = useState<boolean | null>(null);
  const [isInsideIframe, setIsInsideIframe] = useState(false);
  const [showAndroidGuideModal, setShowAndroidGuideModal] = useState(false);
  const [showQuickManualModal, setShowQuickManualModal] = useState(false);
  const [manualSearchQuery, setManualSearchQuery] = useState("");
  const [allPesertaList, setAllPesertaList] = useState<any[]>([]);
  const [loadingPesertaList, setLoadingPesertaList] = useState(false);
  const [nfcTestResult, setNfcTestResult] = useState<{ uid: string; time: string; format: string } | null>(null);
  const [isTestingNfc, setIsTestingNfc] = useState(false);
  const [usbModeActive, setUsbModeActive] = useState(true);
  const [usbInputVal, setUsbInputVal] = useState("");
  const [isUsbFocused, setIsUsbFocused] = useState(true);
  const [toastMsg, setToastMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [dialogState, setDialogState] = useState<{
    isOpen: boolean;
    type: "success" | "error";
    title: string;
    message: string;
    nama?: string;
    serialNumber?: string;
    sesiNama?: string;
    statusKehadiran?: string;
    menitTerlambat?: number;
    photoUrl?: string;
  }>({
    isOpen: false,
    type: "success",
    title: "",
    message: "",
  });

  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const usbInputRef = useRef<HTMLInputElement>(null);

  // Check saved session on mount; if none, show role selection modal immediately
  useEffect(() => {
    const savedUserStr = localStorage.getItem("cai_current_user");
    if (savedUserStr) {
      try {
        const parsed = JSON.parse(savedUserStr);
        if (parsed && (parsed.role || parsed.nama_lengkap)) {
          setCurrentUser(parsed);
          // Ensure activeTab is allowed for this role
          const roleKey = normalizeRoleKey(parsed.role);
          const allowed = ROLE_ALLOWED_TABS[roleKey] || ROLE_ALLOWED_TABS[String(parsed.role).toLowerCase()] || [];
          if (allowed.length > 0 && !allowed.includes(activeTab)) {
            setActiveTab(allowed[0] as any);
          }
          return;
        }
      } catch (e) {}
    }
    // Not authenticated -> open modal
    setIsAuthModalOpen(true);
  }, []);

  const handleLoginSuccess = (user: UserSession) => {
    setCurrentUser(user);
    setIsAuthModalOpen(false);

    const roleKey = normalizeRoleKey(user.role);
    const allowed = ROLE_ALLOWED_TABS[roleKey] || ROLE_ALLOWED_TABS[String(user.role).toLowerCase()] || [];
    if (allowed.length > 0 && !allowed.includes(activeTab)) {
      setActiveTab(allowed[0] as any);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("cai_current_user");
    setCurrentUser(null);
    setIsAuthModalOpen(true);
  };

  const isTabAllowed = (tabKey: string): boolean => {
    if (!currentUser) return true; // default before auth
    const roleKey = normalizeRoleKey(currentUser.role);
    const allowed = ROLE_ALLOWED_TABS[roleKey] || ROLE_ALLOWED_TABS[String(currentUser.role).toLowerCase()];
    if (!allowed) return true;
    return allowed.includes(tabKey);
  };

  // Active session state auto check
  const [activeSession, setActiveSession] = useState<SesiAbsensi | null>(null);

  const focusUsbInput = useCallback(() => {
    if (
      usbInputRef.current &&
      activeTab === "presensi" &&
      !isAuthModalOpen &&
      !dialogState.isOpen
    ) {
      const activeTag = (document.activeElement?.tagName || "").toUpperCase();
      if (activeTag !== "INPUT" && activeTag !== "TEXTAREA" && activeTag !== "SELECT") {
        usbInputRef.current.focus();
        setIsUsbFocused(true);
      }
    }
  }, [activeTab, isAuthModalOpen, dialogState.isOpen]);

  useEffect(() => {
    if (activeTab === "presensi" && usbModeActive && !isAuthModalOpen && !dialogState.isOpen) {
      focusUsbInput();
    }
  }, [activeTab, usbModeActive, isAuthModalOpen, dialogState.isOpen, focusUsbInput]);

  const checkActiveSession = useCallback(async () => {
    try {
      let sessions: SesiAbsensi[] = [];
      const [resJadwal, resSesi] = await Promise.all([
        supabase.from("jadwal_absensi").select("*").eq("is_active", true),
        supabase.from("sesi_absensi").select("*").eq("is_active", true),
      ]);

      const combined: SesiAbsensi[] = [];
      if (resJadwal.data) combined.push(...resJadwal.data);
      if (resSesi.data) {
        for (const s of resSesi.data) {
          if (!combined.some((c) => c.id === s.id && c.nama_sesi === s.nama_sesi)) {
            combined.push(s);
          }
        }
      }

      if (combined.length === 0) {
        const localData = typeof window !== "undefined" ? localStorage.getItem("cai_sesi_absensi") : null;
        if (localData) {
          sessions = JSON.parse(localData).filter((s: SesiAbsensi) => s.is_active);
        }
      } else {
        sessions = combined;
      }

      const now = new Date();
      const todayStr = now.toISOString().split("T")[0];
      const currentMinutes = now.getHours() * 60 + now.getMinutes();

      const matched = sessions.find((s) => {
        if (s.tanggal !== todayStr) return false;
        const [sh, sm] = s.jam_mulai.split(":").map(Number);
        const [eh, em] = s.jam_selesai.split(":").map(Number);
        const startM = sh * 60 + sm;
        const endM = eh * 60 + em;
        return currentMinutes >= startM && currentMinutes <= endM;
      });

      setActiveSession(matched || null);
    } catch (err) {
      console.error("Error checking active session:", err);
    }
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setIsInsideIframe(window.self !== window.top);
      setIsSupported("NDEFReader" in window);
      checkActiveSession();
      const interval = setInterval(checkActiveSession, 10000);
      return () => clearInterval(interval);
    }
  }, [checkActiveSession]);

  const fetchPesertaList = useCallback(async () => {
    setLoadingPesertaList(true);
    try {
      const [resP, resNfc] = await Promise.all([
        supabase.from("peserta").select("*").order("nama", { ascending: true }),
        supabase.from("nfc_peserta").select("*"),
      ]);

      let list = resP.data || [];
      const nfcMap = new Map<number, any>();
      if (resNfc.data) {
        for (const n of resNfc.data) {
          if (n.peserta_id) {
            nfcMap.set(n.peserta_id, n);
          }
        }
      }

      list = list.map((p: any) => {
        const nRecord = nfcMap.get(p.id);
        return {
          ...p,
          nfc_uid: nRecord?.nfc_uid || p.nfc_uid || p.serial_number || "",
        };
      });

      setAllPesertaList(list);
    } catch (e) {
      console.warn("Gagal load daftar peserta:", e);
    } finally {
      setLoadingPesertaList(false);
    }
  }, []);

  const handleStartNfcTest = useCallback(async () => {
    if (typeof window === "undefined" || !("NDEFReader" in window)) {
      setErrorMsg("Browser/Perangkat ini tidak mendukung Web NFC API.");
      return;
    }
    try {
      setIsTestingNfc(true);
      // @ts-ignore
      const ndef = new window.NDEFReader();
      await ndef.scan();
      ndef.addEventListener("reading", (event: any) => {
        let raw = event.serialNumber || "";
        if (!raw && event.message?.records) {
          for (const r of event.message.records) {
            if (r.data) {
              try {
                const dec = new TextDecoder(r.encoding || "utf-8").decode(r.data).trim();
                if (dec) {
                  raw = dec;
                  break;
                }
              } catch (err) {}
            }
          }
        }
        if (raw) {
          const decVal = hexToDecimal(raw, true);
          setNfcTestResult({
            uid: raw,
            time: new Date().toLocaleTimeString("id-ID"),
            format: `Dec: ${decVal} | Hex: ${raw}`,
          });
          if (typeof navigator !== "undefined" && navigator.vibrate) {
            navigator.vibrate([100, 50, 100]);
          }
        }
      });
    } catch (err: any) {
      setIsTestingNfc(false);
      setErrorMsg(`Gagal uji sensor NFC: ${err.message || err}`);
    }
  }, []);

  // Load and listen to realtime records for current active session
  useEffect(() => {
    let isMounted = true;
    const currentSesiNama = activeSession?.nama_sesi || "Umum";

    const fetchInitialRecords = async () => {
      try {
        let qRiwayat = supabase
          .from("riwayat_absen")
          .select("*")
          .order("timestamp", { ascending: false })
          .limit(100);
        let qKehadiran = supabase
          .from("kehadiran")
          .select("*")
          .order("timestamp", { ascending: false })
          .limit(100);

        if (activeSession?.nama_sesi) {
          qRiwayat = qRiwayat.eq("sesi_nama", activeSession.nama_sesi);
          qKehadiran = qKehadiran.eq("sesi_nama", activeSession.nama_sesi);
        }

        const [resRiwayat, resKehadiran] = await Promise.all([qRiwayat, qKehadiran]);

        const recordMap = new Map<string, AttendanceRecord>();

        // Load records from riwayat_absen
        if (resRiwayat.data) {
          for (const d of resRiwayat.data) {
            const uidClean = hexToDecimal(String(d.serial_number || "").trim(), true);
            const key = `rw-${d.id}`;
            const photoUrlData = supabase.storage.from("CAI 2026").getPublicUrl(`Foto Profil/${uidClean}.jpg`);

            recordMap.set(key, {
              id: key,
              serialNumber: uidClean,
              timestamp: d.timestamp ? new Date(d.timestamp) : new Date(),
              status: "success",
              name: d.nama_peserta || d.nama || "Peserta NFC",
              photoUrl: photoUrlData?.data?.publicUrl,
              sesiNama: d.sesi_nama,
              statusKehadiran: d.status_kehadiran,
              menitTerlambat: d.menit_terlambat,
            });
          }
        }

        // Load records from kehadiran
        if (resKehadiran.data) {
          for (const d of resKehadiran.data) {
            const uidClean = hexToDecimal(String(d.serial_number || "").trim(), true);
            const timeKey = d.timestamp ? new Date(d.timestamp).getTime() : 0;

            const alreadyExists = Array.from(recordMap.values()).some(
              (r) => r.serialNumber === uidClean && Math.abs(r.timestamp.getTime() - timeKey) < 5000
            );

            if (!alreadyExists) {
              const key = `keh-${d.id}`;
              const photoUrlData = supabase.storage.from("CAI 2026").getPublicUrl(`Foto Profil/${uidClean}.jpg`);
              recordMap.set(key, {
                id: key,
                serialNumber: uidClean,
                timestamp: d.timestamp ? new Date(d.timestamp) : new Date(),
                status: "success",
                name: d.nama || "Peserta NFC",
                photoUrl: photoUrlData?.data?.publicUrl,
                sesiNama: d.sesi_nama,
                statusKehadiran: d.status_kehadiran,
                menitTerlambat: d.menit_terlambat,
              });
            }
          }
        }

        const sorted = Array.from(recordMap.values()).sort(
          (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
        );

        if (isMounted) {
          setRecords(sorted);
        }
      } catch (err) {
        console.error("Error fetching attendance records:", err);
      }
    };

    fetchInitialRecords();

    // Auto-polling interval every 3 seconds for reliable multi-device sync
    const pollInterval = setInterval(fetchInitialRecords, 3000);

    // Helper for adding realtime record
    const handleNewRecord = (newRec: any, source: string) => {
      if (activeSession?.nama_sesi && newRec.sesi_nama && newRec.sesi_nama !== activeSession.nama_sesi) {
        return;
      }

      const uidClean = hexToDecimal(String(newRec.serial_number || "").trim(), true);
      const timeVal = newRec.timestamp ? new Date(newRec.timestamp).getTime() : Date.now();

      setRecords((prev) => {
        const isDuplicate = prev.some(
          (r) => r.serialNumber === uidClean && Math.abs(r.timestamp.getTime() - timeVal) < 5000
        );
        if (isDuplicate) return prev;

        const photoUrlData = supabase.storage.from("CAI 2026").getPublicUrl(`Foto Profil/${uidClean}.jpg`);
        const added: AttendanceRecord = {
          id: `${source}-${newRec.id || Math.random().toString(36).substring(7)}`,
          serialNumber: uidClean,
          timestamp: newRec.timestamp ? new Date(newRec.timestamp) : new Date(),
          status: "success",
          name: newRec.nama_peserta || newRec.nama || "Peserta NFC",
          photoUrl: photoUrlData?.data?.publicUrl,
          sesiNama: newRec.sesi_nama,
          statusKehadiran: newRec.status_kehadiran,
          menitTerlambat: newRec.menit_terlambat,
        };

        return [added, ...prev];
      });
    };

    // Subscribe to realtime inserts on riwayat_absen
    const channel = supabase
      .channel(`public:riwayat_absen:${currentSesiNama}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "riwayat_absen" },
        (payload) => handleNewRecord(payload.new, "rw")
      )
      .subscribe();

    // Subscribe to realtime inserts on kehadiran (fallback)
    const channelKehadiran = supabase
      .channel(`public:kehadiran:${currentSesiNama}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "kehadiran" },
        (payload) => handleNewRecord(payload.new, "keh")
      )
      .subscribe();

    return () => {
      isMounted = false;
      clearInterval(pollInterval);
      supabase.removeChannel(channel);
      supabase.removeChannel(channelKehadiran);
    };
  }, [activeSession?.nama_sesi]);

  const processAbsenRecord = useCallback(
    async (uid: string) => {
      if (!uid || !uid.trim()) return;
      const cleanInput = uid.trim();
      // Standarisasi: Pastikan UID diubah ke desimal jika berupa format hex (misal 31:79:E8:A7)
      const cleanUid = hexToDecimal(cleanInput, true) || cleanInput;

      // Sound feedback
      try {
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(880, audioCtx.currentTime);
        gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.2);
      } catch (e) {}

      if (navigator.vibrate) {
        navigator.vibrate(200);
      }

      // 1. Lookup participant name and photo from Supabase & Local Storage
      let namaPengguna = "";
      let photoUrlFound = "";
      const uidCandidates = getAllUidCandidates(cleanInput);
      if (cleanUid && !uidCandidates.includes(cleanUid)) {
        uidCandidates.push(cleanUid);
      }

      try {
        // Search nfc_peserta table by nfc_uid candidates
        const { data: nfcDataList } = await supabase
          .from("nfc_peserta")
          .select("nama, nama_peserta, peserta_id")
          .in("nfc_uid", uidCandidates);

        if (nfcDataList && nfcDataList.length > 0) {
          const nfcRec = nfcDataList[0];
          namaPengguna = nfcRec.nama || nfcRec.nama_peserta || "";

          // If name on nfc_peserta is blank or to fetch photo, retrieve from joined 'peserta' table
          if (nfcRec.peserta_id) {
            const { data: pDetail } = await supabase
              .from("peserta")
              .select("nama, nama_peserta, foto, foto_url")
              .eq("id", nfcRec.peserta_id)
              .maybeSingle();

            if (pDetail) {
              if (!namaPengguna) namaPengguna = pDetail.nama || pDetail.nama_peserta || "";
              photoUrlFound = pDetail.foto || pDetail.foto_url || "";
            }
          }
        }

        // B. Search nfc_peserta by client list fetch if exact query yielded nothing
        if (!namaPengguna) {
          const { data: nfcAll } = await supabase
            .from("nfc_peserta")
            .select("*")
            .limit(500);

          if (nfcAll && nfcAll.length > 0) {
            const found = nfcAll.find((item: any) => {
              const u = String(item.nfc_uid || "").trim();
              return uidCandidates.some((cand) => cand.toLowerCase() === u.toLowerCase());
            });

            if (found) {
              namaPengguna = found.nama || found.nama_peserta || "";
              if (found.peserta_id) {
                const { data: pDetail } = await supabase
                  .from("peserta")
                  .select("nama, nama_peserta, foto, foto_url")
                  .eq("id", found.peserta_id)
                  .maybeSingle();

                if (pDetail) {
                  if (!namaPengguna) namaPengguna = pDetail.nama || pDetail.nama_peserta || "";
                  photoUrlFound = pDetail.foto || pDetail.foto_url || "";
                }
              }
            }
          }
        }

        // Fallback search directly in 'peserta' table
        if (!namaPengguna) {
          const { data: fallbackData } = await supabase
            .from("peserta")
            .select("nama, nama_peserta, foto, foto_url")
            .or(uidCandidates.map((u) => `nfc_uid.eq.${u},serial_number.eq.${u}`).join(","))
            .maybeSingle();

          if (fallbackData) {
            namaPengguna = fallbackData.nama || fallbackData.nama_peserta || "";
            photoUrlFound = fallbackData.foto || fallbackData.foto_url || "";
          }
        }
      } catch (err) {
        console.warn("Gagal fetch peserta:", err);
      }

      // Determine current session/category type (makan/sholat/materi)
      let currentJadwal = activeSession?.jadwal || activeSession?.kategori || "materi";
      if (!activeSession) {
        if (activeTab === "jadwal_makan") currentJadwal = "makan";
        else if (activeTab === "jadwal_sholat") currentJadwal = "sholat";
        else currentJadwal = "materi";
      }

      // Fallback: Call server API route /api/absen if client-side search returned empty
      if (!namaPengguna) {
        try {
          const res = await fetch("/api/absen", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              serial_number: cleanUid,
              sesi_nama: activeSession?.nama_sesi || "Umum",
              jadwal: currentJadwal,
              kategori: currentJadwal,
            }),
          });
          const apiResData = await res.json();
          if (apiResData && apiResData.success && apiResData.nama) {
            namaPengguna = apiResData.nama;
          }
        } catch (apiErr) {
          console.warn("API /api/absen fallback fetch error:", apiErr);
        }
      }

      // Check local storage if not found in database table
      if (!namaPengguna && typeof window !== "undefined") {
        try {
          const localPesertaStr = localStorage.getItem("cai_peserta");
          if (localPesertaStr) {
            const localPeserta = JSON.parse(localPesertaStr);
            const found = localPeserta.find((p: any) => {
              const u1 = String(p.nfc_uid || "").trim();
              const u2 = String(p.serial_number || "").trim();
              return uidCandidates.some(
                (c) =>
                  c.toLowerCase() === u1.toLowerCase() ||
                  c.toLowerCase() === u2.toLowerCase()
              );
            });
            if (found) {
              namaPengguna = found.nama || found.nama_peserta || "";
              photoUrlFound = found.foto || found.foto_url || "";
            }
          }
        } catch (e) {}
      }

      // IF UNKNOWN PARTICIPANT (No match in database)
      if (!namaPengguna) {
        // Error sound feedback
        try {
          const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
          const osc = audioCtx.createOscillator();
          const gain = audioCtx.createGain();
          osc.type = "sawtooth";
          osc.frequency.setValueAtTime(220, audioCtx.currentTime);
          gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
          osc.connect(gain);
          gain.connect(audioCtx.destination);
          osc.start();
          osc.stop(audioCtx.currentTime + 0.3);
        } catch (e) {}

        if (navigator.vibrate) {
          navigator.vibrate([100, 50, 100]);
        }

        setToastMsg({
          type: "error",
          text: `Identitas Tidak Dikenal! Kartu (UID: ${cleanUid}) belum terdaftar.`,
        });

        setDialogState({
          isOpen: true,
          type: "error",
          title: "Error!",
          message: `Kartu NFC dengan UID (${cleanUid} / Raw: ${cleanInput}) belum terdaftar di database peserta. Silakan tautkan kartu di menu 'Input Kartu NFC' atau hubungi panitia.`,
          serialNumber: cleanUid,
        });

        setTimeout(() => {
          setToastMsg(null);
        }, 4000);
        return;
      }

      // IF PARTICIPANT FOUND (Match Success)
      namaPengguna = toTitleCase(namaPengguna);

      // Sound feedback success
      try {
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(880, audioCtx.currentTime);
        gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.2);
      } catch (e) {}

      if (navigator.vibrate) {
        navigator.vibrate(200);
      }

      // 2. Photo URL from database or Storage
      let photoUrl = photoUrlFound;
      if (!photoUrl) {
        const { data: publicUrlData } = supabase.storage
          .from("CAI 2026")
          .getPublicUrl(`Foto Profil/${cleanUid}.jpg`);
        photoUrl = publicUrlData?.publicUrl || "";
      }

      // 3. Determine Late Status based on Active Session & Waktu Telat
      let statusKehadiran = "Tepat Waktu";
      let menitTerlambat = 0;
      let batasJamTelat = "";
      const sesiNamaNow = activeSession?.nama_sesi || "Umum";

      // 4. Anti Dobel Absen (Satu nama / kartu dilarang absen 2x dalam sesi yang sama)
      try {
        const [checkRw, checkKeh] = await Promise.all([
          supabase
            .from("riwayat_absen")
            .select("id, nama_peserta, serial_number")
            .eq("sesi_nama", sesiNamaNow)
            .or(`nama_peserta.ilike.${namaPengguna},serial_number.eq.${cleanUid}`)
            .limit(1),
          supabase
            .from("kehadiran")
            .select("id, nama, serial_number")
            .eq("sesi_nama", sesiNamaNow)
            .or(`nama.ilike.${namaPengguna},serial_number.eq.${cleanUid}`)
            .limit(1),
        ]);

        const hasDuplicate =
          (checkRw.data && checkRw.data.length > 0) ||
          (checkKeh.data && checkKeh.data.length > 0) ||
          records.some(
            (r) =>
              (r.name?.toLowerCase() === namaPengguna.toLowerCase() ||
                r.serialNumber === cleanUid) &&
              (r.sesiNama === sesiNamaNow || !r.sesiNama)
          );

        if (hasDuplicate) {
          // Warning tone
          try {
            const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = "sawtooth";
            osc.frequency.setValueAtTime(300, audioCtx.currentTime);
            gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start();
            osc.stop(audioCtx.currentTime + 0.3);
          } catch (e) {}

          if (navigator.vibrate) {
            navigator.vibrate([150, 100, 150]);
          }

          setToastMsg({
            type: "error",
            text: `Peserta "${namaPengguna}" sudah presensi pada sesi ${sesiNamaNow}!`,
          });

          setDialogState({
            isOpen: true,
            type: "error",
            title: "SUDAH PRESENSI",
            message: `Peserta "${namaPengguna}" sudah melakukan presensi pada sesi "${sesiNamaNow}". Kartu tidak bisa absen 2x dalam sesi yang sama.`,
            nama: namaPengguna,
            serialNumber: cleanUid,
          });

          setTimeout(() => {
            setToastMsg(null);
          }, 4000);
          return;
        }
      } catch (checkErr) {
        console.warn("Gagal cek duplikasi presensi:", checkErr);
      }

      if (activeSession) {
        const start = activeSession.jam_mulai ? activeSession.jam_mulai.slice(0, 5) : "08:00";
        const toleransi = typeof activeSession.toleransi_menit === "number" ? activeSession.toleransi_menit : 15;
        batasJamTelat = activeSession.waktu_telat
          ? activeSession.waktu_telat.slice(0, 5)
          : calculateWaktuTelat(start, toleransi);

        const now = new Date();
        const currentTotalMinutes = now.getHours() * 60 + now.getMinutes();
        const [bH, bM] = batasJamTelat.split(":").map(Number);
        const batasTotalMinutes = bH * 60 + bM;
        const [stH, stM] = start.split(":").map(Number);
        const startTotalMinutes = stH * 60 + stM;

        if (currentTotalMinutes > batasTotalMinutes) {
          statusKehadiran = "Terlambat";
          menitTerlambat = Math.max(0, currentTotalMinutes - startTotalMinutes);
        }
      }

      // 5. Save to database (Save to riwayat_absen & kehadiran)
      try {
        const timestampNow = new Date().toISOString();

        const { error: rErr } = await supabase.from("riwayat_absen").insert([
          {
            serial_number: cleanUid,
            nama_peserta: namaPengguna,
            sesi_nama: sesiNamaNow,
            jadwal: currentJadwal,
            kategori: currentJadwal,
            status: "Hadir",
            status_kehadiran: statusKehadiran,
            menit_terlambat: menitTerlambat,
            waktu_telat: batasJamTelat,
            timestamp: timestampNow,
          },
        ]);

        if (rErr) {
          // Retry without extra columns if not present in Supabase table
          const { error: rErr2 } = await supabase.from("riwayat_absen").insert([
            {
              serial_number: cleanUid,
              nama_peserta: namaPengguna,
              sesi_nama: sesiNamaNow,
              jadwal: currentJadwal,
              kategori: currentJadwal,
              status: "Hadir",
              timestamp: timestampNow,
            },
          ]);
          if (rErr2) {
            await supabase.from("riwayat_absen").insert([
              {
                serial_number: cleanUid,
                nama_peserta: namaPengguna,
                sesi_nama: sesiNamaNow,
                status: "Hadir",
                timestamp: timestampNow,
              },
            ]);
          }
        }

        const { error: kErr } = await supabase.from("kehadiran").insert([
          {
            serial_number: cleanUid,
            nama: namaPengguna,
            timestamp: timestampNow,
            sesi_nama: sesiNamaNow,
            jadwal: currentJadwal,
            kategori: currentJadwal,
            status_kehadiran: statusKehadiran,
            menit_terlambat: menitTerlambat,
            waktu_telat: batasJamTelat,
          },
        ]);

        if (kErr) {
          const { error: kErr2 } = await supabase.from("kehadiran").insert([
            {
              serial_number: cleanUid,
              nama: namaPengguna,
              timestamp: timestampNow,
              sesi_nama: sesiNamaNow,
              jadwal: currentJadwal,
              kategori: currentJadwal,
            },
          ]);
          if (kErr2) {
            await supabase.from("kehadiran").insert([
              {
                serial_number: cleanUid,
                nama: namaPengguna,
                timestamp: timestampNow,
                sesi_nama: sesiNamaNow,
              },
            ]);
          }
        }
      } catch (dbErr) {
        console.warn("Gagal simpan ke database presensi:", dbErr);
      }

      // Add to local live session records list
      const newAttendanceRecord: AttendanceRecord = {
        id: `${Date.now()}-${Math.random()}`,
        serialNumber: cleanUid,
        name: namaPengguna,
        sesiNama: sesiNamaNow,
        timestamp: new Date(),
        status: "success",
        statusKehadiran: statusKehadiran,
        menitTerlambat: menitTerlambat,
        photoUrl: photoUrl,
      };
      setRecords((prev) => [newAttendanceRecord, ...prev.slice(0, 49)]);

      setToastMsg({
        type: "success",
        text: `Presensi Berhasil! ${namaPengguna}`,
      });

      setDialogState({
        isOpen: true,
        type: "success",
        title: "SUKSES",
        message: "",
        nama: namaPengguna,
        serialNumber: cleanUid,
        sesiNama: sesiNamaNow,
        statusKehadiran: statusKehadiran,
        menitTerlambat: menitTerlambat,
        photoUrl: photoUrl,
      });

      setTimeout(() => {
        setToastMsg(null);
      }, 4000);
    },
    [activeSession, records]
  );

  // Global background listener for USB NFC / Barcode reader (Keyboard Wedge)
  useEffect(() => {
    if (activeTab !== "presensi" || !usbModeActive || isAuthModalOpen || dialogState.isOpen) {
      return;
    }

    let buffer = "";
    let lastKeyTime = Date.now();

    const handleWindowKeyDown = (e: KeyboardEvent) => {
      // Do not capture if user is typing in an input, textarea, select, or modal
      const activeTag = (document.activeElement?.tagName || "").toUpperCase();
      const isEditable =
        activeTag === "INPUT" ||
        activeTag === "TEXTAREA" ||
        activeTag === "SELECT" ||
        (document.activeElement as HTMLElement)?.isContentEditable;

      if (isEditable || isAuthModalOpen || dialogState.isOpen) {
        return;
      }

      if (e.key === "Enter") {
        const uid = buffer.trim();
        if (uid.length >= 3) {
          e.preventDefault();
          buffer = "";
          processAbsenRecord(uid);
        }
        buffer = "";
        return;
      }

      // If single printable character (digits/letters from reader)
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const now = Date.now();
        // Readers send strokes in rapid succession (< 100ms). Reset buffer if user paused > 2000ms
        if (now - lastKeyTime > 2000) {
          buffer = "";
        }
        lastKeyTime = now;
        buffer += e.key;
      }
    };

    window.addEventListener("keydown", handleWindowKeyDown);
    return () => {
      window.removeEventListener("keydown", handleWindowKeyDown);
    };
  }, [activeTab, usbModeActive, isAuthModalOpen, dialogState.isOpen, processAbsenRecord]);

  const handleUsbKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const scannedUid = usbInputVal.trim();
      if (!scannedUid) return;

      setUsbInputVal("");
      await processAbsenRecord(scannedUid);
      focusUsbInput();
    }
  };

  const handleScan = useCallback(async () => {
    if (typeof window === "undefined") return;

    if (window.self !== window.top) {
      // In iframe preview
      setToastMsg({
        type: "error",
        text: "Peringatan: Web NFC memerlukan tab browser mandiri. Buka di Tab Baru Chrome jika sensor belum merespons.",
      });
    }

    if (!("NDEFReader" in window)) {
      setShowAndroidGuideModal(true);
      setErrorMsg("Fitur Web NFC Android memerlukan Google Chrome di HP Android dengan sensor NFC aktif.");
      return;
    }

    try {
      // @ts-ignore
      const ndef = new window.NDEFReader();
      await ndef.scan();
      setIsScanning(true);
      setErrorMsg(null);
      setToastMsg({
        type: "success",
        text: "Sensor NFC Android AKTIF! Tempelkan kartu ke bagian belakang HP Anda.",
      });

      ndef.addEventListener("reading", async (event: any) => {
        let rawUid = event.serialNumber || "";
        if (!rawUid && event.message?.records) {
          for (const record of event.message.records) {
            if (record.data) {
              try {
                const textDecoder = new TextDecoder(record.encoding || "utf-8");
                const decoded = textDecoder.decode(record.data).trim();
                if (decoded) {
                  rawUid = decoded;
                  break;
                }
              } catch (e) {}
            }
          }
        }
        rawUid = rawUid || "Tidak diketahui";
        if (typeof navigator !== "undefined" && navigator.vibrate) {
          navigator.vibrate([120, 60, 120]);
        }
        await processAbsenRecord(rawUid);
      });

      ndef.addEventListener("readingerror", () => {
        setErrorMsg("Gagal membaca tag NFC. Silakan dekatkan kartu kembali ke belakang HP.");
        if (typeof navigator !== "undefined" && navigator.vibrate) {
          navigator.vibrate(200);
        }
      });
    } catch (error: any) {
      setIsScanning(false);
      if (error.name === "NotAllowedError") {
        setErrorMsg("Izin akses NFC ditolak atau dibatasi frame. Silakan buka website di Tab Baru Chrome dan izinkan akses NFC.");
        setShowAndroidGuideModal(true);
      } else if (error.name === "NotSupportedError") {
        setErrorMsg("Browser atau HP Android Anda belum mendukung Web NFC.");
        setShowAndroidGuideModal(true);
      } else {
        setErrorMsg(`Pemberitahuan NFC: ${error.message || "Gagal mengaktifkan sensor NFC"}`);
      }
    }
  }, [processAbsenRecord]);

  const stopScan = useCallback(() => {
    setIsScanning(false);
    setToastMsg({
      type: "success",
      text: "Pemindaian NFC Android telah dihentikan.",
    });
    setTimeout(() => setToastMsg(null), 2500);
  }, []);

  const [expandedMenus, setExpandedMenus] = useState<Record<string, boolean>>({
    presensi: true,
    peserta: false,
    registrasi: false,
    plotting: true,
    jadwal: true,
    sesi: true,
    rekap: true,
  });

  const toggleSubmenu = (menuKey: string) => {
    setExpandedMenus((prev) => ({
      ...prev,
      [menuKey]: !prev[menuKey],
    }));
  };

  return (
    <div className="flex flex-col h-screen bg-slate-50 font-sans text-slate-800 overflow-hidden select-none">
      {/* Top Bar Header */}
      <header className="bg-[#203598] text-white flex items-center justify-between px-4 lg:px-6 py-3 shadow-md shrink-0 z-30">
        <div className="flex items-center gap-3">
          {/* Mobile menu toggle */}
          <button
            onClick={() => setIsMobileOpen(!isMobileOpen)}
            className="p-2 hover:bg-white/10 rounded-xl transition-colors lg:hidden text-white"
            title="Buka Menu Sidebar"
          >
            {isMobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>

          {/* Desktop sidebar collapse toggle */}
          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="p-2 hover:bg-white/10 rounded-xl transition-colors hidden lg:flex text-white items-center justify-center cursor-pointer"
            title={isSidebarOpen ? "Sembunyikan Menu Sidebar" : "Tampilkan Menu Sidebar"}
          >
            {isSidebarOpen ? <ChevronLeft className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>

          {/* Logo & App Title */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center overflow-hidden bg-white shrink-0 shadow-sm">
              <Image
                src="https://vutuiyhwpnxkcxsgcypu.supabase.co/storage/v1/object/public/CAI%202026/Logo/logo%20CAI%2047.png"
                alt="Logo CAI 47"
                width={36}
                height={36}
                className="object-contain p-0.5"
                referrerPolicy="no-referrer"
                unoptimized={true}
              />
            </div>
            <div>
              <h1 className="font-bold text-base md:text-lg tracking-tight leading-none text-white">
                Cinta Alam Indonesia 2026
              </h1>
              <p className="text-blue-100 text-[10px] uppercase tracking-widest font-semibold opacity-80 mt-0.5">
                KOTA MADIUN
              </p>
            </div>
          </div>
        </div>

        {/* Right side status & User Profile */}
        <div className="flex items-center gap-2 sm:gap-3">
          {currentUser ? (
            <div className="flex items-center gap-2">
              <div className="hidden sm:flex items-center gap-2 bg-white/10 border border-white/20 px-3 py-1.5 rounded-xl backdrop-blur-xs">
                <div className="w-6 h-6 rounded-full bg-white text-[#203598] font-bold text-xs flex items-center justify-center shadow-xs">
                  {currentUser.nama_lengkap.charAt(0).toUpperCase()}
                </div>
                <div className="text-left">
                  <div className="text-xs font-bold leading-tight text-white max-w-[150px] truncate">
                    {currentUser.nama_lengkap}
                  </div>
                  <div className="text-[10px] text-blue-200 font-semibold leading-tight capitalize">
                    {currentUser.role_label}
                  </div>
                </div>
              </div>

              <button
                onClick={handleLogout}
                className="px-3 py-1.5 bg-white/15 hover:bg-white/25 border border-white/20 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-2xs cursor-pointer active:scale-95"
                title="Ganti Role Pengguna / Keluar"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden xs:inline">Ganti Role</span>
              </button>
            </div>
          ) : (
            <button
              onClick={() => setIsAuthModalOpen(true)}
              className="px-3.5 py-1.5 bg-white text-[#203598] hover:bg-blue-50 font-bold rounded-xl text-xs shadow-sm transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>Pilih Role</span>
            </button>
          )}

          <div className="px-2.5 py-1 bg-white/10 border border-white/20 text-white rounded-full text-[11px] font-medium backdrop-blur-sm hidden md:flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>Online</span>
          </div>
        </div>
      </header>

      {/* Main Body Layout with Sidebar */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Mobile Backdrop */}
        {isMobileOpen && (
          <div
            id="sidebar-mobile-backdrop"
            onClick={() => setIsMobileOpen(false)}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-40 lg:hidden animate-in fade-in duration-200 cursor-pointer"
          />
        )}

        {/* Sidebar Navigation */}
        <aside
          id="app-sidebar"
          className={`
            fixed lg:static inset-y-0 left-0 z-50 bg-white flex flex-col justify-between transition-all duration-300 ease-in-out shadow-2xl lg:shadow-none overflow-hidden
            w-72 sm:w-80 lg:w-auto
            ${isMobileOpen ? "translate-x-0 pointer-events-auto visible opacity-100" : "-translate-x-full pointer-events-none invisible opacity-0 lg:translate-x-0 lg:pointer-events-auto lg:visible lg:opacity-100"}
            ${isSidebarOpen ? "lg:w-64 lg:border-r lg:border-slate-200 lg:opacity-100 lg:visible lg:pointer-events-auto" : "lg:w-0 lg:border-r-0 lg:p-0 lg:opacity-0 lg:invisible lg:pointer-events-none"}
          `}
        >
          {/* Mobile Sidebar Header with Close/Hide Button */}
          <div className="p-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between lg:hidden shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-[#203598] text-white flex items-center justify-center font-black text-xs shadow-xs">
                CAI
              </div>
              <div className="text-left">
                <div className="text-xs font-black text-slate-800 leading-tight">Menu Navigasi</div>
                <div className="text-[10px] text-slate-500 font-medium leading-tight">CAI 2026 Kota Madiun</div>
              </div>
            </div>
            <button
              id="btn-hide-sidebar-top"
              type="button"
              onClick={() => setIsMobileOpen(false)}
              className="px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 active:bg-rose-200 text-rose-700 border border-rose-200 transition-all flex items-center gap-1.5 text-xs font-bold shadow-xs active:scale-95 cursor-pointer"
              title="Sembunyikan Sidebar"
            >
              <X className="w-4 h-4 stroke-[2.5]" />
              <span>Tutup</span>
            </button>
          </div>

          {/* Sidebar Navigation Items */}
          <div className="p-3 space-y-3 overflow-y-auto overflow-x-hidden flex-1 min-w-[256px]">
            <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
              <span>Menu Akses</span>
              {currentUser && (
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-semibold capitalize">
                  {currentUser.role_label}
                </span>
              )}
            </div>

            {/* Presensi Dropdown Menu */}
            {(isTabAllowed("presensi") || isTabAllowed("presensi_izin")) && (
              <div className="space-y-1">
                <button
                  onClick={() => toggleSubmenu("presensi")}
                  className="w-full px-3.5 py-2 rounded-xl text-left font-bold text-sm text-slate-700 hover:bg-slate-100 flex items-center justify-between transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <Nfc className="w-4 h-4 text-[#203598]" />
                    <span>Presensi</span>
                  </div>
                  <ChevronDown
                    className={`w-4 h-4 text-slate-400 transition-transform ${
                      expandedMenus.presensi ? "rotate-180" : ""
                    }`}
                  />
                </button>

                {expandedMenus.presensi && (
                  <div className="pl-3 space-y-1 border-l-2 border-slate-200 ml-4">
                    {isTabAllowed("presensi") && (
                      <button
                        onClick={() => {
                          setActiveTab("presensi");
                          setIsMobileOpen(false);
                        }}
                        className={`w-full px-3 py-2 rounded-lg text-left text-sm font-semibold transition-all flex items-center justify-between cursor-pointer ${
                          activeTab === "presensi"
                            ? "bg-[#203598] text-white shadow-sm"
                            : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                        }`}
                      >
                        <span>Tap Kartu (Scanner)</span>
                      </button>
                    )}

                    {isTabAllowed("presensi_izin") && (
                      <button
                        onClick={() => {
                          setActiveTab("presensi_izin");
                          setIsMobileOpen(false);
                        }}
                        className={`w-full px-3 py-2 rounded-lg text-left text-sm font-semibold transition-all flex items-center justify-between cursor-pointer ${
                          activeTab === "presensi_izin"
                            ? "bg-[#203598] text-white shadow-sm"
                            : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                        }`}
                      >
                        <span>Perizinan Sesi</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Grafik Presensi Menu (Terpisah Mandiri) */}
            {(isTabAllowed("presensi_grafik") || isTabAllowed("statistik")) && (
              <div className="space-y-1">
                <button
                  onClick={() => {
                    setActiveTab("presensi_grafik");
                    setIsMobileOpen(false);
                  }}
                  className={`w-full px-3.5 py-2.5 rounded-xl text-left font-bold text-sm flex items-center justify-between transition-all cursor-pointer ${
                    activeTab === "presensi_grafik" || activeTab === "statistik"
                      ? "bg-[#203598] text-white shadow-sm"
                      : "text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <PieChart
                      className={`w-4 h-4 ${
                        activeTab === "presensi_grafik" || activeTab === "statistik"
                          ? "text-white"
                          : "text-[#203598]"
                      }`}
                    />
                    <span>Grafik Presensi</span>
                  </div>
                </button>
              </div>
            )}

            {/* Peserta */}
            {isTabAllowed("peserta") && (
              <div className="space-y-1">
                <button
                  onClick={() => toggleSubmenu("peserta")}
                  className="w-full px-3.5 py-2 rounded-xl text-left font-bold text-sm text-slate-700 hover:bg-slate-100 flex items-center justify-between transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-[#203598]" />
                    <span>Peserta</span>
                  </div>
                  <ChevronDown
                    className={`w-4 h-4 text-slate-400 transition-transform ${
                      expandedMenus.peserta ? "rotate-180" : ""
                    }`}
                  />
                </button>

                {expandedMenus.peserta && (
                  <div className="pl-3 space-y-1 border-l-2 border-slate-200 ml-4">
                    <button
                      onClick={() => {
                        setActiveTab("peserta");
                        setIsMobileOpen(false);
                      }}
                      className={`w-full px-3 py-2 rounded-lg text-left text-sm font-semibold transition-all cursor-pointer ${
                        activeTab === "peserta"
                          ? "bg-[#203598] text-white shadow-sm"
                          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                      }`}
                    >
                      Data Peserta
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Registrasi */}
            {(isTabAllowed("input") || isTabAllowed("nfc")) && (
              <div className="space-y-1">
                <button
                  onClick={() => toggleSubmenu("registrasi")}
                  className="w-full px-3.5 py-2 rounded-xl text-left font-bold text-sm text-slate-700 hover:bg-slate-100 flex items-center justify-between transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <UserPlus className="w-4 h-4 text-[#203598]" />
                    <span>Registrasi</span>
                  </div>
                  <ChevronDown
                    className={`w-4 h-4 text-slate-400 transition-transform ${
                      expandedMenus.registrasi ? "rotate-180" : ""
                    }`}
                  />
                </button>

                {expandedMenus.registrasi && (
                  <div className="pl-3 space-y-1 border-l-2 border-slate-200 ml-4">
                    {isTabAllowed("input") && (
                      <button
                        onClick={() => {
                          setActiveTab("input");
                          setIsMobileOpen(false);
                        }}
                        className={`w-full px-3 py-2 rounded-lg text-left text-sm font-semibold transition-all cursor-pointer ${
                          activeTab === "input"
                            ? "bg-[#203598] text-white shadow-sm"
                            : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                        }`}
                      >
                        Input Peserta
                      </button>
                    )}
                    {isTabAllowed("nfc") && (
                      <button
                        onClick={() => {
                          setActiveTab("nfc");
                          setIsMobileOpen(false);
                        }}
                        className={`w-full px-3 py-2 rounded-lg text-left text-sm font-semibold transition-all cursor-pointer ${
                          activeTab === "nfc"
                            ? "bg-[#203598] text-white shadow-sm"
                            : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                        }`}
                      >
                        Input NFC
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Plotting */}
            {(isTabAllowed("plotting_tenda") || isTabAllowed("plotting_fgd")) && (
              <div className="space-y-1">
                <button
                  onClick={() => toggleSubmenu("plotting")}
                  className="w-full px-3.5 py-2 rounded-xl text-left font-bold text-sm text-slate-700 hover:bg-slate-100 flex items-center justify-between transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <Table className="w-4 h-4 text-[#203598]" />
                    <span>Plotting</span>
                  </div>
                  <ChevronDown
                    className={`w-4 h-4 text-slate-400 transition-transform ${
                      expandedMenus.plotting ? "rotate-180" : ""
                    }`}
                  />
                </button>

                {expandedMenus.plotting && (
                  <div className="pl-3 space-y-1 border-l-2 border-slate-200 ml-4">
                    {isTabAllowed("plotting_tenda") && (
                      <button
                        onClick={() => {
                          setActiveTab("plotting_tenda");
                          setIsMobileOpen(false);
                        }}
                        className={`w-full px-3 py-2 rounded-lg text-left text-sm font-semibold transition-all cursor-pointer ${
                          activeTab === "plotting_tenda"
                            ? "bg-[#203598] text-white shadow-sm"
                            : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                        }`}
                      >
                        Tenda
                      </button>
                    )}

                    {isTabAllowed("plotting_fgd") && (
                      <button
                        onClick={() => {
                          setActiveTab("plotting_fgd");
                          setIsMobileOpen(false);
                        }}
                        className={`w-full px-3 py-2 rounded-lg text-left text-sm font-semibold transition-all cursor-pointer ${
                          activeTab === "plotting_fgd"
                            ? "bg-[#203598] text-white shadow-sm"
                            : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                        }`}
                      >
                        FGD
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Jadwal */}
            {(isTabAllowed("jadwal_materi") || isTabAllowed("jadwal_makan") || isTabAllowed("jadwal_sholat")) && (
              <div className="space-y-1">
                <button
                  onClick={() => {
                    toggleSubmenu("jadwal");
                    toggleSubmenu("sesi");
                  }}
                  className="w-full px-3.5 py-2 rounded-xl text-left font-bold text-sm text-slate-700 hover:bg-slate-100 flex items-center justify-between transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-[#203598]" />
                    <span>Jadwal</span>
                  </div>
                  <ChevronDown
                    className={`w-4 h-4 text-slate-400 transition-transform ${
                      expandedMenus.jadwal || expandedMenus.sesi ? "rotate-180" : ""
                    }`}
                  />
                </button>

                {(expandedMenus.jadwal || expandedMenus.sesi) && (
                  <div className="pl-3 space-y-1 border-l-2 border-slate-200 ml-4">
                    {isTabAllowed("jadwal_materi") && (
                      <button
                        onClick={() => {
                          setActiveTab("jadwal_materi");
                          setIsMobileOpen(false);
                        }}
                        className={`w-full px-3 py-2 rounded-lg text-left text-sm font-semibold transition-all cursor-pointer ${
                          activeTab === "jadwal_materi" || activeTab === "sesi"
                            ? "bg-[#203598] text-white shadow-sm"
                            : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                        }`}
                      >
                        Materi
                      </button>
                    )}

                    {isTabAllowed("jadwal_makan") && (
                      <button
                        onClick={() => {
                          setActiveTab("jadwal_makan");
                          setIsMobileOpen(false);
                        }}
                        className={`w-full px-3 py-2 rounded-lg text-left text-sm font-semibold transition-all cursor-pointer ${
                          activeTab === "jadwal_makan"
                            ? "bg-[#203598] text-white shadow-sm"
                            : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                        }`}
                      >
                        Makan
                      </button>
                    )}

                    {isTabAllowed("jadwal_sholat") && (
                      <button
                        onClick={() => {
                          setActiveTab("jadwal_sholat");
                          setIsMobileOpen(false);
                        }}
                        className={`w-full px-3 py-2 rounded-lg text-left text-sm font-semibold transition-all cursor-pointer ${
                          activeTab === "jadwal_sholat"
                            ? "bg-[#203598] text-white shadow-sm"
                            : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                        }`}
                      >
                        Sholat
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Rekap */}
            {isTabAllowed("rekap_presensi") && (
              <div className="space-y-1">
                <button
                  onClick={() => toggleSubmenu("rekap")}
                  className="w-full px-3.5 py-2 rounded-xl text-left font-bold text-sm text-slate-700 hover:bg-slate-100 flex items-center justify-between transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <PieChart className="w-4 h-4 text-[#203598]" />
                    <span>Rekap</span>
                  </div>
                  <ChevronDown
                    className={`w-4 h-4 text-slate-400 transition-transform ${
                      expandedMenus.rekap ? "rotate-180" : ""
                    }`}
                  />
                </button>

                {expandedMenus.rekap && (
                  <div className="pl-3 space-y-1 border-l-2 border-slate-200 ml-4">
                    <button
                      onClick={() => {
                        setActiveTab("rekap_presensi");
                        setIsMobileOpen(false);
                      }}
                      className={`w-full px-3 py-2 rounded-lg text-left text-sm font-semibold transition-all cursor-pointer ${
                        activeTab === "rekap_presensi"
                          ? "bg-[#203598] text-white shadow-sm"
                          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                      }`}
                    >
                      Rekap Presensi
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Sidebar Footer */}
          <div className="p-3 border-t border-slate-200 bg-slate-50/80 flex flex-col gap-2 shrink-0">
            {/* Mobile explicit hide button */}
            <button
              id="btn-hide-sidebar-bottom"
              type="button"
              onClick={() => setIsMobileOpen(false)}
              className="w-full py-2.5 px-3 rounded-xl bg-rose-50 hover:bg-rose-100 active:bg-rose-200 text-rose-700 border border-rose-200 text-xs font-bold transition-all flex items-center justify-center gap-2 lg:hidden cursor-pointer shadow-xs active:scale-98"
            >
              <X className="w-4 h-4 stroke-[2.5]" />
              <span>Sembunyikan / Tutup Menu</span>
            </button>

            <div className="text-center">
              <p className="text-[10px] text-slate-400 font-medium">
                {isSidebarOpen ? "CAI 2026 Kota Madiun" : "CAI '26"}
              </p>
            </div>
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 p-3 md:p-5 max-w-7xl mx-auto w-full overflow-y-auto">
          {(activeTab === "presensi_grafik" || activeTab === "statistik") && (
            <StatistikKehadiran defaultSessionName={activeSession?.nama_sesi} />
          )}

          {activeTab === "presensi_izin" && (
            <PerizinanSesi activeSessionName={activeSession?.nama_sesi} />
          )}

          {activeTab === "rekap_presensi" && <RekapPresensi />}

          {(activeTab === "sesi" || activeTab === "jadwal_materi") && (
            <ManajemenSesi kategori="materi" />
          )}

          {activeTab === "jadwal_makan" && <ManajemenSesi kategori="makan" />}

          {activeTab === "jadwal_sholat" && <ManajemenSesi kategori="sholat" />}

          {activeTab === "nfc" && <InputNFCPesertaForm />}

          {activeTab === "plotting_tenda" && <PlottingPeserta type="tenda" />}

          {activeTab === "plotting_fgd" && <PlottingPeserta type="fgd" />}

          {activeTab === "input" && (
            <InputPesertaForm onGoToData={() => setActiveTab("peserta")} />
          )}

          {activeTab === "peserta" && (
            <DataPesertaTable onGoToInput={() => setActiveTab("input")} />
          )}

          {activeTab === "presensi" && (
            <div className="flex flex-col gap-4 h-full">
              {/* Hidden Auto-focused Input for USB NFC Reader */}
              <input
                ref={usbInputRef}
                type="text"
                value={usbInputVal}
                onChange={(e) => setUsbInputVal(e.target.value)}
                onKeyDown={handleUsbKeyDown}
                onFocus={() => setIsUsbFocused(true)}
                onBlur={() => setIsUsbFocused(false)}
                className="opacity-0 absolute pointer-events-none w-1 h-1 -z-10"
                autoComplete="off"
                aria-hidden="true"
              />

              {/* Active Session Auto Status Banner */}
              <div className="w-full shrink-0">
                {activeSession ? (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 shadow-xs">
                    <div className="flex items-center gap-2.5">
                      <div className="w-3 h-3 rounded-full bg-emerald-500 animate-ping shrink-0" />
                      <div>
                        <div className="text-[10px] font-extrabold text-emerald-800 uppercase tracking-wider">
                          Otomatis Aktif Sesi Presensi Saat Ini
                        </div>
                        <div className="text-sm font-bold text-emerald-950">
                          {activeSession.nama_sesi}
                        </div>
                        <div className="text-xs text-emerald-700 font-medium flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span>
                            Jam {activeSession.jam_mulai.slice(0, 5)} - {activeSession.jam_selesai.slice(0, 5)} WIB
                          </span>
                          {(() => {
                            const toleransi = typeof activeSession.toleransi_menit === "number" ? activeSession.toleransi_menit : 15;
                            const batas = activeSession.waktu_telat ? activeSession.waktu_telat.slice(0, 5) : calculateWaktuTelat(activeSession.jam_mulai.slice(0, 5), toleransi);
                            return (
                              <span className="inline-flex items-center gap-1 font-semibold text-amber-900 bg-amber-100/90 border border-amber-300/80 px-2 py-0.5 rounded-md text-[11px]">
                                <Clock className="w-3 h-3 text-amber-700" />
                                Batas Telat: {batas} WIB (+{toleransi}m)
                              </span>
                            );
                          })()}
                          {activeSession.keterangan ? <span>• {activeSession.keterangan}</span> : null}
                        </div>
                      </div>
                    </div>
                    <span className="px-3 py-1 bg-emerald-600 text-white text-[11px] font-extrabold rounded-full shadow-2xs shrink-0">
                      SEDANG BERLANGSUNG
                    </span>
                  </div>
                ) : (
                  <div className="p-3 bg-slate-100 border border-slate-200 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="w-3 h-3 rounded-full bg-slate-400 shrink-0" />
                      <div>
                        <div className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">
                          Status Sesi Presensi
                        </div>
                        <div className="text-xs font-bold text-slate-700">
                          Tidak ada sesi absensi otomatis yang berlangsung saat ini
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => setActiveTab("sesi")}
                      className="px-3 py-1 bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-semibold rounded-lg transition-colors shrink-0 shadow-2xs"
                    >
                      Kelola Sesi
                    </button>
                  </div>
                )}
              </div>

              {/* Toast Feedback Notification */}
              {toastMsg && (
                <div className={`p-3 rounded-xl border font-bold text-xs flex items-center gap-2.5 shadow-sm transition-all shrink-0 ${
                  toastMsg.type === "success"
                    ? "bg-emerald-600 text-white border-emerald-700"
                    : "bg-rose-600 text-white border-rose-700"
                }`}>
                  <CheckCircle2 className="w-5 h-5 shrink-0" />
                  <span>{toastMsg.text}</span>
                </div>
              )}

              <div className="flex flex-col md:flex-row gap-4 md:gap-6 flex-1 min-h-0">
                {/* Left Panel: Scanner */}
                <section className="w-full md:w-[340px] lg:w-[360px] flex flex-col gap-3 shrink-0">
                  {/* Status Indicator Bar */}
                  <div className="bg-white border border-slate-200 rounded-xl p-2.5 flex items-center justify-between text-xs shadow-2xs">
                    <span className="text-slate-500 font-bold text-[11px]">Dukungan Device:</span>
                    {isSupported ? (
                      <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full font-bold text-[11px] flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        Web NFC &amp; USB Reader
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-full font-bold text-[11px] flex items-center gap-1">
                        <Usb className="w-3 h-3 text-blue-600" />
                        USB NFC Reader Active
                      </span>
                    )}
                  </div>

                  {/* Only show warning if BOTH Web NFC is missing AND USB mode is off */}
                  {isSupported === false && !usbModeActive && (
                    <div className="bg-red-50 border-l-4 border-red-500 p-3 rounded-md shadow-2xs">
                      <div className="flex">
                        <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mr-2" />
                        <p className="text-xs text-red-700">
                          Perangkat Anda tidak mendukung Web NFC dan USB Reader mati.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Scan Card Container */}
                  <div
                    onClick={focusUsbInput}
                    className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col cursor-pointer hover:border-blue-300 transition-colors"
                  >
                    <div className="flex flex-col items-center justify-center p-5 sm:p-6 text-center">
                      {/* Top Circular Contactless / NFC Badge */}
                      <div className="w-16 h-16 sm:w-20 sm:h-20 bg-[#eef3f8] rounded-full flex items-center justify-center relative mb-5 transition-transform hover:scale-105">
                        {isScanning && (
                          <>
                            <div className="absolute inset-0 border-4 border-[#203598] opacity-20 rounded-full scale-110 animate-ping"></div>
                            <div className="absolute inset-0 border-2 border-[#203598] opacity-30 rounded-full scale-125 animate-pulse"></div>
                          </>
                        )}
                        {/* Contactless Signal Wave Icon */}
                        <svg
                          className={`w-8 h-8 sm:w-9 sm:h-9 transition-colors duration-300 ${
                            isScanning ? "text-[#203598]" : "text-slate-600"
                          }`}
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.6"
                          strokeLinecap="round"
                        >
                          <path d="M8.5 14.5a2.5 2.5 0 0 0 0-5" />
                          <path d="M12 17.5a6 6 0 0 0 0-11" />
                          <path d="M15.5 20.5a10 10 0 0 0 0-17" />
                          <path d="M19 23a14 14 0 0 0 0-22" />
                        </svg>
                      </div>

                      {/* Prominent Android Web NFC Scan Buttons */}
                      <div className="w-full space-y-2.5">
                        {isInsideIframe && (
                          <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-900 flex flex-col gap-1.5 text-left mb-1">
                            <div className="flex items-center gap-1.5 font-bold text-amber-800">
                              <AlertCircle className="w-4 h-4 shrink-0 text-amber-600" />
                              <span>Buka di Tab Baru untuk NFC HP</span>
                            </div>
                            <p className="text-[10px] text-amber-700 leading-tight">
                              Browser membatasi sensor NFC jika dibuka di dalam frame/preview.
                            </p>
                            <button
                              type="button"
                              onClick={() => window.open(window.location.href, "_blank")}
                              className="w-full py-1.5 bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white rounded-lg font-bold text-[11px] flex items-center justify-center gap-1 shadow-xs cursor-pointer"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                              <span>Buka di Tab Baru Chrome</span>
                            </button>
                          </div>
                        )}

                        {!isScanning ? (
                          <button
                            id="btn-mulai-tap-android"
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleScan();
                            }}
                            className="w-full bg-[#1b3280] hover:bg-[#152766] active:bg-[#0f1c48] text-white font-bold py-3.5 px-5 rounded-2xl shadow-sm transition-all flex items-center justify-center gap-2.5 text-sm sm:text-base active:scale-[0.99] cursor-pointer group"
                          >
                            <Smartphone className="w-5 h-5 text-emerald-400 shrink-0 group-hover:scale-110 transition-transform" />
                            <span>Mulai Tap NFC di Android</span>
                          </button>
                        ) : (
                          <div className="space-y-2 w-full">
                            <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-2xl flex items-center justify-between text-xs text-emerald-900 font-bold shadow-2xs">
                              <div className="flex items-center gap-2">
                                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping shrink-0" />
                                <span className="text-xs">Sensor NFC Android Aktif...</span>
                              </div>
                              <span className="text-[10px] bg-emerald-200 text-emerald-950 px-2 py-0.5 rounded-md font-mono">
                                SCANNING
                              </span>
                            </div>
                            <button
                              id="btn-hentikan-tap-android"
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                stopScan();
                              }}
                              className="w-full bg-rose-50 hover:bg-rose-100 active:bg-rose-200 text-rose-700 font-bold py-2.5 px-3 rounded-2xl border border-rose-200 transition-all flex items-center justify-center gap-1.5 text-xs active:scale-[0.99] cursor-pointer"
                            >
                              <X className="w-4 h-4" />
                              <span>Hentikan Tap Android</span>
                            </button>
                          </div>
                        )}

                        <div className="grid grid-cols-2 gap-2 pt-1">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowAndroidGuideModal(true);
                            }}
                            className="w-full text-slate-600 bg-slate-50 hover:bg-slate-100 py-2 px-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer border border-slate-200/80"
                          >
                            <HelpCircle className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                            <span>Bantuan NFC HP</span>
                          </button>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              fetchPesertaList();
                              setShowQuickManualModal(true);
                            }}
                            className="w-full text-emerald-700 bg-emerald-50 hover:bg-emerald-100 py-2 px-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer border border-emerald-200"
                          >
                            <UserCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            <span>Presensi Manual</span>
                          </button>
                        </div>
                      </div>

                      {usbInputVal && (
                        <div className="mt-3 px-3 py-1.5 bg-blue-50 border border-blue-200 text-blue-950 font-mono text-xs font-bold rounded-xl tracking-wider w-full text-center">
                          Input USB: {usbInputVal}█
                        </div>
                      )}

                      {errorMsg && (
                        <p className="mt-3 text-[11px] text-red-600 bg-red-50 py-2 px-3 rounded-xl w-full border border-red-200 text-center font-medium">
                          {errorMsg}
                        </p>
                      )}
                    </div>

                    {/* Clean Modern Last Scanned UID Indicator */}
                    <div className="p-3.5 bg-slate-50/80 shrink-0 border-t border-slate-100 flex flex-col gap-1.5">
                      <div className="flex justify-between items-center text-[10px]">
                        <span className="text-slate-400 font-bold uppercase tracking-wider">
                          UID Terakhir Terbaca
                        </span>
                        <span className="px-2 py-0.5 rounded-full font-bold bg-emerald-100 text-emerald-800 text-[10px] flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          SIAP TAP
                        </span>
                      </div>
                      <div className="font-mono text-sm font-bold tracking-wider bg-white py-2 px-3 rounded-xl border border-slate-200/80 text-center truncate text-slate-800 shadow-2xs">
                        {records.length > 0 ? records[0].serialNumber.toUpperCase() : "Belum ada kartu di-tap"}
                      </div>
                    </div>
                  </div>
                </section>

                {/* Right Panel: Attendance Table */}
                <section className="flex-1 flex flex-col min-w-0">
                  <div className="flex justify-between items-end mb-2.5 shrink-0">
                    <div>
                      <h2 className="text-lg font-bold text-slate-800">Daftar Kehadiran Sesi Ini</h2>
                      <p className="text-xs text-slate-500 mt-0.5">Sesi: <strong>{activeSession?.nama_sesi || "Umum"}</strong></p>
                    </div>
                    <div className="flex gap-3">
                      <div className="text-right">
                        <div className="text-[10px] text-slate-400 uppercase font-bold">Total Hadir</div>
                        <div className="text-lg font-bold text-[#203598]">{records.length}</div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col overflow-hidden max-h-[380px] sm:max-h-[460px]">
                    {records.length === 0 ? (
                      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center gap-2 bg-white min-h-[200px]">
                        <div className="bg-slate-50 p-3 rounded-full text-slate-400">
                          <Users size={28} />
                        </div>
                        <p className="text-slate-500 text-xs">Belum ada riwayat absensi pada sesi ini.</p>
                      </div>
                    ) : (
                      <div className="overflow-y-auto max-h-[340px] sm:max-h-[420px]">
                        <table className="w-full border-collapse">
                          <thead>
                            <tr className="bg-slate-50 border-b border-slate-200 text-left sticky top-0 z-10">
                              <th className="px-3.5 py-2.5 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                                Foto
                              </th>
                              <th className="px-3.5 py-2.5 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                                Nama &amp; UID Kartu
                              </th>
                              <th className="px-3.5 py-2.5 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                                Waktu Tap
                              </th>
                              <th className="px-3.5 py-2.5 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                                Status
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {records.map((record) => (
                              <tr key={record.id} className="hover:bg-slate-50/50 transition-colors">
                                <td className="px-3.5 py-2">
                                  <div className="w-8 h-8 rounded-full bg-slate-200 overflow-hidden flex-shrink-0 relative border border-slate-300 shadow-2xs">
                                    {record.photoUrl ? (
                                      <Image
                                        src={record.photoUrl}
                                        alt={`Foto ${record.serialNumber}`}
                                        fill
                                        className="object-cover"
                                        referrerPolicy="no-referrer"
                                        unoptimized={true}
                                      />
                                    ) : (
                                      <div className="w-full h-full flex items-center justify-center text-slate-400">
                                        <Users size={16} />
                                      </div>
                                    )}
                                  </div>
                                </td>
                                <td className="px-3.5 py-2">
                                  <div className="font-bold text-slate-900 text-xs">
                                    {record.name || "Peserta NFC"}
                                  </div>
                                  <div className="text-[10px] font-mono text-slate-500">
                                    UID: {record.serialNumber}
                                  </div>
                                </td>
                                <td className="px-3.5 py-2 text-xs text-slate-600 font-medium">
                                  {record.timestamp.toLocaleTimeString("id-ID", {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                    second: "2-digit",
                                  })}
                                </td>
                                <td className="px-3.5 py-2">
                                  {record.statusKehadiran === "Terlambat" ? (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-amber-100 text-amber-900 border border-amber-300/80 text-[10px] font-extrabold rounded-full uppercase">
                                      <span>Terlambat</span>
                                      {record.menitTerlambat && record.menitTerlambat > 0 ? (
                                        <span className="text-[9px] font-mono opacity-80">(+{record.menitTerlambat}m)</span>
                                      ) : null}
                                    </span>
                                  ) : (
                                    <span className="px-2.5 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-extrabold rounded-full uppercase">
                                      Tepat Waktu
                                    </span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    <div className="mt-auto p-2.5 bg-slate-50 border-t border-slate-200 flex justify-center items-center gap-1.5 shrink-0">
                      <span className="w-1.5 h-1.5 bg-slate-400 rounded-full"></span>
                      <span className="w-1.5 h-1.5 bg-slate-300 rounded-full"></span>
                      <span className="w-1.5 h-1.5 bg-slate-300 rounded-full"></span>
                      <span className="text-slate-400 text-[10px] font-medium ml-1">Live Feed Presensi</span>
                    </div>
                  </div>
                </section>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Success / Error Popup Dialog */}
      <SuccessDialog
        isOpen={dialogState.isOpen}
        type={dialogState.type}
        title={dialogState.title}
        message={dialogState.message}
        nama={dialogState.nama}
        serialNumber={dialogState.serialNumber}
        sesiNama={dialogState.sesiNama}
        statusKehadiran={dialogState.statusKehadiran}
        menitTerlambat={dialogState.menitTerlambat}
        photoUrl={dialogState.photoUrl}
        onClose={() => {
          setDialogState((prev) => ({ ...prev, isOpen: false }));
          focusUsbInput();
        }}
      />

      {/* Role & User Auth Modal */}
      <AuthRoleModal
        isOpen={isAuthModalOpen}
        onLoginSuccess={handleLoginSuccess}
      />

      {/* Android Web NFC Guide & Diagnostics Modal */}
      {showAndroidGuideModal && (
        <div
          id="modal-android-nfc-guide"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in"
          onClick={() => setShowAndroidGuideModal(false)}
        >
          <div
            className="bg-white rounded-2xl max-w-xl w-full p-5 sm:p-6 shadow-2xl border border-slate-200 relative overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-3 pb-3.5 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#203598] flex items-center justify-center shrink-0">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-slate-900 leading-snug">
                    Diagnostik &amp; Panduan NFC Android
                  </h3>
                  <p className="text-xs text-slate-500">
                    Solusi membaca kartu NFC langsung dari HP Android
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAndroidGuideModal(false)}
                className="w-8 h-8 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 flex items-center justify-center transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Steps & Diagnostic Content */}
            <div className="py-4 space-y-3.5 max-h-[65vh] overflow-y-auto pr-1">
              {/* Standalone / Iframe Status Notice */}
              <div className="p-3 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-slate-50 border-slate-200">
                <div className="text-xs space-y-0.5">
                  <div className="font-bold text-slate-900 flex items-center gap-1.5">
                    <Radio className="w-3.5 h-3.5 text-[#203598]" />
                    <span>Mode Browser &amp; Tab Mandiri</span>
                  </div>
                  <p className="text-slate-500 text-[11px]">
                    {isInsideIframe
                      ? "Terdeteksi dalam Frame. Disarankan buka di Tab Baru Chrome agar sensor NFC tidak diblokir."
                      : "Berjalan di Tab Utama Browser (Siap Akses Sensor NFC)."}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      if (typeof navigator !== "undefined" && navigator.clipboard) {
                        navigator.clipboard.writeText(window.location.href);
                        setToastMsg({ type: "success", text: "Link web presensi disalin ke clipboard!" });
                      }
                    }}
                    className="px-2.5 py-1.5 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold rounded-lg border border-slate-200 flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>Salin Link</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => window.open(window.location.href, "_blank")}
                    className="px-3 py-1.5 bg-[#203598] hover:bg-[#182a7a] text-white text-xs font-bold rounded-lg flex items-center gap-1 shadow-xs transition-colors cursor-pointer"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Buka di Tab Baru</span>
                  </button>
                </div>
              </div>

              {/* Interactive Live NFC Tester */}
              <div className="p-3.5 bg-blue-50/60 rounded-xl border border-blue-200/80 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-blue-600 animate-ping" />
                    <strong className="text-xs text-blue-950 font-bold">Uji Coba Sensor NFC HP</strong>
                  </div>
                  <button
                    type="button"
                    onClick={handleStartNfcTest}
                    className={`px-3 py-1 text-[11px] font-bold rounded-lg transition-all cursor-pointer ${
                      isTestingNfc
                        ? "bg-emerald-600 text-white animate-pulse"
                        : "bg-blue-600 hover:bg-blue-700 text-white shadow-xs"
                    }`}
                  >
                    {isTestingNfc ? "● Sensor Aktif (Tempelkan Kartu)" : "Mulai Tes Sensor"}
                  </button>
                </div>
                <p className="text-[11px] text-blue-800 leading-relaxed">
                  Tekan &quot;Mulai Tes Sensor&quot; lalu tempelkan kartu di belakang HP untuk memastikan browser dan perangkat dapat membaca chip kartu.
                </p>
                {nfcTestResult && (
                  <div className="p-2.5 bg-white rounded-lg border border-emerald-300 text-xs space-y-1">
                    <div className="text-emerald-700 font-bold flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Kartu Berhasil Terbaca! (Jam: {nfcTestResult.time})</span>
                    </div>
                    <div className="font-mono text-[11px] bg-slate-900 text-emerald-400 p-1.5 rounded truncate">
                      {nfcTestResult.format}
                    </div>
                  </div>
                )}
              </div>

              {/* Antenna Location Guide per Brand */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-2">
                <strong className="text-slate-900 block font-bold">
                  📍 Posisi Antena Sensor NFC di Berbagai Merek HP:
                </strong>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-slate-700">
                  <div className="p-2 bg-white rounded-lg border border-slate-100">
                    <span className="font-bold text-slate-900">Samsung:</span> Bagian tengah punggung HP (center).
                  </div>
                  <div className="p-2 bg-white rounded-lg border border-slate-100">
                    <span className="font-bold text-slate-900">Xiaomi / Poco / Redmi:</span> Bagian atas dekat modul kamera.
                  </div>
                  <div className="p-2 bg-white rounded-lg border border-slate-100">
                    <span className="font-bold text-slate-900">Oppo / Vivo / Realme:</span> Bagian atas / samping kamera belakang.
                  </div>
                  <div className="p-2 bg-white rounded-lg border border-slate-100">
                    <span className="font-bold text-slate-900">Pixel / Infinix:</span> Bagian atas punggung HP.
                  </div>
                </div>
              </div>

              {/* 4 Steps Guide */}
              <div className="space-y-2">
                <div className="flex items-start gap-2.5 p-2.5 bg-white rounded-xl border border-slate-100">
                  <div className="w-5 h-5 rounded-full bg-[#203598] text-white text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                    1
                  </div>
                  <div className="text-xs text-slate-700">
                    <strong className="text-slate-900">Aktifkan NFC di Pengaturan:</strong> Buka Pengaturan HP &gt; Koneksi &gt; NFC dalam status <strong>ON</strong>.
                  </div>
                </div>

                <div className="flex items-start gap-2.5 p-2.5 bg-white rounded-xl border border-slate-100">
                  <div className="w-5 h-5 rounded-full bg-[#203598] text-white text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                    2
                  </div>
                  <div className="text-xs text-slate-700">
                    <strong className="text-slate-900">Gunakan Google Chrome Asli:</strong> Hindari browser in-app (seperti dari link WhatsApp). Buka via Google Chrome.
                  </div>
                </div>

                <div className="flex items-start gap-2.5 p-2.5 bg-white rounded-xl border border-slate-100">
                  <div className="w-5 h-5 rounded-full bg-[#203598] text-white text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                    3
                  </div>
                  <div className="text-xs text-slate-700">
                    <strong className="text-slate-900">Tekan &quot;Mulai Tap di Android&quot;:</strong> Klik tombol biru dan pilih <strong>&quot;Izinkan&quot; (Allow)</strong> saat Chrome meminta izin NFC.
                  </div>
                </div>

                <div className="flex items-start gap-2.5 p-2.5 bg-white rounded-xl border border-slate-100">
                  <div className="w-5 h-5 rounded-full bg-[#203598] text-white text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                    4
                  </div>
                  <div className="text-xs text-slate-700">
                    <strong className="text-slate-900">Lepas Casing Logam/Tebal:</strong> Jika kartu tidak merespons, lepas casing pelindung tebal agar sinyal tidak terhalang.
                  </div>
                </div>
              </div>
            </div>

            {/* Footer Buttons */}
            <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setShowAndroidGuideModal(false)}
                className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                Tutup
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowAndroidGuideModal(false);
                  handleScan();
                }}
                className="px-5 py-2.5 text-xs font-bold text-white bg-[#203598] hover:bg-[#182a7a] rounded-xl shadow-md transition-all flex items-center gap-2 cursor-pointer"
              >
                <Smartphone className="w-4 h-4 text-emerald-300" />
                <span>Mulai Scan Presensi</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quick Manual Attendance Modal (Fallback for damaged cards / Non-NFC) */}
      {showQuickManualModal && (
        <div
          id="modal-quick-manual-attendance"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in"
          onClick={() => setShowQuickManualModal(false)}
        >
          <div
            className="bg-white rounded-2xl max-w-lg w-full p-5 sm:p-6 shadow-2xl border border-slate-200 relative overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
                  <UserCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-slate-900 leading-snug">
                    Presensi Manual (Cari Nama)
                  </h3>
                  <p className="text-xs text-slate-500">
                    Hadirkan peserta secara instan jika kartu NFC rusak atau tertinggal
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowQuickManualModal(false)}
                className="w-8 h-8 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 flex items-center justify-center transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Search Input */}
            <div className="py-3">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Ketik nama peserta atau kelompok..."
                  value={manualSearchQuery}
                  onChange={(e) => setManualSearchQuery(e.target.value)}
                  autoFocus
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#203598]/20 focus:border-[#203598]"
                />
              </div>
            </div>

            {/* Participant Results List */}
            <div className="space-y-1.5 max-h-[50vh] overflow-y-auto pr-1">
              {loadingPesertaList ? (
                <div className="py-8 text-center text-xs text-slate-400">
                  <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-slate-300" />
                  Memuat data peserta...
                </div>
              ) : (
                (() => {
                  const filtered = allPesertaList.filter((p) => {
                    if (!manualSearchQuery.trim()) return true;
                    const q = manualSearchQuery.toLowerCase();
                    const n = String(p.nama || p.nama_peserta || "").toLowerCase();
                    const k = String(p.kelompok || "").toLowerCase();
                    const d = String(p.dapukan || "").toLowerCase();
                    return n.includes(q) || k.includes(q) || d.includes(q);
                  });

                  if (filtered.length === 0) {
                    return (
                      <div className="py-8 text-center text-xs text-slate-400">
                        Tidak ada peserta yang cocok dengan &quot;{manualSearchQuery}&quot;
                      </div>
                    );
                  }

                  return filtered.slice(0, 50).map((p) => {
                    const identifier = p.nfc_uid || p.serial_number || String(p.id);
                    return (
                      <div
                        key={p.id}
                        className="p-2.5 rounded-xl border border-slate-100 hover:border-blue-200 bg-slate-50/50 hover:bg-blue-50/30 flex items-center justify-between gap-3 transition-colors"
                      >
                        <div className="min-w-0">
                          <div className="font-bold text-xs text-slate-900 truncate">
                            {p.nama || p.nama_peserta}
                          </div>
                          <div className="text-[10.5px] text-slate-500 flex items-center gap-2">
                            <span>Kelompok: {p.kelompok || "-"}</span>
                            <span>&bull;</span>
                            <span>Dapukan: {p.dapukan || "-"}</span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={async () => {
                            setShowQuickManualModal(false);
                            await processAbsenRecord(identifier);
                          }}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-lg font-bold text-xs shrink-0 flex items-center gap-1 shadow-xs transition-colors cursor-pointer"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Hadirkan</span>
                        </button>
                      </div>
                    );
                  });
                })()
              )}
            </div>

            {/* Footer */}
            <div className="pt-3 border-t border-slate-100 flex items-center justify-end">
              <button
                type="button"
                onClick={() => setShowQuickManualModal(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Status Bar */}
      <footer className="h-10 bg-white border-t border-slate-200 flex items-center justify-between px-6 shrink-0 z-30">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
            <span>
              NFC Reader: <strong>Tersedia (USB Reader / Web NFC)</strong>
            </span>
          </div>
        </div>
        <div className="text-xs text-slate-400 italic hidden md:block">
          Sistem Monitoring Kehadiran v1.0 &bull; Database Peserta Supabase Active
        </div>
      </footer>
    </div>
  );
}


