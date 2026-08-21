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
  autoCloseMs = 4500,
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
      id="attendance-notification-backdrop"
      className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        id="attendance-notification-card"
        className={`w-full max-w-[340px] sm:max-w-[380px] rounded-[26px] p-6 sm:p-7 relative shadow-2xl transition-all animate-in zoom-in-95 duration-200 text-center ${
          isSuccess
            ? "bg-[#DCFCE7] text-[#14532D] shadow-emerald-950/15 border border-emerald-300/60"
            : "bg-[#FFE4E6] text-[#881337] shadow-rose-950/15 border border-rose-300/60"
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
              ? "text-emerald-700/60 hover:text-emerald-900 hover:bg-emerald-200/60"
              : "text-rose-700/60 hover:text-rose-900 hover:bg-rose-200/60"
          }`}
          aria-label="Tutup Notifikasi"
        >
          <X className="w-4 h-4 stroke-[2.5]" />
        </button>

        {/* Center Icon */}
        <div className="flex justify-center mb-4 mt-1">
          {isSuccess ? (
            <div className="w-14 h-14 rounded-full bg-[#16A34A] text-white flex items-center justify-center shadow-md shadow-emerald-700/20 ring-4 ring-emerald-300/50">
              <Check className="w-8 h-8 stroke-[3.5]" />
            </div>
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
              <span className="text-xs font-black uppercase tracking-widest text-[#15803d] bg-emerald-100/80 px-3 py-1 rounded-full border border-emerald-300/60 shadow-2xs">
                SUKSES
              </span>
              <h3 className="text-xl sm:text-2xl font-black text-[#14532D] tracking-tight mt-1 leading-snug">
                {nama || "Peserta"}
              </h3>
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

