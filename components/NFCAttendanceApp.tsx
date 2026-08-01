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
  Volume2
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { hexToDecimal } from "@/lib/utils";
import InputPesertaForm from "./InputPesertaForm";
import DataPesertaTable from "./DataPesertaTable";
import InputNFCPesertaForm from "./InputNFCPesertaForm";
import ManajemenSesi, { SesiAbsensi } from "./ManajemenSesi";
import SuccessDialog from "./SuccessDialog";

interface AttendanceRecord {
  id: string;
  serialNumber: string;
  timestamp: Date;
  status: "success" | "error";
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

export default function NFCAttendanceApp() {
  const [activeTab, setActiveTab] = useState<"presensi" | "input" | "peserta" | "nfc" | "sesi">("presensi");
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

  // Active session state auto check
  const [activeSession, setActiveSession] = useState<SesiAbsensi | null>(null);

  const focusUsbInput = useCallback(() => {
    if (usbInputRef.current && activeTab === "presensi") {
      usbInputRef.current.focus();
      setIsUsbFocused(true);
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === "presensi" && usbModeActive) {
      focusUsbInput();
      const interval = setInterval(() => {
        if (document.activeElement !== usbInputRef.current && activeTab === "presensi") {
          usbInputRef.current?.focus();
        }
      }, 1500);
      return () => clearInterval(interval);
    }
  }, [activeTab, usbModeActive, focusUsbInput]);

  const checkActiveSession = useCallback(async () => {
    try {
      let sessions: SesiAbsensi[] = [];
      const { data, error } = await supabase
        .from("sesi_absensi")
        .select("*")
        .eq("is_active", true);

      if (error || !data || data.length === 0) {
        const localData = typeof window !== "undefined" ? localStorage.getItem("cai_sesi_absensi") : null;
        if (localData) {
          sessions = JSON.parse(localData).filter((s: SesiAbsensi) => s.is_active);
        }
      } else {
        sessions = data;
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
      // Fetch latest 50 records from riwayat_absen
      const { data, error } = await supabase
        .from("riwayat_absen")
        .select("*")
        .order("timestamp", { ascending: false })
        .limit(50);

      if (error) {
        console.warn("Gagal fetch riwayat_absen, mencoba kehadiran:", error);
        // Fallback to kehadiran
        const { data: dataKehadiran } = await supabase
          .from("kehadiran")
          .select("*")
          .order("timestamp", { ascending: false })
          .limit(50);
          
        if (dataKehadiran && isMounted) {
           setRecords(
            dataKehadiran.map((d: any) => ({
              id: `keh-${d.id}`,
              serialNumber: d.serial_number,
              timestamp: new Date(d.timestamp),
              status: "success",
              name: d.nama,
              photoUrl: supabase.storage.from("CAI 2026").getPublicUrl(`Foto Profil/${d.serial_number}.jpg`).data.publicUrl
            }))
          );
        }
        return;
      }

      if (data && isMounted) {
        setRecords(
          data.map((d: any) => ({
            id: d.id.toString(),
            serialNumber: d.serial_number,
            timestamp: new Date(d.timestamp),
            status: "success",
            name: d.nama_peserta || d.nama,
            photoUrl: supabase.storage.from("CAI 2026").getPublicUrl(`Foto Profil/${d.serial_number}.jpg`).data.publicUrl
          }))
        );
      }
    };

    fetchInitialRecords();

    // Subscribe to realtime inserts on riwayat_absen
    const channel = supabase
      .channel("public:riwayat_absen")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "riwayat_absen" },
        (payload) => {
          const newRec = payload.new as any;
          setRecords((prev) => {
            if (prev.some((r) => r.id === newRec.id.toString())) return prev;
            const added: AttendanceRecord = {
              id: newRec.id.toString(),
              serialNumber: newRec.serial_number,
              timestamp: new Date(newRec.timestamp),
              status: "success",
              name: newRec.nama_peserta || newRec.nama,
              photoUrl: supabase.storage.from("CAI 2026").getPublicUrl(`Foto Profil/${newRec.serial_number}.jpg`).data.publicUrl
            };
            return [added, ...prev];
          });
        }
      )
      .subscribe();

    // Subscribe to realtime inserts on kehadiran (fallback)
    const channelKehadiran = supabase
      .channel("public:kehadiran")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "kehadiran" },
        (payload) => {
          const newRec = payload.new as any;
          setRecords((prev) => {
            if (prev.some((r) => r.id === `keh-${newRec.id}`)) return prev;
            const added: AttendanceRecord = {
              id: `keh-${newRec.id}`,
              serialNumber: newRec.serial_number,
              timestamp: new Date(newRec.timestamp),
              status: "success",
              name: newRec.nama,
              photoUrl: supabase.storage.from("CAI 2026").getPublicUrl(`Foto Profil/${newRec.serial_number}.jpg`).data.publicUrl
            };
            return [added, ...prev];
          });
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
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

      // 1. Lookup participant name from Supabase & Local Storage
      let namaPengguna = "";
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

          // If name on nfc_peserta is blank, retrieve from joined 'peserta' table using peserta_id
          if (!namaPengguna && nfcRec.peserta_id) {
            const { data: pDetail } = await supabase
              .from("peserta")
              .select("nama, nama_peserta")
              .eq("id", nfcRec.peserta_id)
              .maybeSingle();

            if (pDetail) {
              namaPengguna = pDetail.nama || pDetail.nama_peserta || "";
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
              if (!namaPengguna && found.peserta_id) {
                const { data: pDetail } = await supabase
                  .from("peserta")
                  .select("nama, nama_peserta")
                  .eq("id", found.peserta_id)
                  .maybeSingle();

                if (pDetail) {
                  namaPengguna = pDetail.nama || pDetail.nama_peserta || "";
                }
              }
            }
          }
        }

        // Fallback search directly in 'peserta' table
        if (!namaPengguna) {
          const { data: fallbackData } = await supabase
            .from("peserta")
            .select("nama, nama_peserta")
            .or(uidCandidates.map((u) => `nfc_uid.eq.${u},serial_number.eq.${u}`).join(","))
            .maybeSingle();

          if (fallbackData) {
            namaPengguna = fallbackData.nama || fallbackData.nama_peserta || "";
          }
        }
      } catch (err) {
        console.warn("Gagal fetch peserta:", err);
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

      // 2. Public Photo URL
      const { data: publicUrlData } = supabase.storage
        .from("CAI 2026")
        .getPublicUrl(`Foto Profil/${cleanUid}.jpg`);

      const photoUrl = publicUrlData?.publicUrl;

      // 3. Save to database
      try {
        await supabase.from("kehadiran").insert([
          {
            serial_number: cleanUid,
            nama: namaPengguna,
            timestamp: new Date().toISOString(),
            sesi_nama: activeSession?.nama_sesi || "Umum",
          },
        ]);
      } catch (dbErr) {
        console.warn("Gagal simpan ke tabel kehadiran:", dbErr);
      }

      setToastMsg({
        type: "success",
        text: `Presensi Berhasil! ${namaPengguna} (UID: ${cleanUid})`,
      });

      setDialogState({
        isOpen: true,
        type: "success",
        title: "Congratulations",
        message: `Presensi Ananda/Bapak/Ibu ${namaPengguna} telah berhasil dicatat pada Sesi ${activeSession?.nama_sesi || "Umum"}.`,
        nama: namaPengguna,
        serialNumber: cleanUid,
        sesiNama: activeSession?.nama_sesi || "Umum",
        photoUrl: photoUrl,
      });

      setTimeout(() => {
        setToastMsg(null);
      }, 4000);
    },
    [activeSession]
  );

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
    peserta: false,
    registrasi: false,
    sesi: false,
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
            className="p-2 hover:bg-white/10 rounded-xl transition-colors hidden lg:flex text-white items-center justify-center"
            title={isSidebarOpen ? "Sembunyikan Label Sidebar" : "Tampilkan Label Sidebar"}
          >
            {isSidebarOpen ? <ChevronLeft className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
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

        {/* Right side status badge */}
        <div className="flex items-center gap-2">
          <div className="px-3 py-1 bg-white/10 border border-white/20 text-white rounded-full text-xs font-medium backdrop-blur-sm hidden sm:flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>Sistem Kehadiran</span>
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
            fixed lg:static inset-y-0 left-0 z-40 bg-white border-r border-slate-200 flex flex-col justify-between transition-all duration-300 ease-in-out shadow-lg lg:shadow-none
            ${isSidebarOpen ? "w-64" : "w-24"}
            ${isMobileOpen ? "translate-x-0 w-64" : "-translate-x-full lg:translate-x-0"}
          `}
        >
          {/* Sidebar Navigation Items */}
          <div className="p-3 space-y-3 overflow-y-auto flex-1">
            <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Menu Utama
            </div>

            {/* Presensi */}
            <div className="space-y-1">
              <button
                onClick={() => {
                  setActiveTab("presensi");
                  setIsMobileOpen(false);
                }}
                className={`w-full px-3.5 py-2.5 rounded-xl text-left font-bold text-sm transition-all flex items-center justify-between ${
                  activeTab === "presensi"
                    ? "bg-[#203598] text-white shadow-md shadow-[#203598]/20"
                    : "text-slate-700 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                <span>Presensi Kehadiran</span>
                <span className="text-[10px] font-extrabold bg-emerald-500 text-white px-1.5 py-0.5 rounded-md">
                  USB / NFC
                </span>
              </button>
            </div>

            {/* Peserta */}
            <div className="space-y-1">
              <button
                onClick={() => toggleSubmenu("peserta")}
                className="w-full px-3.5 py-2 rounded-xl text-left font-bold text-sm text-slate-700 hover:bg-slate-100 flex items-center justify-between transition-colors"
              >
                <span>Peserta</span>
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
                    className={`w-full px-3 py-2 rounded-lg text-left text-sm font-semibold transition-all ${
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

            {/* Registrasi */}
            <div className="space-y-1">
              <button
                onClick={() => toggleSubmenu("registrasi")}
                className="w-full px-3.5 py-2 rounded-xl text-left font-bold text-sm text-slate-700 hover:bg-slate-100 flex items-center justify-between transition-colors"
              >
                <span>Registrasi</span>
                <ChevronDown
                  className={`w-4 h-4 text-slate-400 transition-transform ${
                    expandedMenus.registrasi ? "rotate-180" : ""
                  }`}
                />
              </button>

              {expandedMenus.registrasi && (
                <div className="pl-3 space-y-1 border-l-2 border-slate-200 ml-4">
                  <button
                    onClick={() => {
                      setActiveTab("input");
                      setIsMobileOpen(false);
                    }}
                    className={`w-full px-3 py-2 rounded-lg text-left text-sm font-semibold transition-all ${
                      activeTab === "input"
                        ? "bg-[#203598] text-white shadow-sm"
                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                    }`}
                  >
                    Input Peserta
                  </button>
                  <button
                    onClick={() => {
                      setActiveTab("nfc");
                      setIsMobileOpen(false);
                    }}
                    className={`w-full px-3 py-2 rounded-lg text-left text-sm font-semibold transition-all ${
                      activeTab === "nfc"
                        ? "bg-[#203598] text-white shadow-sm"
                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                    }`}
                  >
                    Input NFC
                  </button>
                </div>
              )}
            </div>

            {/* Sesi */}
            <div className="space-y-1">
              <button
                onClick={() => toggleSubmenu("sesi")}
                className="w-full px-3.5 py-2 rounded-xl text-left font-bold text-sm text-slate-700 hover:bg-slate-100 flex items-center justify-between transition-colors"
              >
                <span>Sesi</span>
                <ChevronDown
                  className={`w-4 h-4 text-slate-400 transition-transform ${
                    expandedMenus.sesi ? "rotate-180" : ""
                  }`}
                />
              </button>

              {expandedMenus.sesi && (
                <div className="pl-3 space-y-1 border-l-2 border-slate-200 ml-4">
                  <button
                    onClick={() => {
                      setActiveTab("sesi");
                      setIsMobileOpen(false);
                    }}
                    className={`w-full px-3 py-2 rounded-lg text-left text-sm font-semibold transition-all ${
                      activeTab === "sesi"
                        ? "bg-[#203598] text-white shadow-sm"
                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                    }`}
                  >
                    Manajemen Sesi
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Sidebar Footer */}
          <div className="p-3 border-t border-slate-100 bg-slate-50/50 text-center">
            <p className="text-[10px] text-slate-400 font-medium">
              {isSidebarOpen ? "CAI 2026 Kota Madiun" : "CAI '26"}
            </p>
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 p-4 md:p-8 max-w-7xl mx-auto w-full overflow-y-auto">
          {activeTab === "sesi" && <ManajemenSesi />}

          {activeTab === "nfc" && <InputNFCPesertaForm />}

          {activeTab === "input" && (
            <InputPesertaForm onGoToData={() => setActiveTab("peserta")} />
          )}

          {activeTab === "peserta" && (
            <DataPesertaTable onGoToInput={() => setActiveTab("input")} />
          )}

          {activeTab === "presensi" && (
            <div className="flex flex-col gap-6 h-full">
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
              <div className="w-full">
                {activeSession ? (
                  <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className="w-3.5 h-3.5 rounded-full bg-emerald-500 animate-ping shrink-0" />
                      <div>
                        <div className="text-[10px] font-extrabold text-emerald-800 uppercase tracking-wider">
                          Otomatis Aktif Sesi Presensi Saat Ini
                        </div>
                        <div className="text-base font-bold text-emerald-950">
                          {activeSession.nama_sesi}
                        </div>
                        <div className="text-xs text-emerald-700 font-medium">
                          Jam {activeSession.jam_mulai.slice(0, 5)} - {activeSession.jam_selesai.slice(0, 5)} WIB
                          {activeSession.keterangan ? ` • ${activeSession.keterangan}` : ""}
                        </div>
                      </div>
                    </div>
                    <span className="px-3.5 py-1.5 bg-emerald-600 text-white text-xs font-extrabold rounded-full shadow-sm shrink-0">
                      SEDANG BERLANGSUNG
                    </span>
                  </div>
                ) : (
                  <div className="p-4 bg-slate-100 border border-slate-200 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-3.5 h-3.5 rounded-full bg-slate-400 shrink-0" />
                      <div>
                        <div className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">
                          Status Sesi Presensi
                        </div>
                        <div className="text-sm font-bold text-slate-700">
                          Tidak ada sesi absensi otomatis yang berlangsung saat ini
                        </div>
                        <div className="text-xs text-slate-400">
                          Pemindaian tetap dapat digunakan, atau atur jadwal di menu Sesi &gt; Manajemen Sesi.
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => setActiveTab("sesi")}
                      className="px-3.5 py-1.5 bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-semibold rounded-xl transition-colors shrink-0 shadow-2xs"
                    >
                      Kelola Sesi
                    </button>
                  </div>
                )}
              </div>

              {/* Toast Feedback Notification */}
              {toastMsg && (
                <div className={`p-4 rounded-2xl border font-bold text-sm flex items-center gap-3 shadow-md transition-all ${
                  toastMsg.type === "success"
                    ? "bg-emerald-600 text-white border-emerald-700"
                    : "bg-rose-600 text-white border-rose-700"
                }`}>
                  <CheckCircle2 className="w-6 h-6 shrink-0" />
                  <span>{toastMsg.text}</span>
                </div>
              )}

              <div className="flex flex-col md:flex-row gap-6 md:gap-8 flex-1">
                {/* Left Panel: Scanner */}
                <section className="w-full md:w-[400px] flex flex-col gap-4 shrink-0">
                  {/* Status Indicator Bar */}
                  <div className="bg-white border border-slate-200 rounded-xl p-3 flex items-center justify-between text-xs shadow-2xs">
                    <span className="text-slate-500 font-bold">Dukungan Device:</span>
                    {isSupported ? (
                      <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full font-bold flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        Web NFC &amp; USB Reader Active
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-full font-bold flex items-center gap-1.5">
                        <Usb className="w-3.5 h-3.5 text-blue-600" />
                        USB NFC Reader Active (Keyboard Mode)
                      </span>
                    )}
                  </div>

                  {/* Only show warning if BOTH Web NFC is missing AND USB mode is off */}
                  {isSupported === false && !usbModeActive && (
                    <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-md shadow-sm">
                      <div className="flex">
                        <div className="flex-shrink-0">
                          <AlertCircle className="h-5 w-5 text-red-500" />
                        </div>
                        <div className="ml-3">
                          <p className="text-sm text-red-700">
                            Perangkat Anda tidak mendukung fitur Web NFC dan Mode USB Reader tidak aktif.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Scan Card Container */}
                  <div
                    onClick={focusUsbInput}
                    className="flex-1 bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden flex flex-col cursor-pointer hover:border-blue-300 transition-colors"
                  >
                    <div className="bg-slate-50 p-3.5 border-b border-slate-100 flex items-center justify-between shrink-0">
                      <span className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                        <Usb className="w-4 h-4 text-[#203598]" />
                        Area Pemindaian Kartu NFC
                      </span>
                      <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${
                        isUsbFocused ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                      }`}>
                        {isUsbFocused ? "● Ready Tap USB" : "Klik untuk Fokus"}
                      </span>
                    </div>

                    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center min-h-[280px]">
                      <div className="w-40 h-40 bg-blue-50 rounded-full flex items-center justify-center relative mb-6">
                        {isScanning && (
                          <>
                            <div className="absolute inset-0 border-4 border-[#203598] opacity-10 rounded-full scale-110 animate-ping"></div>
                            <div className="absolute inset-0 border-2 border-[#203598] opacity-20 rounded-full scale-125 animate-pulse"></div>
                          </>
                        )}
                        <Nfc
                          size={80}
                          className={`transition-colors duration-300 ${
                            isScanning ? "text-[#203598]" : "text-slate-400"
                          }`}
                        />
                      </div>

                      <h2 className="text-2xl font-bold text-slate-900 mb-1">
                        {isScanning ? "Menunggu Kartu..." : "Silakan Tap Kartu NFC"}
                      </h2>
                      <p className="text-slate-500 text-xs mb-6 max-w-[280px]">
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
                            className="w-full bg-[#203598] hover:bg-[#1a2c7d] text-white font-medium py-3 px-6 rounded-xl shadow-md shadow-[#203598]/20 transition-all flex items-center justify-center gap-2 text-sm"
                          >
                            <Activity size={18} />
                            Mulai Scan Web NFC (Internal HP)
                          </button>
                        ) : (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              stopScan();
                            }}
                            className="w-full bg-red-50 hover:bg-red-100 text-red-600 font-medium py-3 px-6 rounded-xl border border-red-200 transition-all flex items-center justify-center gap-2 text-sm"
                          >
                            Batal Scan Web NFC
                          </button>
                        )
                      ) : null}

                      {usbInputVal && (
                        <div className="mt-4 px-3 py-1 bg-slate-900 text-emerald-400 font-mono text-xs rounded-md tracking-wider">
                          Mengetik USB: {usbInputVal}█
                        </div>
                      )}

                      {errorMsg && (
                        <p className="mt-4 text-xs text-red-500 bg-red-50 py-2 px-3 rounded-lg w-full">
                          {errorMsg}
                        </p>
                      )}
                    </div>

                    <div className="p-4 bg-slate-900 shrink-0">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">
                          UID Terakhir Terbaca
                        </span>
                        <span className="px-2 py-0.5 text-[10px] rounded font-bold bg-green-500/20 text-green-400">
                          READY
                        </span>
                      </div>
                      <div className="font-mono text-lg tracking-[0.2em] bg-black/40 p-3 rounded-lg border border-slate-800 shadow-inner text-center truncate text-[#00FF41]">
                        {records.length > 0 ? records[0].serialNumber.toUpperCase() : "--:--:--:--:--"}
                      </div>
                    </div>
                  </div>
                </section>

                {/* Right Panel: Attendance Table */}
                <section className="flex-1 flex flex-col min-w-0">
                  <div className="flex justify-between items-end mb-4 shrink-0">
                    <div>
                      <h2 className="text-xl font-bold text-slate-800">Daftar Kehadiran Hari Ini</h2>
                      <p className="text-xs text-slate-500 mt-0.5">Sesi: <strong>{activeSession?.nama_sesi || "Umum"}</strong></p>
                    </div>
                    <div className="flex gap-4">
                      <div className="text-center">
                        <div className="text-xs text-slate-400 uppercase font-bold">Total Hadir</div>
                        <div className="text-xl font-bold text-[#203598]">{records.length}</div>
                      </div>
                    </div>
                  </div>

                  <div className="flex-1 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
                    {records.length === 0 ? (
                      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center gap-3 bg-white">
                        <div className="bg-slate-50 p-4 rounded-full text-slate-400">
                          <Users size={32} />
                        </div>
                        <p className="text-slate-500 text-sm">Belum ada riwayat absensi hari ini.</p>
                      </div>
                    ) : (
                      <div className="flex-1 overflow-auto">
                        <table className="w-full border-collapse">
                          <thead>
                            <tr className="bg-slate-50 border-b border-slate-200 text-left sticky top-0 z-10">
                              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest">
                                Foto
                              </th>
                              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest">
                                Nama &amp; UID Kartu
                              </th>
                              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest">
                                Waktu Tap
                              </th>
                              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest">
                                Status
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {records.map((record) => (
                              <tr key={record.id} className="hover:bg-slate-50/50 transition-colors">
                                <td className="px-6 py-4">
                                  <div className="w-10 h-10 rounded-full bg-slate-200 overflow-hidden flex-shrink-0 relative border border-slate-300 shadow-2xs">
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
                                        <Users size={20} />
                                      </div>
                                    )}
                                  </div>
                                </td>
                                <td className="px-6 py-4">
                                  <div className="font-bold text-slate-900 text-sm">
                                    {record.name || "Peserta NFC"}
                                  </div>
                                  <div className="text-xs font-mono text-slate-500">
                                    UID: {record.serialNumber}
                                  </div>
                                </td>
                                <td className="px-6 py-4 text-sm text-slate-600 font-medium">
                                  {record.timestamp.toLocaleTimeString("id-ID", {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                    second: "2-digit",
                                  })}
                                </td>
                                <td className="px-6 py-4">
                                  <span className="px-3 py-1 bg-emerald-100 text-emerald-800 text-xs font-extrabold rounded-full uppercase">
                                    Hadir
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    <div className="mt-auto p-4 bg-slate-50 border-t border-slate-200 flex justify-center items-center gap-2 shrink-0">
                      <span className="w-2 h-2 bg-slate-400 rounded-full"></span>
                      <span className="w-2 h-2 bg-slate-300 rounded-full"></span>
                      <span className="w-2 h-2 bg-slate-300 rounded-full"></span>
                      <span className="text-slate-400 text-xs font-medium ml-2">Halaman 1</span>
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
        photoUrl={dialogState.photoUrl}
        onClose={() => {
          setDialogState((prev) => ({ ...prev, isOpen: false }));
          focusUsbInput();
        }}
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


