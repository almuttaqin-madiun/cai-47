"use client";

import { useEffect } from "react";
import Image from "next/image";
import { X, Check, AlertTriangle, Clock } from "lucide-react";

interface SuccessDialogProps {
  isOpen: boolean;
  type?: "success" | "error";
  title?: string;
  message?: string;
  nama?: string;
  serialNumber?: string;
  sesiNama?: string;
  statusKehadiran?: string;
  menitTerlambat?: number;
  photoUrl?: string;
  onClose: () => void;
  autoCloseMs?: number; // Auto-dismiss duration in ms (default 2000 for rapid traffic)
}

export default function SuccessDialog({
  isOpen,
  type = "success",
  title,
  message,
  nama,
  serialNumber,
  sesiNama,
  statusKehadiran,
  menitTerlambat,
  photoUrl,
  onClose,
  autoCloseMs = 2000,
}: SuccessDialogProps) {
  useEffect(() => {
    if (!isOpen) return;

    // Auto close timer (fast auto-dismiss for rapid queuing and high traffic)
    const timer = setTimeout(() => {
      onClose();
    }, autoCloseMs);

    // ESC key listener to close
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      clearTimeout(timer);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, nama, serialNumber, statusKehadiran, onClose, autoCloseMs]);

  if (!isOpen) return null;

  const isSuccess = type === "success";
  const isLate =
    statusKehadiran?.toLowerCase().includes("telat") ||
    statusKehadiran?.toLowerCase().includes("lambat") ||
    (typeof menitTerlambat === "number" && menitTerlambat > 0);

  return (
    <div
      id="attendance-notification-backdrop"
      className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        id="attendance-notification-card"
        className={`w-full max-w-[340px] sm:max-w-[380px] rounded-[26px] p-6 sm:p-7 relative shadow-2xl transition-all animate-in zoom-in-95 duration-150 text-center ${
          isSuccess
            ? isLate
              ? "bg-[#FEF3C7] text-[#78350F] shadow-amber-950/15 border-2 border-amber-400"
              : "bg-[#DCFCE7] text-[#14532D] shadow-emerald-950/15 border-2 border-emerald-400"
            : "bg-[#FFE4E6] text-[#881337] shadow-rose-950/15 border-2 border-rose-400"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close 'X' Button at Top-Right */}
        <button
          id="close-notification-btn"
          type="button"
          onClick={onClose}
          className={`absolute top-4 right-4 p-1.5 rounded-full transition-colors cursor-pointer ${
            isSuccess
              ? isLate
                ? "text-amber-800/70 hover:text-amber-950 hover:bg-amber-200/70"
                : "text-emerald-700/60 hover:text-emerald-900 hover:bg-emerald-200/60"
              : "text-rose-700/60 hover:text-rose-900 hover:bg-rose-200/60"
          }`}
          aria-label="Tutup Notifikasi"
        >
          <X className="w-4 h-4 stroke-[2.5]" />
        </button>

        {/* Center Icon */}
        <div className="flex justify-center mb-3 mt-1">
          {isSuccess ? (
            isLate ? (
              <div className="w-14 h-14 rounded-full bg-[#D97706] text-white flex items-center justify-center shadow-md shadow-amber-700/20 ring-4 ring-amber-300/60">
                <Clock className="w-8 h-8 stroke-[3]" />
              </div>
            ) : (
              <div className="w-14 h-14 rounded-full bg-[#16A34A] text-white flex items-center justify-center shadow-md shadow-emerald-700/20 ring-4 ring-emerald-300/50">
                <Check className="w-8 h-8 stroke-[3.5]" />
              </div>
            )
          ) : (
            <div className="w-14 h-14 flex items-center justify-center text-[#DC2626]">
              <AlertTriangle className="w-12 h-12 fill-[#DC2626] text-white drop-shadow-sm" />
            </div>
          )}
        </div>

        {/* Message Content */}
        <div className="space-y-2">
          {isSuccess ? (
            <div className="flex flex-col items-center justify-center gap-1.5 py-1">
              <div className="flex items-center gap-1.5 flex-wrap justify-center">
                <span
                  className={`text-xs font-black uppercase tracking-widest px-3 py-0.5 rounded-full border shadow-2xs ${
                    isLate
                      ? "text-[#92400E] bg-amber-200/90 border-amber-400 font-extrabold"
                      : "text-[#15803d] bg-emerald-100/80 border-emerald-300/60"
                  }`}
                >
                  {isLate ? "PRESENSI TERLAMBAT" : "SUKSES"}
                </span>
                {sesiNama && (
                  <span className="text-[11px] font-bold text-slate-700 bg-white/70 px-2 py-0.5 rounded-full border border-slate-200/80">
                    {sesiNama}
                  </span>
                )}
              </div>

              <h3 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight mt-0.5 leading-snug">
                {nama || "Peserta"}
              </h3>

              {/* Status Kehadiran (Late vs Tepat Waktu Pill) */}
              <div className="mt-1">
                {isLate ? (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold bg-amber-500 text-white shadow-xs border border-amber-600">
                    <Clock className="w-3.5 h-3.5 stroke-[2.5]" />
                    <span>TERLAMBAT</span>
                    {menitTerlambat && menitTerlambat > 0 ? (
                      <span>(+{menitTerlambat} menit)</span>
                    ) : null}
                  </div>
                ) : (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-600 text-white shadow-xs border border-emerald-700">
                    <Check className="w-3.5 h-3.5 stroke-[3]" />
                    <span>TEPAT WAKTU</span>
                  </div>
                )}
              </div>

              {photoUrl && (
                <div className="mt-2 w-16 h-16 rounded-full overflow-hidden border-2 border-white shadow-md relative">
                  <Image
                    src={photoUrl}
                    alt={nama || "Peserta"}
                    fill
                    className="object-cover"
                    unoptimized={true}
                    referrerPolicy="no-referrer"
                  />
                </div>
              )}
            </div>
          ) : (
            <div className="py-1">
              <span className="text-xs font-black uppercase tracking-widest text-[#b91c1c] bg-rose-100/80 px-3 py-1 rounded-full border border-rose-300/60 shadow-2xs inline-block mb-2">
                {title || "PERINGATAN"}
              </span>
              <h3 className="text-base sm:text-lg font-bold text-[#881337] tracking-tight leading-snug">
                {nama ? nama : ""}
              </h3>
              <p className="text-xs sm:text-sm leading-relaxed text-[#9F1239] mt-1 font-medium">
                {message || "Kartu NFC tidak terdaftar. Silakan hubungi panitia."}
              </p>
              {serialNumber && (
                <div className="mt-2.5 text-[11px] font-mono text-rose-800/90 bg-rose-200/60 py-1 px-2.5 rounded-lg inline-block border border-rose-300/50">
                  UID: {serialNumber}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

