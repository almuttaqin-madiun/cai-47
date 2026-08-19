"use client";

import { useEffect } from "react";
import Image from "next/image";
import { User } from "lucide-react";

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
  autoCloseMs?: number; // Auto-dismiss duration in ms (default 4000)
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
  autoCloseMs = 4000,
}: SuccessDialogProps) {
  useEffect(() => {
    if (!isOpen) return;

    // Auto close timer
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
  }, [isOpen, onClose, autoCloseMs]);

  if (!isOpen) return null;

  const isSuccess = type === "success";

  return (
    <div
      className="fixed inset-0 bg-[#1e1b2e]/80 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-in fade-in zoom-in-95 duration-200"
      onClick={onClose}
    >
      <div
        className="bg-white text-slate-800 rounded-[32px] p-6 sm:p-8 max-w-xs sm:max-w-sm w-full text-center relative shadow-2xl border border-white/20 pt-16 animate-in slide-in-from-bottom-6 duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Floating Top Emoji Avatar Badge */}
        <div className="absolute -top-12 left-1/2 -translate-x-1/2 w-24 h-24 rounded-full bg-[#fcd34d] border-4 border-[#1e1b2e] shadow-xl flex items-center justify-center text-5xl select-none">
          {isSuccess ? (
            <div className="relative">
              {/* Hearts popping up (Matching reference image) */}
              <div className="absolute -top-3 -right-2 text-rose-500 text-xs animate-bounce delay-100">
                ❤️
              </div>
              <div className="absolute -top-5 right-1 text-rose-500 text-sm animate-pulse">
                💕
              </div>
              😍
            </div>
          ) : (
            <div className="relative">
              😮
            </div>
          )}
        </div>

        {/* Title */}
        <h3
          className={`text-2xl font-black tracking-tight mb-2 ${
            isSuccess ? "text-[#10b981]" : "text-[#f43f5e]"
          }`}
        >
          {title || (isSuccess ? "Selamat!" : "Uh Oh")}
        </h3>

        {/* User Photo Avatar if available */}
        {photoUrl && isSuccess && (
          <div className="w-20 h-20 mx-auto mb-3 rounded-full overflow-hidden border-4 border-emerald-100 shadow-md relative">
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

        {/* Message / Description */}
        <p className="text-slate-600 font-medium text-sm sm:text-base leading-relaxed px-1">
          {message ||
            (isSuccess
              ? `Presensi ${nama ? nama : "kartu"} berhasil dicatat!`
              : "Terjadi kesalahan saat memproses absensi.")}
        </p>

        {/* Metadata Details (Name, UID, Session) */}
        {isSuccess && (
          <div className="mt-4 p-3.5 bg-slate-50 rounded-2xl border border-slate-100 text-xs text-slate-600 space-y-1.5 text-left">
            {nama && (
              <div className="flex justify-between items-center">
                <span className="text-slate-400 font-semibold">Nama:</span>
                <span className="font-bold text-slate-800 text-sm">{nama}</span>
              </div>
            )}
            {serialNumber && (
              <div className="flex justify-between items-center">
                <span className="text-slate-400 font-semibold">NFC UID:</span>
                <span className="font-mono bg-white px-2 py-0.5 rounded border border-slate-200 text-slate-700 font-bold">
                  {serialNumber}
                </span>
              </div>
            )}
            {sesiNama && (
              <div className="flex justify-between items-center">
                <span className="text-slate-400 font-semibold">Sesi:</span>
                <span className="font-bold text-[#203598]">{sesiNama}</span>
              </div>
            )}
            {statusKehadiran && (
              <div className="flex justify-between items-center pt-1 border-t border-slate-200/60">
                <span className="text-slate-400 font-semibold">Status:</span>
                <span
                  className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                    statusKehadiran === "Terlambat"
                      ? "bg-amber-100 text-amber-900 border border-amber-300"
                      : "bg-emerald-100 text-emerald-900 border border-emerald-300"
                  }`}
                >
                  {statusKehadiran === "Terlambat"
                    ? `⚠️ Terlambat ${menitTerlambat && menitTerlambat > 0 ? `(+${menitTerlambat} menit)` : ""}`
                    : "✅ Tepat Waktu"}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Action Button */}
        <button
          onClick={onClose}
          className={`w-full mt-6 py-3.5 px-6 rounded-full font-black text-base shadow-lg transition-all active:scale-95 cursor-pointer ${
            isSuccess
              ? "bg-[#10b981] hover:bg-[#059669] text-white shadow-emerald-500/30"
              : "bg-[#f43f5e] hover:bg-[#e11d48] text-white shadow-rose-500/30"
          }`}
        >
          {isSuccess ? "Hooray!" : "Okeh..."}
        </button>
      </div>
    </div>
  );
}
