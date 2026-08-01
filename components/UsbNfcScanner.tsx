"use client";

import { useState, useRef, useEffect } from "react";
import SuccessDialog from "./SuccessDialog";
import { hexToDecimal } from "@/lib/utils";
import {
  Usb,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Clock,
  Sparkles,
  AlertCircle,
  Volume2,
  HelpCircle,
  UserCheck
} from "lucide-react";

interface AbsenResult {
  success: boolean;
  message: string;
  nama?: string;
  serial_number?: string;
  timestamp?: string;
}

export default function UsbNfcScanner() {
  const [serialInput, setSerialInput] = useState("");
  const [lastResult, setLastResult] = useState<AbsenResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<AbsenResult[]>([]);
  const [isFocused, setIsFocused] = useState(true);

  const [dialogState, setDialogState] = useState<{
    isOpen: boolean;
    type: "success" | "error";
    title: string;
    message: string;
    nama?: string;
    serialNumber?: string;
  }>({
    isOpen: false,
    type: "success",
    title: "",
    message: "",
  });

  const inputRef = useRef<HTMLInputElement>(null);

  // Auto focus input on mount & click anywhere on container
  useEffect(() => {
    focusInput();
    const interval = setInterval(() => {
      // Re-focus if element is active or tab is visible
      if (document.activeElement !== inputRef.current) {
        inputRef.current?.focus();
      }
    }, 1500);

    return () => clearInterval(interval);
  }, []);

  const focusInput = () => {
    if (inputRef.current) {
      inputRef.current.focus();
      setIsFocused(true);
    }
  };

  // Sound feedback simulation
  const playBeep = (isSuccess: boolean) => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = isSuccess ? "sine" : "sawtooth";
      osc.frequency.setValueAtTime(isSuccess ? 880 : 300, audioCtx.currentTime); // A5 or Low pitch
      gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + (isSuccess ? 0.2 : 0.4));
    } catch (e) {
      // AudioContext optional
    }
  };

  const handleKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const scannedUid = serialInput.trim();
      if (!scannedUid) return;

      setLoading(true);
      setLastResult(null);

      try {
        const res = await fetch("/api/absen", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ serial_number: scannedUid }),
        });

        const data = await res.json();
        playBeep(data.success);

        const resObj: AbsenResult = {
          success: data.success,
          message: data.message || "Proses absensi selesai.",
          nama: data.nama,
          serial_number: scannedUid,
          timestamp: new Date().toLocaleTimeString("id-ID"),
        };

        setLastResult(resObj);
        if (data.success) {
          setHistory((prev) => [resObj, ...prev]);
          setDialogState({
            isOpen: true,
            type: "success",
            title: "Presensi Berhasil!",
            message: `Presensi ${data.nama ? data.nama : "kartu"} telah berhasil dicatat!`,
            nama: data.nama,
            serialNumber: scannedUid,
          });
        } else {
          setDialogState({
            isOpen: true,
            type: "error",
            title: "Presensi Gagal!",
            message: data.message || "Gagal mencatat absensi.",
            serialNumber: scannedUid,
          });
        }
      } catch (err: any) {
        playBeep(false);
        const errMsg = err.message || "Gagal menghubungi API Absensi.";
        setLastResult({
          success: false,
          message: errMsg,
          serial_number: scannedUid,
        });
        setDialogState({
          isOpen: true,
          type: "error",
          title: "Presensi Gagal!",
          message: errMsg,
          serialNumber: scannedUid,
        });
      } finally {
        setLoading(false);
        setSerialInput(""); // Reset input untuk kartu berikutnya
        focusInput();
      }
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6" onClick={focusInput}>
      {/* Hidden Auto-focused Input */}
      <input
        ref={inputRef}
        type="text"
        value={serialInput}
        onChange={(e) => setSerialInput(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        className="opacity-0 absolute pointer-events-none w-1 h-1 -z-10"
        autoComplete="off"
        aria-hidden="true"
      />

      {/* Header Info */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Usb className="w-6 h-6 text-[#203598]" />
            Scanner NFC USB Reader (Mode Keyboard)
          </h2>
          <p className="text-slate-500 text-xs mt-1">
            Silakan tempelkan kartu NFC ke modul USB NFC Reader. Sistem secara otomatis mendeteksi input keyboard dan mencatat absensi.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 border ${
              isFocused
                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                : "bg-amber-50 text-amber-700 border-amber-200"
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                isFocused ? "bg-emerald-500 animate-ping" : "bg-amber-500"
              }`}
            />
            {isFocused ? "Siap Memindai (Auto-Focus Active)" : "Klik Layar Untuk Fokus"}
          </span>
        </div>
      </div>

      {/* Tap Status Display Box */}
      <div className="bg-gradient-to-br from-[#203598] to-[#122268] rounded-3xl p-8 sm:p-12 text-white shadow-xl text-center space-y-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-10">
          <Usb className="w-48 h-48 text-white" />
        </div>

        <div className="relative z-10 space-y-4 max-w-lg mx-auto">
          <div className="w-20 h-20 bg-white/10 backdrop-blur-md rounded-2xl border border-white/20 flex items-center justify-center mx-auto shadow-inner">
            {loading ? (
              <RefreshCw className="w-10 h-10 text-amber-300 animate-spin" />
            ) : lastResult?.success ? (
              <CheckCircle2 className="w-10 h-10 text-emerald-400" />
            ) : lastResult?.success === false ? (
              <XCircle className="w-10 h-10 text-rose-400" />
            ) : (
              <Usb className="w-10 h-10 text-blue-200 animate-bounce" />
            )}
          </div>

          <div>
            <h3 className="text-2xl font-black tracking-tight">
              {loading
                ? "Memproses Absensi..."
                : lastResult
                ? lastResult.message
                : "Tempelkan Kartu NFC pada USB Reader"}
            </h3>
            <p className="text-blue-200 text-xs mt-1 font-medium">
              USB NFC Reader akan mengetikkan nomor seri &amp; menekan Enter secara otomatis.
            </p>
          </div>

          {/* Scanned Serial Buffer Display */}
          <div className="pt-2">
            <span className="inline-block px-4 py-2 bg-black/30 rounded-xl text-xs font-mono text-emerald-300 border border-white/10 tracking-widest">
              Buffer Scanner: {serialInput ? `${serialInput}█` : "Menunggu input kartu..."}
            </span>
          </div>
        </div>
      </div>

      {/* Result Cards */}
      {lastResult && (
        <div
          className={`p-5 rounded-2xl border flex items-start gap-4 shadow-sm animate-in fade-in zoom-in-95 ${
            lastResult.success
              ? "bg-emerald-50 text-emerald-900 border-emerald-200"
              : "bg-rose-50 text-rose-900 border-rose-200"
          }`}
        >
          {lastResult.success ? (
            <UserCheck className="w-7 h-7 text-emerald-600 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-7 h-7 text-rose-600 shrink-0 mt-0.5" />
          )}

          <div className="space-y-1">
            <h4 className="font-bold text-base">{lastResult.message}</h4>
            {lastResult.nama && (
              <p className="text-xs font-medium text-slate-700">
                Nama Peserta: <strong>{lastResult.nama}</strong> | UID:{" "}
                <code className="font-mono bg-white px-1.5 py-0.5 rounded border">
                  {lastResult.serial_number}
                </code>
              </p>
            )}
          </div>
        </div>
      )}

      {/* Scanned History Table */}
      {history.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 font-bold text-xs uppercase tracking-wider text-slate-500 bg-slate-50">
            Riwayat Absensi USB Scanner Sesi Ini ({history.length})
          </div>
          <div className="divide-y divide-slate-100">
            {history.map((item, idx) => (
              <div key={idx} className="p-4 flex items-center justify-between text-sm hover:bg-slate-50">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs">
                    #{history.length - idx}
                  </div>
                  <div>
                    <div className="font-bold text-slate-800">{item.nama || "Peserta NFC"}</div>
                    <div className="text-xs font-mono text-slate-400">UID: {item.serial_number}</div>
                  </div>
                </div>
                <div className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  {item.timestamp}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Guide Card */}
      <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200 space-y-2 text-xs text-slate-600">
        <div className="font-bold text-slate-800 flex items-center gap-1.5 text-sm">
          <HelpCircle className="w-4 h-4 text-[#203598]" />
          Petunjuk Penggunaan USB NFC Reader
        </div>
        <ul className="list-disc pl-5 space-y-1">
          <li>Hubungkan alat USB NFC Reader ke komputer/laptop melalui port USB.</li>
          <li>Pastikan lampu indikator alat menyala. Tidak perlu install driver tambahan karena alat terdeteksi sebagai keyboard.</li>
          <li>Tempelkan kartu NFC ke atas reader. Alat akan membaca UID kartu, mengetikkannya secara cepat, dan menekan Enter.</li>
          <li>Sistem secara otomatis menangkap data tersebut dan mengirimkannya ke API Backend Next.js (`/api/absen`).</li>
        </ul>
      </div>

      <SuccessDialog
        isOpen={dialogState.isOpen}
        type={dialogState.type}
        title={dialogState.title}
        message={dialogState.message}
        nama={dialogState.nama}
        serialNumber={dialogState.serialNumber}
        onClose={() => {
          setDialogState((prev) => ({ ...prev, isOpen: false }));
          focusInput();
        }}
      />
    </div>
  );
}
