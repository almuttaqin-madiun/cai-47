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
  UserCheck
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { hexToDecimal, toTitleCase } from "@/lib/utils";
import InputPesertaForm from "./InputPesertaForm";
import DataPesertaTable from "./DataPesertaTable";
import InputNFCPesertaForm from "./InputNFCPesertaForm";
import ManajemenSesi, { SesiAbsensi, calculateWaktuTelat } from "./ManajemenSesi";
import RekapPresensi from "./RekapPresensi";
import SuccessDialog from "./SuccessDialog";
import PlottingPeserta from "./PlottingPeserta";
import StatistikKehadiran from "./StatistikKehadiran";
import PerizinanSesi from "./PerizinanSesi";
import AuthRoleModal, { UserSession, RoleType } from "./AuthRoleModal";

interface AttendanceRecord {
  id: string;
  serialNumber: string;
  timestamp: Date;
  status: "success" | "error";
  statusKehadiran?: string;
  menitTerlambat?: number;
  photoUrl?: string;
  name?: string;
}

function getUidCandidates(input: string): string[] {
  const clean = input.trim();
  const candidates = new Set<string>([clean]);

  const stripped = clean.replace(/[:\s-]/g, "");
  if (stripped) {
    candidates.add(stripped);
    candidates.add(stripped.toLowerCase());
    candidates.add(stripped.toUpperCase());
  }

  if (/^\d+$/.test(stripped)) {
    try {
      const num = BigInt(stripped);
      const hex = num.toString(16);
      candidates.add(hex);
      candidates.add(hex.toLowerCase());
      candidates.add(hex.toUpperCase());

      const hexColons = hex.padStart(hex.length + (hex.length % 2), "0").match(/.{1,2}/g)?.join(":") || "";
      if (hexColons) {
        candidates.add(hexColons.toLowerCase());
        candidates.add(hexColons.toUpperCase());
      }
    } catch (e) {}
  }

  if (/^[0-9a-fA-F]+$/.test(stripped)) {
    try {
      const dec = BigInt("0x" + stripped).toString(10);
      candidates.add(dec);
    } catch (e) {}
  }

  return Array.from(candidates).filter(Boolean);
}

