"use client";

import { useState, useEffect } from "react";
import {
  CheckCircle2,
  AlertCircle,
  Loader2,
  UserPlus,
  Users,
  Check,
  ChevronDown,
  User,
  Building2,
  Tent,
  MessageSquare,
  ShieldAlert,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

interface InputPesertaFormProps {
  onSuccess?: () => void;
  onGoToData?: () => void;
}

export default function InputPesertaForm({ onSuccess, onGoToData }: InputPesertaFormProps) {
  // Form fields as requested
  const [nama, setNama] = useState("");
  const [jenisKelamin, setJenisKelamin] = useState("");
  const [kelompok, setKelompok] = useState("");
  const [dapukan, setDapukan] = useState("");
  const [grup, setGrup] = useState("");
  const [grupFgd, setGrupFgd] = useState("");

  // Existing suggestions
  const [kelompokOptions, setKelompokOptions] = useState<string[]>([]);
  const [grupOptions, setGrupOptions] = useState<string[]>([]);
  const [fgdOptions, setFgdOptions] = useState<string[]>([]);

  // State status
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [submittedData, setSubmittedData] = useState<any>(null);

  // Fetch existing options for convenience suggestions
  useEffect(() => {
    async function fetchExistingOptions() {
      try {
        const { data } = await supabase
          .from("peserta")
          .select("*");
        
        if (data && data.length > 0) {
          const uniqueKelompok = Array.from(
            new Set(data.map((p: any) => p.kelompok).filter((k) => k && k !== "-" && k.trim() !== ""))
          );
          const uniqueGrup = Array.from(
            new Set(data.map((p: any) => p.grup || p.tenda).filter((t) => t && t !== "-" && t.trim() !== ""))
          );
          const uniqueFgd = Array.from(
            new Set(data.map((p: any) => p.grup_fgd).filter((f) => f && f !== "-" && f.trim() !== ""))
          );

          setKelompokOptions(uniqueKelompok);
          setGrupOptions(uniqueGrup);
          setFgdOptions(uniqueFgd);
        }
      } catch (e) {
        console.error("Error fetching suggestions:", e);
      }
    }
    fetchExistingOptions();
  }, []);

  // Handle Submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    // Validasi Wajib Diisi
    if (!nama.trim()) {
      setErrorMessage("Nama Lengkap wajib diisi.");
      return;
    }
    if (!jenisKelamin) {
      setErrorMessage("Jenis Kelamin wajib dipilih.");
      return;
    }
    if (!kelompok.trim()) {
      setErrorMessage("Kelompok wajib diisi.");
      return;
    }
    if (!dapukan.trim()) {
      setErrorMessage("Dapukan wajib diisi.");
      return;
    }

    setLoading(true);

    const cleanGrup = grup.trim() || "-";
    const payload: any = {
      nama: nama.trim(),
      kelompok: kelompok.trim(),
      dapukan: dapukan.trim(),
      grup: cleanGrup,
      tenda: cleanGrup,
      grup_fgd: grupFgd.trim() || "-",
      jenis_kelamin: jenisKelamin,
    };

    try {
      let insertedRow: any = null;

      // Attempt 1: Try with full payload (grup, tenda, jenis_kelamin)
      const { data, error } = await supabase
        .from("peserta")
        .insert([payload])
        .select();

      if (error) {
        // Fallback 1: Try without 'grup' (if table only has 'tenda')
        const payloadOnlyTenda = { ...payload };
        delete payloadOnlyTenda.grup;
        const resTenda = await supabase.from("peserta").insert([payloadOnlyTenda]).select();

        if (resTenda.error) {
          // Fallback 2: Try without 'tenda' (if table only has 'grup')
          const payloadOnlyGrup = { ...payload };
          delete payloadOnlyGrup.tenda;
          const resGrup = await supabase.from("peserta").insert([payloadOnlyGrup]).select();

          if (resGrup.error) {
            // Fallback 3: Basic insert without select
            const basicPayload = {
              nama: nama.trim(),
              kelompok: kelompok.trim(),
              dapukan: dapukan.trim(),
              grup_fgd: grupFgd.trim() || "-",
            };
            const { error: basicErr } = await supabase.from("peserta").insert([basicPayload]);
            if (basicErr) throw basicErr;
          } else if (resGrup.data && resGrup.data.length > 0) {
            insertedRow = resGrup.data[0];
          }
        } else if (resTenda.data && resTenda.data.length > 0) {
          insertedRow = resTenda.data[0];
        }
      } else if (data && data.length > 0) {
        insertedRow = data[0];
      }

      setSubmittedData({
        id: insertedRow?.id || Date.now(),
        ...payload,
        grup: cleanGrup,
        jenisKelamin,
      });

      setIsSubmitted(true);

      if (onSuccess) {
        onSuccess();
      }
    } catch (err: any) {
      console.error("Error inserting peserta:", err);
      let errDetail = err.message || "Gagal menyimpan data pendaftaran.";
      if (err.code === "42501" || errDetail.toLowerCase().includes("row-level security")) {
        errDetail = "Akses ditolak oleh Row Level Security (RLS) Supabase. Pastikan akses read & write diaktifkan untuk tabel 'peserta'.";
      }
      setErrorMessage(errDetail);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setNama("");
    setJenisKelamin("");
    setKelompok("");
    setDapukan("");
    setGrup("");
    setGrupFgd("");
    setIsSubmitted(false);
    setSubmittedData(null);
    setErrorMessage(null);
  };

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6 font-sans text-slate-800 pb-16">
      {/* 1. PAGE TITLE */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">
            Pendaftaran Peserta
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Silakan lengkapi formulir pendaftaran peserta di bawah ini. Tanda (<span className="text-rose-500 font-bold">*</span>) wajib diisi.
          </p>
        </div>

        {onGoToData && (
          <button
            onClick={onGoToData}
            className="self-start sm:self-auto px-4 py-2 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-xl border border-slate-300 shadow-2xs transition-all active:scale-95 flex items-center gap-2"
          >
            <Users className="w-4 h-4 text-[#1d4ed8]" />
            <span>Lihat Data Peserta</span>
          </button>
        )}
      </div>

      {/* SUCCESS CARD */}
      {isSubmitted ? (
        <div className="bg-white border border-slate-200/90 rounded-2xl p-8 md:p-12 shadow-xs text-center space-y-6 animate-in zoom-in-95 duration-200">
          <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-xs">
            <CheckCircle2 className="w-10 h-10" />
          </div>

          <div className="space-y-2">
            <h2 className="text-xl md:text-2xl font-extrabold text-slate-900">
              Pendaftaran Berhasil Disimpan!
            </h2>
            <p className="text-xs md:text-sm text-slate-500 max-w-md mx-auto">
              Data peserta <strong>{submittedData?.nama}</strong> telah berhasil ditambahkan ke dalam database.
            </p>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 max-w-lg mx-auto text-left text-xs space-y-2.5">
            <div className="flex justify-between border-b border-slate-200/70 pb-2">
              <span className="text-slate-500">Nama Lengkap:</span>
              <span className="font-bold text-slate-800">{submittedData?.nama}</span>
            </div>
            <div className="flex justify-between border-b border-slate-200/70 pb-2">
              <span className="text-slate-500">Jenis Kelamin:</span>
              <span className="font-semibold text-slate-800">{submittedData?.jenisKelamin || "-"}</span>
            </div>
            <div className="flex justify-between border-b border-slate-200/70 pb-2">
              <span className="text-slate-500">Kelompok:</span>
              <span className="font-semibold text-slate-800">{submittedData?.kelompok}</span>
            </div>
            <div className="flex justify-between border-b border-slate-200/70 pb-2">
              <span className="text-slate-500">Dapukan:</span>
              <span className="font-semibold text-slate-800">{submittedData?.dapukan}</span>
            </div>
            <div className="flex justify-between border-b border-slate-200/70 pb-2">
              <span className="text-slate-500">Grup:</span>
              <span className="font-semibold text-slate-800">{submittedData?.grup || submittedData?.tenda || "-"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Grup FGD:</span>
              <span className="font-semibold text-slate-800">{submittedData?.grup_fgd || "-"}</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <button
              onClick={resetForm}
              className="px-5 py-2.5 bg-[#1d4ed8] hover:bg-[#1e40af] text-white text-xs font-bold rounded-xl shadow-xs transition-all active:scale-95 flex items-center gap-2"
            >
              <UserPlus className="w-4 h-4" />
              <span>Daftarkan Peserta Lain</span>
            </button>

            {onGoToData && (
              <button
                onClick={onGoToData}
                className="px-5 py-2.5 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-xl border border-slate-300 shadow-2xs transition-all active:scale-95 flex items-center gap-2"
              >
                <Users className="w-4 h-4 text-[#1d4ed8]" />
                <span>Buka Daftar Peserta</span>
              </button>
            )}
          </div>
        </div>
      ) : (
        /* 2. REGISTRATION FORM CARD */
        <div className="bg-white border border-slate-200/90 rounded-2xl shadow-xs overflow-hidden">
          <form onSubmit={handleSubmit} className="p-6 md:p-8 space-y-6">
            {/* Error Message */}
            {errorMessage && (
              <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium flex items-start gap-2.5 animate-in fade-in">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* FORM FIELDS GRID */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* 1. NAMA LENGKAP (Wajib) */}
              <div className="space-y-2">
                <label className="block text-xs font-medium text-slate-800">
                  Nama Lengkap<span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Masukkan nama lengkap peserta"
                  value={nama}
                  onChange={(e) => setNama(e.target.value)}
                  required
                  className="w-full px-4 py-3 bg-white border border-slate-300 rounded-xl text-xs md:text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#1d4ed8] focus:ring-1 focus:ring-[#1d4ed8]"
                />
              </div>

              {/* 2. JENIS KELAMIN (Wajib) */}
              <div className="space-y-2">
                <label className="block text-xs font-medium text-slate-800">
                  Jenis Kelamin<span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <select
                    value={jenisKelamin}
                    onChange={(e) => setJenisKelamin(e.target.value)}
                    required
                    className="w-full px-4 py-3 bg-white border border-slate-300 rounded-xl text-xs md:text-sm text-slate-800 focus:outline-none focus:border-[#1d4ed8] focus:ring-1 focus:ring-[#1d4ed8] appearance-none cursor-pointer"
                  >
                    <option value="">Pilih Jenis Kelamin</option>
                    <option value="Laki-laki">Laki-laki</option>
                    <option value="Perempuan">Perempuan</option>
                  </select>
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                    <ChevronDown className="w-4 h-4" />
                  </div>
                </div>
              </div>

              {/* 3. KELOMPOK (Wajib) */}
              <div className="space-y-2">
                <label className="block text-xs font-medium text-slate-800">
                  Kelompok<span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    list="kelompok-list"
                    placeholder="Contoh: Kelompok A, Kelompok 01, Desa Barat"
                    value={kelompok}
                    onChange={(e) => setKelompok(e.target.value)}
                    required
                    className="w-full px-4 py-3 bg-white border border-slate-300 rounded-xl text-xs md:text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#1d4ed8] focus:ring-1 focus:ring-[#1d4ed8]"
                  />
                  <datalist id="kelompok-list">
                    {kelompokOptions.map((k) => (
                      <option key={k} value={k} />
                    ))}
                  </datalist>
                </div>
              </div>

              {/* 4. DAPUKAN (Wajib) */}
              <div className="space-y-2">
                <label className="block text-xs font-medium text-slate-800">
                  Dapukan<span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    list="dapukan-list"
                    placeholder="Contoh: Peserta, Panitia, Keamanan, Konsumsi"
                    value={dapukan}
                    onChange={(e) => setDapukan(e.target.value)}
                    required
                    className="w-full px-4 py-3 bg-white border border-slate-300 rounded-xl text-xs md:text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#1d4ed8] focus:ring-1 focus:ring-[#1d4ed8]"
                  />
                  <datalist id="dapukan-list">
                    <option value="Peserta" />
                    <option value="Ketua Kelompok" />
                    <option value="Panitia" />
                    <option value="Pengurus" />
                    <option value="Konsumsi" />
                    <option value="Keamanan" />
                    <option value="Kesehatan" />
                  </datalist>
                </div>
              </div>

              {/* 5. GRUP (Opsional) */}
              <div className="space-y-2">
                <label className="block text-xs font-medium text-slate-800">
                  Grup <span className="text-slate-400 font-normal">(Opsional)</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    list="grup-list"
                    placeholder="Contoh: Grup 01, Grup Putra A"
                    value={grup}
                    onChange={(e) => setGrup(e.target.value)}
                    className="w-full px-4 py-3 bg-white border border-slate-300 rounded-xl text-xs md:text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#1d4ed8] focus:ring-1 focus:ring-[#1d4ed8]"
                  />
                  <datalist id="grup-list">
                    {grupOptions.map((g) => (
                      <option key={g} value={g} />
                    ))}
                  </datalist>
                </div>
              </div>

              {/* 6. GRUP FGD (Opsional) */}
              <div className="space-y-2">
                <label className="block text-xs font-medium text-slate-800">
                  Grup FGD <span className="text-slate-400 font-normal">(Opsional)</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    list="fgd-list"
                    placeholder="Contoh: FGD 01, FGD A"
                    value={grupFgd}
                    onChange={(e) => setGrupFgd(e.target.value)}
                    className="w-full px-4 py-3 bg-white border border-slate-300 rounded-xl text-xs md:text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#1d4ed8] focus:ring-1 focus:ring-[#1d4ed8]"
                  />
                  <datalist id="fgd-list">
                    {fgdOptions.map((f) => (
                      <option key={f} value={f} />
                    ))}
                  </datalist>
                </div>
              </div>
            </div>

            {/* ACTION BUTTONS */}
            <div className="pt-6 flex items-center justify-end gap-3 border-t border-slate-100">
              <button
                type="button"
                onClick={resetForm}
                className="px-5 py-2.5 bg-white hover:bg-slate-50 text-slate-700 text-xs md:text-sm font-semibold rounded-xl border border-slate-300 shadow-2xs transition-all active:scale-95"
              >
                Reset
              </button>

              <button
                type="submit"
                disabled={loading}
                className="px-6 py-2.5 bg-[#1d4ed8] hover:bg-[#1e40af] text-white text-xs md:text-sm font-bold rounded-xl shadow-xs transition-all active:scale-95 flex items-center gap-2 disabled:opacity-60"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Menyimpan...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Daftarkan Peserta</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
