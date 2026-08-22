import React, { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import {
  Save,
  Printer,
  Plus,
  Trash2,
  Users,
  MessageSquare,
  ClipboardList,
  Target,
  FileDown,
  Database,
  CheckCircle2,
  AlertCircle
} from "lucide-react";

interface Peserta {
  id: number;
  nama: string;
  grup_fgd: string | null;
}

interface FgdData {
  id?: number;
  nama_kelompok: string;
  fasilitator: string;
  pendamping: string;
  penulis: string;
  juru_bicara: string;
  temuan_masalah: string[];
  prioritas_masalah: string;
  akar_masalah: string;
  solusi: string;
  ap_nama_kegiatan: string;
  ap_deskripsi: string;
  ap_sasaran: string;
  ap_pelaksana: string;
  ap_waktu: string;
  ap_indikator: string;
}

const initialFgdData: FgdData = {
  nama_kelompok: "",
  fasilitator: "",
  pendamping: "",
  penulis: "",
  juru_bicara: "",
  temuan_masalah: [""],
  prioritas_masalah: "",
  akar_masalah: "",
  solusi: "",
  ap_nama_kegiatan: "",
  ap_deskripsi: "",
  ap_sasaran: "",
  ap_pelaksana: "",
  ap_waktu: "",
  ap_indikator: "",
};

export default function FormFGD() {
  const [data, setData] = useState<FgdData>(initialFgdData);
  const [pesertaList, setPesertaList] = useState<Peserta[]>([]);
  const [groups, setGroups] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [showSqlModal, setShowSqlModal] = useState(false);
  const [savedRecords, setSavedRecords] = useState<FgdData[]>([]);

  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    setLoading(true);
    try {
      // 1. Fetch Peserta for groups and members
      const { data: pData, error: pError } = await supabase
        .from("peserta")
        .select("id, nama, grup_fgd")
        .order("nama", { ascending: true });

      if (pError) throw pError;

      const pList = pData || [];
      setPesertaList(pList);

      // Extract unique groups
      const gSet = new Set<string>();
      pList.forEach((p) => {
        if (p.grup_fgd && p.grup_fgd !== "-" && p.grup_fgd.trim() !== "") {
          gSet.add(p.grup_fgd.trim());
        }
      });
      setGroups(Array.from(gSet).sort());

      // 2. Try fetching existing FGD records
      await fetchSavedRecords();

    } catch (err: any) {
      console.error("Fetch init error:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchSavedRecords = async () => {
    try {
      const { data: recData, error: recError } = await supabase
        .from("hasil_fgd")
        .select("*")
        .order("created_at", { ascending: false });

      if (recError) {
        if (recError.code === "42P01") {
          setShowSqlModal(true); // Table doesn't exist
        }
      } else {
        setSavedRecords(recData || []);
      }
    } catch (e) {
      console.warn("Could not fetch hasil_fgd", e);
    }
  };

  const currentMembers = pesertaList.filter(
    (p) => data.nama_kelompok && p.grup_fgd === data.nama_kelompok
  );

  const handleInputChange = (field: keyof FgdData, value: any) => {
    setData((prev) => ({ ...prev, [field]: value }));
  };

  const handleTemuanChange = (index: number, value: string) => {
    const newTemuan = [...data.temuan_masalah];
    newTemuan[index] = value;
    setData((prev) => ({ ...prev, temuan_masalah: newTemuan }));
  };

  const addTemuan = () => {
    setData((prev) => ({ ...prev, temuan_masalah: [...prev.temuan_masalah, ""] }));
  };

  const removeTemuan = (index: number) => {
    if (data.temuan_masalah.length > 1) {
      const newTemuan = data.temuan_masalah.filter((_, i) => i !== index);
      setData((prev) => {
        let newPrioritas = prev.prioritas_masalah;
        if (prev.prioritas_masalah === prev.temuan_masalah[index]) {
            newPrioritas = "";
        }
        return { ...prev, temuan_masalah: newTemuan, prioritas_masalah: newPrioritas };
      });
    }
  };

  const handleSave = async () => {
    if (!data.nama_kelompok) {
      setMessage({ type: "error", text: "Silakan pilih Nama Kelompok FGD terlebih dahulu." });
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      const payload = {
        nama_kelompok: data.nama_kelompok,
        fasilitator: data.fasilitator,
        pendamping: data.pendamping,
        penulis: data.penulis,
        juru_bicara: data.juru_bicara,
        temuan_masalah: data.temuan_masalah.filter(t => t.trim() !== ""),
        prioritas_masalah: data.prioritas_masalah,
        akar_masalah: data.akar_masalah,
        solusi: data.solusi,
        ap_nama_kegiatan: data.ap_nama_kegiatan,
        ap_deskripsi: data.ap_deskripsi,
        ap_sasaran: data.ap_sasaran,
        ap_pelaksana: data.ap_pelaksana,
        ap_waktu: data.ap_waktu,
        ap_indikator: data.ap_indikator,
      };

      let res;
      if (data.id) {
        res = await supabase.from("hasil_fgd").update(payload).eq("id", data.id);
      } else {
        res = await supabase.from("hasil_fgd").insert([payload]);
      }

      if (res.error) {
        if (res.error.code === "42P01") {
          setShowSqlModal(true);
          throw new Error("Tabel hasil_fgd belum dibuat di database.");
        }
        throw res.error;
      }

      setMessage({ type: "success", text: "Data FGD berhasil disimpan!" });
      fetchSavedRecords();
      
      // Reset if it was a new record (optional, maybe better to keep it for editing)
      // setData(initialFgdData); 
      
    } catch (err: any) {
      console.error(err);
      setMessage({ type: "error", text: err.message || "Terjadi kesalahan saat menyimpan." });
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(null), 5000);
    }
  };

  const loadRecord = (record: FgdData) => {
    setData({
      ...record,
      temuan_masalah: Array.isArray(record.temuan_masalah) && record.temuan_masalah.length > 0 
        ? record.temuan_masalah 
        : [""],
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handlePrint = (type: "publik" | "juri") => {
    // We will attach a class to body to indicate print mode
    document.body.setAttribute("data-print-mode", type);
    window.print();
    // After print dialog closes, remove it
    setTimeout(() => {
      document.body.removeAttribute("data-print-mode");
    }, 1000);
  };

  const sqlQuery = `
CREATE TABLE IF NOT EXISTS public.hasil_fgd (
    id SERIAL PRIMARY KEY,
    nama_kelompok TEXT NOT NULL,
    fasilitator TEXT,
    pendamping TEXT,
    penulis TEXT,
    juru_bicara TEXT,
    temuan_masalah JSONB DEFAULT '[]'::jsonb,
    prioritas_masalah TEXT,
    akar_masalah TEXT,
    solusi TEXT,
    ap_nama_kegiatan TEXT,
    ap_deskripsi TEXT,
    ap_sasaran TEXT,
    ap_pelaksana TEXT,
    ap_waktu TEXT,
    ap_indikator TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.hasil_fgd ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all full access hasil_fgd" ON public.hasil_fgd FOR ALL USING (true) WITH CHECK (true);
  `.trim();

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-20 print:p-0 print:m-0 print:max-w-none print:bg-white">
      
      {/* HEADER - Hides on Print */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm print:hidden">
        <div>
          <h1 className="text-xl font-extrabold text-slate-800 flex items-center gap-2">
            <MessageSquare className="text-[#203598]" />
            Form Forum Group Discussion (FGD)
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Isi dan kelola data hasil diskusi kelompok secara terstruktur.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {data.id && (
            <button
              onClick={() => setData(initialFgdData)}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-sm rounded-xl transition-colors"
            >
              Buat Baru
            </button>
          )}
          <button
            onClick={() => handlePrint("publik")}
            className="px-4 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-semibold text-sm rounded-xl transition-colors flex items-center gap-2 border border-emerald-200"
          >
            <Printer className="w-4 h-4" /> Unduh (Publik)
          </button>
          <button
            onClick={() => handlePrint("juri")}
            className="px-4 py-2 bg-amber-50 hover:bg-amber-100 text-amber-700 font-semibold text-sm rounded-xl transition-colors flex items-center gap-2 border border-amber-200"
          >
            <Printer className="w-4 h-4" /> Unduh (Juri)
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-[#203598] hover:bg-blue-800 text-white font-semibold text-sm rounded-xl transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save className="w-4 h-4" />}
            Simpan Data
          </button>
        </div>
      </div>

      {message && (
        <div className={`p-4 rounded-xl flex items-start gap-3 print:hidden ${message.type === 'success' ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'}`}>
          {message.type === 'success' ? <CheckCircle2 className="w-5 h-5 shrink-0" /> : <AlertCircle className="w-5 h-5 shrink-0" />}
          <p className="text-sm font-medium">{message.text}</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 print:block print:w-full">
        {/* LEFT COLUMN: FORM */}
        <div className="lg:col-span-2 space-y-6 print:block print:w-full">
          
          {/* I. INFORMASI KELOMPOK */}
          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden print:border-none print:shadow-none print:mb-8">
            <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 print:bg-white print:border-b-2 print:border-slate-800 print:px-0">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <Users className="w-5 h-5 text-[#203598] print:hidden" />
                I. Informasi Kelompok
              </h2>
            </div>
            <div className="p-6 space-y-5 print:p-0 print:pt-4">
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-slate-700">1. Nama Kelompok FGD</label>
                  <select
                    value={data.nama_kelompok}
                    onChange={(e) => handleInputChange("nama_kelompok", e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#203598]/20 focus:border-[#203598] print:hidden"
                  >
                    <option value="">-- Pilih Kelompok FGD --</option>
                    {groups.map(g => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                  <div className="hidden print:block font-bold text-lg">{data.nama_kelompok || "-"}</div>
                </div>

                <div className="space-y-1.5 print:hidden">
                  <label className="text-sm font-semibold text-slate-700">2. Anggota Kelompok</label>
                  <div className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-lg text-sm text-slate-600 h-24 overflow-y-auto">
                    {currentMembers.length > 0 ? (
                      <ul className="list-disc pl-4 space-y-1">
                        {currentMembers.map(m => (
                          <li key={m.id}>{m.nama}</li>
                        ))}
                      </ul>
                    ) : (
                      <span className="italic">Pilih nama kelompok untuk melihat anggota...</span>
                    )}
                  </div>
                </div>

                {/* Print only member list */}
                <div className="hidden print:block space-y-1.5 col-span-2">
                  <label className="text-sm font-semibold text-slate-700">Anggota Kelompok:</label>
                  <p className="text-sm">
                    {currentMembers.length > 0 ? currentMembers.map(m => m.nama).join(", ") : "-"}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-slate-700">3. Fasilitator</label>
                  <input
                    type="text"
                    value={data.fasilitator}
                    onChange={(e) => handleInputChange("fasilitator", e.target.value)}
                    placeholder="Nama Fasilitator"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-[#203598] print:hidden"
                  />
                  <div className="hidden print:block text-sm">{data.fasilitator || "-"}</div>
                </div>
                
                <div className="space-y-1.5 print-juri-only">
                  <label className="text-sm font-semibold text-slate-700">4. Pendamping</label>
                  <input
                    type="text"
                    value={data.pendamping}
                    onChange={(e) => handleInputChange("pendamping", e.target.value)}
                    placeholder="Nama Pendamping"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-[#203598] print:hidden"
                  />
                  <div className="hidden print:block text-sm">{data.pendamping || "-"}</div>
                </div>
                
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-slate-700">5. Penulis / Notulis</label>
                  <input
                    type="text"
                    value={data.penulis}
                    onChange={(e) => handleInputChange("penulis", e.target.value)}
                    placeholder="Nama Penulis"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-[#203598] print:hidden"
                  />
                  <div className="hidden print:block text-sm">{data.penulis || "-"}</div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-slate-700">6. Juru Bicara</label>
                  <input
                    type="text"
                    value={data.juru_bicara}
                    onChange={(e) => handleInputChange("juru_bicara", e.target.value)}
                    placeholder="Nama Juru Bicara"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-[#203598] print:hidden"
                  />
                  <div className="hidden print:block text-sm font-bold text-[#203598]">{data.juru_bicara || "-"}</div>
                </div>
              </div>

            </div>
          </section>

          {/* II. INPUT DATA HASIL DISKUSI */}
          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden print:border-none print:shadow-none print:mb-8">
            <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 print:bg-white print:border-b-2 print:border-slate-800 print:px-0">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <ClipboardList className="w-5 h-5 text-[#203598] print:hidden" />
                II. Hasil Diskusi
              </h2>
            </div>
            <div className="p-6 space-y-6 print:p-0 print:pt-4">
              
              <div className="space-y-3">
                <label className="text-sm font-semibold text-slate-700">1. Daftar Temuan Masalah</label>
                <div className="space-y-2 print:hidden">
                  {data.temuan_masalah.map((t, idx) => (
                    <div key={idx} className="flex gap-2 items-start">
                      <span className="mt-2 text-sm font-bold text-slate-400 w-5">{idx + 1}.</span>
                      <textarea
                        value={t}
                        onChange={(e) => handleTemuanChange(idx, e.target.value)}
                        placeholder={`Masalah ke-${idx + 1}`}
                        className="flex-1 px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-[#203598] min-h-[60px]"
                      />
                      <button 
                        onClick={() => removeTemuan(idx)}
                        disabled={data.temuan_masalah.length === 1}
                        className="mt-1 p-2 text-red-500 hover:bg-red-50 rounded-lg disabled:opacity-30 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  <button 
                    onClick={addTemuan}
                    className="flex items-center gap-1.5 text-sm font-semibold text-[#203598] hover:text-blue-800 mt-2 px-2 py-1 rounded-md hover:bg-blue-50 transition-colors ml-6"
                  >
                    <Plus className="w-4 h-4" /> Tambah Masalah
                  </button>
                </div>
                
                {/* Print View Temuan Masalah */}
                <div className="hidden print:block pl-4">
                  <ol className="list-decimal space-y-1 text-sm">
                    {data.temuan_masalah.filter(t => t.trim() !== "").map((t, idx) => (
                      <li key={idx} className="pl-1 text-justify">{t}</li>
                    ))}
                    {data.temuan_masalah.filter(t => t.trim() !== "").length === 0 && (
                      <li className="text-slate-400 italic">Belum ada temuan masalah</li>
                    )}
                  </ol>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-slate-700">2. Prioritas Masalah</label>
                <select
                  value={data.prioritas_masalah}
                  onChange={(e) => handleInputChange("prioritas_masalah", e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#203598]/20 focus:border-[#203598] print:hidden"
                >
                  <option value="">-- Pilih Prioritas Masalah --</option>
                  {data.temuan_masalah.filter(t => t.trim() !== "").map((t, idx) => (
                    <option key={idx} value={t}>
                      {t.length > 80 ? t.substring(0, 80) + "..." : t}
                    </option>
                  ))}
                </select>
                <div className="hidden print:block text-sm p-3 bg-red-50 border border-red-200 rounded-lg text-red-900 font-medium">
                  {data.prioritas_masalah || "-"}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-slate-700">3. Akar Masalah</label>
                <textarea
                  value={data.akar_masalah}
                  onChange={(e) => handleInputChange("akar_masalah", e.target.value)}
                  placeholder="Jelaskan akar dari prioritas masalah tersebut..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-[#203598] min-h-[80px] print:hidden"
                />
                <div className="hidden print:block text-sm text-justify whitespace-pre-wrap">{data.akar_masalah || "-"}</div>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-slate-700">4. Solusi</label>
                <textarea
                  value={data.solusi}
                  onChange={(e) => handleInputChange("solusi", e.target.value)}
                  placeholder="Tuliskan solusi yang disepakati..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-[#203598] min-h-[80px] print:hidden"
                />
                <div className="hidden print:block text-sm text-justify whitespace-pre-wrap p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-900 font-medium">
                  {data.solusi || "-"}
                </div>
              </div>

            </div>
          </section>

          {/* III. ACTION PLAN */}
          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden print:border-none print:shadow-none">
            <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 print:bg-white print:border-b-2 print:border-slate-800 print:px-0">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <Target className="w-5 h-5 text-[#203598] print:hidden" />
                III. Action Plan
              </h2>
            </div>
            <div className="p-6 space-y-5 print:p-0 print:pt-4">
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-slate-700">1. Nama Kegiatan</label>
                  <input
                    type="text"
                    value={data.ap_nama_kegiatan}
                    onChange={(e) => handleInputChange("ap_nama_kegiatan", e.target.value)}
                    placeholder="Judul / Nama Kegiatan"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-[#203598] print:hidden"
                  />
                  <div className="hidden print:block text-sm font-bold text-slate-900">{data.ap_nama_kegiatan || "-"}</div>
                </div>
                
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-slate-700">5. Waktu Kegiatan</label>
                  <input
                    type="text"
                    value={data.ap_waktu}
                    onChange={(e) => handleInputChange("ap_waktu", e.target.value)}
                    placeholder="Kapan kegiatan dilaksanakan?"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-[#203598] print:hidden"
                  />
                  <div className="hidden print:block text-sm">{data.ap_waktu || "-"}</div>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-slate-700">2. Deskripsi Kegiatan</label>
                <textarea
                  value={data.ap_deskripsi}
                  onChange={(e) => handleInputChange("ap_deskripsi", e.target.value)}
                  placeholder="Penjelasan detail tentang kegiatan..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-[#203598] min-h-[80px] print:hidden"
                />
                <div className="hidden print:block text-sm text-justify whitespace-pre-wrap">{data.ap_deskripsi || "-"}</div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-slate-700">3. Sasaran</label>
                  <input
                    type="text"
                    value={data.ap_sasaran}
                    onChange={(e) => handleInputChange("ap_sasaran", e.target.value)}
                    placeholder="Siapa sasaran kegiatannya?"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-[#203598] print:hidden"
                  />
                  <div className="hidden print:block text-sm">{data.ap_sasaran || "-"}</div>
                </div>
                
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-slate-700">4. Pelaksana</label>
                  <input
                    type="text"
                    value={data.ap_pelaksana}
                    onChange={(e) => handleInputChange("ap_pelaksana", e.target.value)}
                    placeholder="Siapa yang bertanggung jawab?"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-[#203598] print:hidden"
                  />
                  <div className="hidden print:block text-sm">{data.ap_pelaksana || "-"}</div>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-slate-700">6. Indikator Keberhasilan</label>
                <textarea
                  value={data.ap_indikator}
                  onChange={(e) => handleInputChange("ap_indikator", e.target.value)}
                  placeholder="Apa yang menjadi tolak ukur keberhasilan kegiatan ini?"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-[#203598] min-h-[60px] print:hidden"
                />
                <div className="hidden print:block text-sm text-justify whitespace-pre-wrap">{data.ap_indikator || "-"}</div>
              </div>

            </div>
          </section>
        </div>

        {/* RIGHT COLUMN: SAVED RECORDS (Hidden in Print) */}
        <div className="space-y-4 print:hidden">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 sticky top-6">
            <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-4">
              <Database className="w-4 h-4 text-[#203598]" />
              Data Tersimpan
            </h3>
            
            {loading && <div className="text-sm text-slate-500 text-center py-4">Memuat data...</div>}
            
            {!loading && savedRecords.length === 0 && (
              <div className="text-sm text-slate-500 text-center py-6 bg-slate-50 rounded-xl border border-slate-100">
                Belum ada data FGD tersimpan.
              </div>
            )}

            <div className="space-y-3 max-h-[calc(100vh-200px)] overflow-y-auto pr-1">
              {savedRecords.map(rec => (
                <div 
                  key={rec.id} 
                  onClick={() => loadRecord(rec)}
                  className={`p-3 rounded-xl border transition-all cursor-pointer ${
                    data.id === rec.id 
                      ? 'border-[#203598] bg-blue-50/50' 
                      : 'border-slate-200 bg-white hover:border-[#203598]/30 hover:bg-slate-50'
                  }`}
                >
                  <div className="font-bold text-sm text-slate-800">{rec.nama_kelompok}</div>
                  <div className="text-xs text-slate-500 mt-1 line-clamp-1 flex items-center gap-1">
                    <span className="font-medium">Jubir:</span> {rec.juru_bicara || "-"}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-2 font-mono">
                    Diperbarui: {new Date(rec.updated_at || "").toLocaleString('id-ID')}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* SQL INITIALIZATION MODAL */}
      {showSqlModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm print:hidden">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-slate-200 flex justify-between items-center bg-slate-50">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <Database className="w-5 h-5 text-[#203598]" />
                Tabel FGD Belum Ada
              </h2>
            </div>
            <div className="p-6 overflow-y-auto">
              <p className="text-sm text-slate-600 mb-4">
                Sistem mendeteksi bahwa tabel <strong>hasil_fgd</strong> belum ada di database Supabase Anda. 
                Silakan copy dan jalankan perintah SQL berikut di menu <strong>SQL Editor</strong> pada dashboard Supabase Anda.
              </p>
              
              <div className="relative">
                <pre className="bg-slate-900 text-slate-200 p-4 rounded-xl text-xs overflow-x-auto font-mono leading-relaxed">
                  {sqlQuery}
                </pre>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(sqlQuery);
                    setMessage({ type: "success", text: "SQL berhasil disalin!" });
                  }}
                  className="absolute top-2 right-2 p-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors text-xs flex items-center gap-1"
                >
                  <ClipboardList className="w-3 h-3" /> Copy
                </button>
              </div>
            </div>
            <div className="p-5 border-t border-slate-200 flex justify-end gap-3 bg-slate-50">
              <button
                onClick={() => {
                  setShowSqlModal(false);
                  fetchSavedRecords();
                }}
                className="px-5 py-2.5 bg-[#203598] hover:bg-blue-800 text-white text-sm font-bold rounded-xl transition-all"
              >
                Saya Sudah Menjalankan SQL
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Styles for Print specific tweaks */}
      <style dangerouslySetInnerHTML={{__html: `
        @media print {
          body[data-print-mode="publik"] .print-juri-only {
            display: none !important;
          }
          body[data-print-mode="juri"] .print-juri-only {
            display: block !important;
          }
          @page {
            margin: 20mm;
            size: A4 portrait;
          }
        }
      `}} />
    </div>
  );
}
