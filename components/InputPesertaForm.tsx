"use client";

import { useState, useEffect, useRef } from "react";
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
  Camera,
  UploadCloud,
  X,
  Image as ImageIcon,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { toTitleCase } from "@/lib/utils";
import { uploadFotoPeserta } from "@/lib/storage";

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

  // Foto Peserta (Opsional)
  const [fotoFile, setFotoFile] = useState<File | null>(null);
  const [fotoPreview, setFotoPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Existing suggestions
  const [kelompokOptions, setKelompokOptions] = useState<string[]>([]);
  const [grupOptions, setGrupOptions] = useState<string[]>([]);
  const [fgdOptions, setFgdOptions] = useState<string[]>([]);

  // State status
  const [loading, setLoading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [submittedData, setSubmittedData] = useState<any>(null);

  // Handle Photo selection
  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.size > 5 * 1024 * 1024) {
        setErrorMessage("Ukuran foto terlalu besar. Maksimal 5MB.");
        return;
      }
      setFotoFile(file);
      setFotoPreview(URL.createObjectURL(file));
      setErrorMessage(null);
    }
  };

  const handleRemovePhoto = () => {
    setFotoFile(null);
    if (fotoPreview) {
      URL.revokeObjectURL(fotoPreview);
      setFotoPreview(null);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

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
    setUploadStatus(null);

    const cleanGrup = grup.trim() ? toTitleCase(grup.trim()) : "-";
    const cleanFgd = grupFgd.trim() ? toTitleCase(grupFgd.trim()) : "-";

    let uploadedFotoUrl = "";

    // Upload photo to Supabase storage bucket 'CAI 2026' if provided
    if (fotoFile) {
      try {
        setUploadStatus("Mengunggah foto profil ke storage...");
        uploadedFotoUrl = await uploadFotoPeserta(fotoFile, nama);
      } catch (uploadErr: any) {
        console.warn("Upload foto gagal (non-fatal):", uploadErr);
        // Continue saving peserta even if photo upload failed
      }
    }

    const payload: any = {
      nama: toTitleCase(nama),
      kelompok: toTitleCase(kelompok),
      dapukan: toTitleCase(dapukan),
      grup: cleanGrup,
      tenda: cleanGrup,
      grup_fgd: cleanFgd,
      jenis_kelamin: jenisKelamin,
    };

    if (uploadedFotoUrl) {
      payload.foto = uploadedFotoUrl;
    }

    try {
      setUploadStatus("Menyimpan data peserta...");
      let insertedRow: any = null;

      // Attempt 1: Try with full payload containing 'foto'
      let { data, error } = await supabase
        .from("peserta")
        .insert([payload])
        .select();

      if (error) {
        console.warn("Insert attempt 1 error:", error.message);
        
        // Fallback 1: If 'foto' or 'grup' caused error, try with tenda / alternate fields
        const payloadWithFoto = { ...payload };
        // Ensure foto is retained
        payloadWithFoto.foto = uploadedFotoUrl || null;
        delete payloadWithFoto.foto_url;

        // Try without 'grup' (using 'tenda')
        const payloadOnlyTenda = { ...payloadWithFoto };
        delete payloadOnlyTenda.grup;
        const resTenda = await supabase.from("peserta").insert([payloadOnlyTenda]).select();

        if (!resTenda.error && resTenda.data?.length) {
          insertedRow = resTenda.data[0];
          error = null;
        } else {
          // Try without 'tenda' (using 'grup')
          const payloadOnlyGrup = { ...payloadWithFoto };
          delete payloadOnlyGrup.tenda;
          const resGrup = await supabase.from("peserta").insert([payloadOnlyGrup]).select();

          if (!resGrup.error && resGrup.data?.length) {
            insertedRow = resGrup.data[0];
            error = null;
          } else {
            // Fallback: Basic insert with foto
            const basicPayload: any = {
              nama: toTitleCase(nama),
              kelompok: toTitleCase(kelompok),
              dapukan: toTitleCase(dapukan),
              grup: cleanGrup,
              grup_fgd: cleanFgd,
              jenis_kelamin: jenisKelamin,
            };
            if (uploadedFotoUrl) {
              basicPayload.foto = uploadedFotoUrl;
            }
            const { data: bData, error: basicErr } = await supabase.from("peserta").insert([basicPayload]).select();
            if (basicErr) {
              // Last fallback without select
              const { error: noSelectErr } = await supabase.from("peserta").insert([basicPayload]);
              if (noSelectErr) throw noSelectErr;
            } else if (bData && bData.length > 0) {
              insertedRow = bData[0];
            }
          }
        }
      } else if (data && data.length > 0) {
        insertedRow = data[0];
      }

      setSubmittedData({
        id: insertedRow?.id || Date.now(),
        ...payload,
        foto: uploadedFotoUrl,
        foto_url: uploadedFotoUrl,
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
      setUploadStatus(null);
    }
  };

  const resetForm = () => {
    setNama("");
    setJenisKelamin("");
    setKelompok("");
    setDapukan("");
    setGrup("");
    setGrupFgd("");
    handleRemovePhoto();
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

              {/* 7. FOTO PROFIL PESERTA (Opsional -> Bucket 'CAI 2026') */}
              <div className="space-y-2 col-span-1 md:col-span-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-medium text-slate-800">
                    Foto Profil Peserta <span className="text-slate-400 font-normal">(Opsional - Bucket CAI 2026)</span>
                  </label>
                  <span className="text-[11px] text-slate-400">Format: JPG, PNG, WEBP (Maks. 5MB)</span>
                </div>

                <div className="p-4 bg-slate-50/80 border border-dashed border-slate-300 rounded-2xl flex flex-col sm:flex-row items-center gap-4">
                  {/* Photo Preview / Placeholder */}
                  <div className="relative w-20 h-20 rounded-2xl overflow-hidden bg-white border border-slate-200 shadow-2xs shrink-0 flex items-center justify-center">
                    {fotoPreview ? (
                      <>
                        <img
                          src={fotoPreview}
                          alt="Preview Foto"
                          className="w-full h-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={handleRemovePhoto}
                          className="absolute top-1 right-1 p-1 bg-rose-600/80 hover:bg-rose-700 text-white rounded-full transition-colors"
                          title="Hapus foto"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </>
                    ) : (
                      <div className="text-slate-300 flex flex-col items-center">
                        <ImageIcon className="w-8 h-8" />
                      </div>
                    )}
                  </div>

                  {/* Upload Controls */}
                  <div className="flex-1 text-center sm:text-left space-y-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      id="peserta-foto-input"
                      accept="image/png, image/jpeg, image/jpg, image/webp"
                      onChange={handlePhotoChange}
                      className="hidden"
                    />
                    <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                      <label
                        htmlFor="peserta-foto-input"
                        className="px-3.5 py-2 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold rounded-xl border border-slate-300 shadow-2xs transition-all cursor-pointer inline-flex items-center gap-1.5"
                      >
                        <UploadCloud className="w-4 h-4 text-[#1d4ed8]" />
                        <span>{fotoFile ? "Ganti Foto" : "Pilih File Foto"}</span>
                      </label>
                      {fotoFile && (
                        <button
                          type="button"
                          onClick={handleRemovePhoto}
                          className="px-3 py-2 text-rose-600 hover:bg-rose-50 text-xs font-semibold rounded-xl transition-colors"
                        >
                          Hapus
                        </button>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500">
                      {fotoFile
                        ? `File terpilih: ${fotoFile.name} (${(fotoFile.size / 1024).toFixed(1)} KB)`
                        : "Foto tidak wajib diisi. Foto akan tersimpan di Supabase Bucket 'CAI 2026/Foto Profil'."}
                    </p>
                  </div>
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
