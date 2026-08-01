"use client";

import { useState } from "react";
import { UserPlus, CheckCircle2, AlertCircle, Loader2, ArrowRight, Building2 } from "lucide-react";
import { supabase } from "@/lib/supabase";

interface InputPesertaFormProps {
  onSuccess?: () => void;
  onGoToData?: () => void;
}

export default function InputPesertaForm({ onSuccess, onGoToData }: InputPesertaFormProps) {
  const [nama, setNama] = useState("");
  const [kelompok, setKelompok] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [recentAdded, setRecentAdded] = useState<{ id: number | string; nama: string; kelompok: string }[]>([]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nama.trim()) {
      setMessage({ type: "error", text: "Nama peserta wajib diisi." });
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      let insertedRow: any = null;

      // Primary attempt with select()
      const { data, error } = await supabase
        .from("peserta")
        .insert([{ nama: nama.trim(), kelompok: kelompok.trim() || "-" }])
        .select();

      if (error) {
        // Fallback: try insert without select() in case select permission is restricted
        const { error: fallbackError } = await supabase
          .from("peserta")
          .insert([{ nama: nama.trim(), kelompok: kelompok.trim() || "-" }]);

        if (fallbackError) {
          throw fallbackError;
        }
      } else if (data && data.length > 0) {
        insertedRow = data[0];
      }

      setMessage({
        type: "success",
        text: `Peserta "${nama.trim()}" berhasil disimpan ke tabel peserta!`,
      });

      if (insertedRow) {
        setRecentAdded((prev) => [insertedRow, ...prev]);
      } else {
        setRecentAdded((prev) => [{ id: Date.now(), nama: nama.trim(), kelompok: kelompok.trim() || "-" }, ...prev]);
      }

      // Reset form
      setNama("");
      setKelompok("");

      if (onSuccess) {
        onSuccess();
      }
    } catch (err: any) {
      console.error("Error inserting peserta:", err);

      let errDetail = err.message || "Gagal menyimpan data peserta.";
      if (err.code === "42501" || errDetail.toLowerCase().includes("row-level security")) {
        errDetail = "Akses ditolak oleh Row Level Security (RLS) Supabase. Di dashboard Supabase, masuk ke Table Editor > 'peserta' > tambahkan RLS policy (Allow ALL/Enable read and write access for all users) atau Disable RLS.";
      } else if (err.hint) {
        errDetail += ` (${err.hint})`;
      } else if (err.details) {
        errDetail += ` (${err.details})`;
      }

      setMessage({
        type: "error",
        text: errDetail,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6">
      {/* Header Banner */}
      <div className="bg-[#203598] text-white p-6 rounded-2xl shadow-md flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <UserPlus className="h-6 w-6 text-blue-200" />
            <h2 className="text-xl font-bold">Input Data Peserta Baru</h2>
          </div>
          <p className="text-blue-100 text-sm">
            Tambahkan nama dan kelompok peserta ke dalam database tabel peserta
          </p>
        </div>
        {onGoToData && (
          <button
            onClick={onGoToData}
            className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-sm font-semibold transition-all flex items-center gap-2 backdrop-blur-sm border border-white/20"
          >
            Lihat Data Peserta
            <ArrowRight className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Form Card */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          {message && (
            <div
              className={`mb-6 p-4 rounded-xl flex items-start gap-3 border ${
                message.type === "success"
                  ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                  : "bg-red-50 border-red-200 text-red-800"
              }`}
            >
              {message.type === "success" ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              )}
              <div className="text-sm font-medium">{message.text}</div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                Nama Lengkap Peserta <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={nama}
                onChange={(e) => setNama(e.target.value)}
                placeholder="ketik nama"
                required
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#203598]/20 focus:border-[#203598] text-slate-800 placeholder-slate-400 font-medium transition-all text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                Kelompok / Utusan
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={kelompok}
                  onChange={(e) => setKelompok(e.target.value)}
                  placeholder="ketik asal kelompok"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#203598]/20 focus:border-[#203598] text-slate-800 placeholder-slate-400 font-medium transition-all text-sm"
                />
              </div>
            </div>

            <div className="pt-2 flex items-center gap-3">
              <button
                type="submit"
                disabled={loading}
                className="flex-1 bg-[#203598] hover:bg-[#1a2c7d] text-white font-semibold py-3.5 px-6 rounded-xl shadow-md shadow-[#203598]/20 transition-all active:scale-[0.98] disabled:opacity-60 flex items-center justify-center gap-2 text-sm"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Menyimpan...
                  </>
                ) : (
                  <>
                    <UserPlus className="w-5 h-5" />
                    Simpan Data Peserta
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Recent Added Side Panel */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col">
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-4 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-[#203598]" />
            Baru Ditambahkan
          </h3>

          {recentAdded.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200 min-h-[200px]">
              <UserPlus className="w-8 h-8 mb-2 opacity-50" />
              <p className="text-xs font-medium">Belum ada peserta yang dimasukkan dalam sesi ini.</p>
            </div>
          ) : (
            <div className="space-y-3 overflow-y-auto max-h-[320px] pr-1">
              {recentAdded.map((item, idx) => (
                <div
                  key={item.id || idx}
                  className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl text-sm flex items-start gap-3 hover:bg-blue-50/50 transition-colors"
                >
                  <div className="w-8 h-8 rounded-full bg-blue-100 text-[#203598] font-bold text-xs flex items-center justify-center shrink-0">
                    {idx + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-slate-800 truncate">{item.nama}</p>
                    <p className="text-xs text-slate-500 truncate">Kelompok: {item.kelompok}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