// Role-to-Tabs Permissions Matrix
const ROLE_ALLOWED_TABS: Record<string, string[]> = {
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
    "presensi_izin",
    "nfc",
    "peserta",
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
        if (parsed && parsed.role && parsed.nama_lengkap) {
          setCurrentUser(parsed);
          // Ensure activeTab is allowed for this role
          const roleKey = String(parsed.role).toLowerCase();
          const allowed = ROLE_ALLOWED_TABS[roleKey] || [];
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

    const roleKey = String(user.role).toLowerCase();
    const allowed = ROLE_ALLOWED_TABS[roleKey] || [];
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
    const roleKey = String(currentUser.role).toLowerCase();
    const allowed = ROLE_ALLOWED_TABS[roleKey];
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
      setIsSupported("NDEFReader" in window);
      checkActiveSession();
      const interval = setInterval(checkActiveSession, 10000);
      return () => clearInterval(interval);
    }
  }, [checkActiveSession]);

  // Load and listen to realtime records
  useEffect(() => {
    let isMounted = true;

    const fetchInitialRecords = async () => {
      try {
        const [resRiwayat, resKehadiran] = await Promise.all([
          supabase.from("riwayat_absen").select("*").order("timestamp", { ascending: false }).limit(100),
          supabase.from("kehadiran").select("*").order("timestamp", { ascending: false }).limit(100),
        ]);

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
        };

        return [added, ...prev];
      });
    };

    // Subscribe to realtime inserts on riwayat_absen
    const channel = supabase
      .channel("public:riwayat_absen")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "riwayat_absen" },
        (payload) => handleNewRecord(payload.new, "rw")
      )
      .subscribe();

    // Subscribe to realtime inserts on kehadiran (fallback)
    const channelKehadiran = supabase
      .channel("public:kehadiran")
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
  }, []);

  const processAbsenRecord = useCallback(
    async (uid: string) => {
      if (!uid || !uid.trim()) return;
      // Standarisasi: Pastikan UID diubah ke desimal jika berupa format hex (misal 31:79:E8:A7)
      const cleanUid = hexToDecimal(uid.trim(), true);

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
      const uidCandidates = getUidCandidates(cleanUid);

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
            const found = localPeserta.find(
              (p: any) =>
                p.nfc_uid === cleanUid ||
                p.serial_number === cleanUid ||
                p.nfc_uid === cleanUid.toLowerCase() ||
                p.nfc_uid === cleanUid.toUpperCase()
            );
            if (found) {
              namaPengguna = found.nama || found.nama_peserta || "";
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
          title: "Uh Oh",
          message: `Identitas tidak dikenal! Kartu NFC dengan UID (${cleanUid}) belum terdaftar di database peserta.`,
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

      // 4. Save to database (Save to riwayat_absen & kehadiran)
      try {
        const timestampNow = new Date().toISOString();
        const sesiNamaNow = activeSession?.nama_sesi || "Umum";

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
        timestamp: new Date(),
        status: "success",
        statusKehadiran: statusKehadiran,
        menitTerlambat: menitTerlambat,
        photoUrl: photoUrl,
      };
      setRecords((prev) => [newAttendanceRecord, ...prev.slice(0, 49)]);

      setToastMsg({
        type: "success",
        text: `Presensi Berhasil! ${namaPengguna} (${statusKehadiran === "Terlambat" ? `Terlambat +${menitTerlambat}m` : "Tepat Waktu"})`,
      });

      setDialogState({
        isOpen: true,
        type: "success",
        title: "Congratulations",
        message: `Presensi Ananda/Bapak/Ibu ${namaPengguna} telah berhasil dicatat pada Sesi ${activeSession?.nama_sesi || "Umum"}.`,
        nama: namaPengguna,
        serialNumber: cleanUid,
        sesiNama: activeSession?.nama_sesi || "Umum",
        statusKehadiran: statusKehadiran,
        menitTerlambat: menitTerlambat,
        photoUrl: photoUrl,
      });

      setTimeout(() => {
        setToastMsg(null);
      }, 4000);
    },
    [activeSession]
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
    if (!("NDEFReader" in window)) {
      setErrorMsg("Browser ini tidak mendukung Web NFC. Namun Anda tetap dapat menggunakan USB NFC Reader.");
      return;
    }

    try {
      // @ts-ignore
      const ndef = new window.NDEFReader();
      await ndef.scan();
      setIsScanning(true);
      setErrorMsg(null);

      ndef.addEventListener("reading", async ({ serialNumber }: any) => {
        const rawUid = serialNumber || "Tidak diketahui";
        // Standarisasi: Konversi hex Android (contoh "31:79:E8:A7") ke desimal murni ("2817030449")
        const decimalUid = hexToDecimal(rawUid, true);
        await processAbsenRecord(decimalUid);
      });

      ndef.addEventListener("readingerror", () => {
        setErrorMsg("Gagal membaca tag NFC. Silakan coba lagi.");
      });
    } catch (error: any) {
      setIsScanning(false);
      setErrorMsg(`Error Web NFC: ${error.message}`);
    }
  }, [processAbsenRecord]);

  const stopScan = useCallback(() => {
    setIsScanning(false);
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
            onClick={() => setIsMobileOpen(false)}
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-40 lg:hidden"
          />
        )}

        {/* Sidebar Navigation */}
        <aside
          className={`
            fixed lg:static inset-y-0 left-0 z-40 bg-white flex flex-col justify-between transition-all duration-300 ease-in-out shadow-lg lg:shadow-none overflow-hidden
            ${isSidebarOpen ? "w-64 border-r border-slate-200 opacity-100 visible" : "w-0 border-r-0 p-0 opacity-0 invisible pointer-events-none -translate-x-full lg:translate-x-0"}
            ${isMobileOpen ? "translate-x-0 !w-64 !opacity-100 !visible !pointer-events-auto !border-r !border-slate-200" : ""}
          `}
        >
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
            {(isTabAllowed("presensi") || isTabAllowed("presensi_grafik") || isTabAllowed("presensi_izin")) && (
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

                    {isTabAllowed("presensi_grafik") && (
                      <button
                        onClick={() => {
                          setActiveTab("presensi_grafik");
                          setIsMobileOpen(false);
                        }}
                        className={`w-full px-3 py-2 rounded-lg text-left text-sm font-semibold transition-all flex items-center justify-between cursor-pointer ${
                          activeTab === "presensi_grafik" || activeTab === "statistik"
                            ? "bg-[#203598] text-white shadow-sm"
                            : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                        }`}
                      >
                        <span>Grafik Presensi</span>
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
          <div className="p-3 border-t border-slate-100 bg-slate-50/50 text-center">
            <p className="text-[10px] text-slate-400 font-medium">
              {isSidebarOpen ? "CAI 2026 Kota Madiun" : "CAI '26"}
            </p>
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
                    className="bg-white rounded-xl border border-slate-200 shadow-md overflow-hidden flex flex-col cursor-pointer hover:border-blue-300 transition-colors"
                  >
                    <div className="bg-slate-50 p-2.5 border-b border-slate-100 flex items-center justify-between shrink-0">
                      <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                        <Usb className="w-3.5 h-3.5 text-[#203598]" />
                        Area Pemindaian Kartu NFC
                      </span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        isUsbFocused ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                      }`}>
                        {isUsbFocused ? "● Ready Tap USB" : "Klik untuk Fokus"}
                      </span>
                    </div>

                    <div className="flex flex-col items-center justify-center p-4 text-center">
                      <div className="w-24 h-24 bg-blue-50 rounded-full flex items-center justify-center relative mb-3">
                        {isScanning && (
                          <>
                            <div className="absolute inset-0 border-4 border-[#203598] opacity-10 rounded-full scale-110 animate-ping"></div>
                            <div className="absolute inset-0 border-2 border-[#203598] opacity-20 rounded-full scale-125 animate-pulse"></div>
                          </>
                        )}
                        <Nfc
                          size={48}
                          className={`transition-colors duration-300 ${
                            isScanning ? "text-[#203598]" : "text-slate-400"
                          }`}
                        />
                      </div>

                      <h2 className="text-lg font-bold text-slate-900 mb-0.5">
                        {isScanning ? "Menunggu Kartu..." : "Silakan Tap Kartu NFC"}
                      </h2>
                      <p className="text-slate-500 text-[11px] mb-3 max-w-[240px]">
                        Tempelkan kartu NFC ke modul USB NFC Reader atau HP Android Anda.
                      </p>

                      {/* Web NFC scan trigger for supported mobile devices */}
                      {isSupported ? (
                        !isScanning ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleScan();
                            }}
                            className="w-full bg-[#203598] hover:bg-[#1a2c7d] text-white font-medium py-2 px-4 rounded-lg shadow-sm transition-all flex items-center justify-center gap-1.5 text-xs"
                          >
                            <Activity size={15} />
                            Mulai Scan Web NFC
                          </button>
                        ) : (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              stopScan();
                            }}
                            className="w-full bg-red-50 hover:bg-red-100 text-red-600 font-medium py-2 px-4 rounded-lg border border-red-200 transition-all flex items-center justify-center gap-1.5 text-xs"
                          >
                            Batal Scan Web NFC
                          </button>
                        )
                      ) : null}

                      {usbInputVal && (
                        <div className="mt-2 px-2.5 py-1 bg-slate-900 text-emerald-400 font-mono text-[11px] rounded tracking-wider">
                          Mengetik: {usbInputVal}█
                        </div>
                      )}

                      {errorMsg && (
                        <p className="mt-2 text-[11px] text-red-500 bg-red-50 py-1.5 px-2.5 rounded-md w-full">
                          {errorMsg}
                        </p>
                      )}
                    </div>

                    <div className="p-3 bg-slate-900 shrink-0 border-t border-slate-800">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-slate-400 text-[9px] font-bold uppercase tracking-widest">
                          UID Terakhir Terbaca
                        </span>
                        <span className="px-1.5 py-0.2 text-[9px] rounded font-bold bg-green-500/20 text-green-400">
                          READY
                        </span>
                      </div>
                      <div className="font-mono text-base tracking-[0.15em] bg-black/40 p-2 rounded border border-slate-800 shadow-inner text-center truncate text-[#00FF41]">
                        {records.length > 0 ? records[0].serialNumber.toUpperCase() : "--:--:--:--:--"}
                      </div>
                    </div>
                  </div>
                </section>

                {/* Right Panel: Attendance Table */}
                <section className="flex-1 flex flex-col min-w-0">
                  <div className="flex justify-between items-end mb-2.5 shrink-0">
                    <div>
                      <h2 className="text-lg font-bold text-slate-800">Daftar Kehadiran Hari Ini</h2>
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
                        <p className="text-slate-500 text-xs">Belum ada riwayat absensi hari ini.</p>
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

              {/* Integrated Session Attendance Statistics & Donut Chart */}
              <div className="pt-3 border-t border-slate-200/80">
                <StatistikKehadiran embedded={true} defaultSessionName={activeSession?.nama_sesi} />
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


