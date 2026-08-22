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
  solusi: string[];
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
  solusi: [""],
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
  const [printMode, setPrintMode] = useState<"publik" | "juri" | null>(null);

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

  const handleSolusiChange = (index: number, value: string) => {
    const newSolusi = [...data.solusi];
    newSolusi[index] = value;
    setData((prev) => ({ ...prev, solusi: newSolusi }));
  };

  const addSolusi = () => {
    setData((prev) => ({ ...prev, solusi: [...prev.solusi, ""] }));
  };

  const removeSolusi = (index: number) => {
    if (data.solusi.length > 1) {
      const newSolusi = data.solusi.filter((_, i) => i !== index);
      setData((prev) => ({ ...prev, solusi: newSolusi }));
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
        solusi: JSON.stringify(data.solusi.filter(s => s.trim() !== "")),
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

  const loadRecord = (record: any) => {
    let parsedSolusi = [""];
    if (typeof record.solusi === 'string') {
        if (record.solusi.trim().startsWith('[')) {
            try { parsedSolusi = JSON.parse(record.solusi); } catch (e) { parsedSolusi = [record.solusi]; }
        } else if (record.solusi) {
            parsedSolusi = [record.solusi];
        }
    } else if (Array.isArray(record.solusi)) {
        parsedSolusi = record.solusi;
    }
    if (parsedSolusi.length === 0) parsedSolusi = [""];

    setData({
      ...record,
      temuan_masalah: Array.isArray(record.temuan_masalah) && record.temuan_masalah.length > 0 
        ? record.temuan_masalah 
        : [""],
      solusi: parsedSolusi,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handlePrint = (type: "publik" | "juri") => {
    setPrintMode(type);
  };

  const handleDownloadPDF = () => {
    const element = document.getElementById('print-content-area');
    if (!element) return;
    
    // Buka popup window baru untuk print guna menghindari blokir iframe & error oklch html2canvas
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`
        <!DOCTYPE html>
        <` + `html>
          <head>
            <title>Laporan_FGD_${data.nama_kelompok || 'Publik'}</title>
            <script src="https://cdn.tailwindcss.com"></script>
            <style>
              @media print {
                @page {
                  margin: 15mm;
                  size: ${printMode === 'publik' ? 'A4 landscape' : 'A4 portrait'};
                }
                body {
                  -webkit-print-color-adjust: exact !important;
                  print-color-adjust: exact !important;
                  background: white !important;
                }
              }
              body { font-family: sans-serif; }
            </style>
          </head>
          <body class="bg-white text-slate-800 p-8">
            ${element.innerHTML}
            <script>
              setTimeout(() => {
                window.print();
              }, 1200);
            </script>
          </body>
        <` + `/html>
      `);
      printWindow.document.close();
    } else {
      // Fallback jika popup diblokir browser
      alert("Popup terblokir oleh browser. Silakan izinkan popup, atau tekan OK untuk mencoba cetak dari halaman ini.");
      window.print();
    }
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

  if (printMode) {
    return (
      <div className="bg-white min-h-screen text-slate-800">
        {/* Header UI (Hidden on Print) */}
        <div className="print:hidden flex justify-between items-center p-4 bg-[#f8f9fa] border-b border-slate-200 sticky top-0 z-50">
          <h1 className="text-xl font-bold text-slate-800">
            {printMode === "publik" ? "Laporan Notulensi & Action Plan FGD" : "Laporan Lengkap FGD (Data Juri)"}
          </h1>
          <div className="flex gap-3 items-center">
            <span className="text-sm text-slate-500 hidden md:inline-block mr-4">Catatan: Jika tombol tidak berfungsi, buka di tab baru (ikon ↗️)</span>
            <button onClick={() => setPrintMode(null)} className="px-4 py-2 bg-white border border-slate-300 rounded-lg text-slate-700 font-semibold hover:bg-slate-50 transition-colors">
              Tutup
            </button>
            <button onClick={handleDownloadPDF} className="px-4 py-2 bg-[#16a34a] hover:bg-green-700 text-white rounded-lg font-semibold flex items-center gap-2 shadow-sm transition-colors">
              <Printer className="w-4 h-4" /> Unduh PDF
            </button>
          </div>
        </div>
        
        {/* Print Content */}
        <div id="print-content-area" className="p-8 max-w-6xl mx-auto bg-white">
          {printMode === "publik" ? (
             // Publik Layout
             <div>
               <table className="w-full border-collapse border border-slate-300">
                  <thead className="bg-[#1c1c1c] text-white">
                    <tr>
                      <th className="p-4 text-left w-16 border border-slate-300 uppercase text-sm font-bold tracking-wide">No</th>
                      <th className="p-4 text-left w-1/4 border border-slate-300 uppercase text-sm font-bold tracking-wide">Problem</th>
                      <th className="p-4 text-left w-1/4 border border-slate-300 uppercase text-sm font-bold tracking-wide">Solusi</th>
                      <th className="p-4 text-left border border-slate-300 uppercase text-sm font-bold tracking-wide">Program Action Plan</th>
                    </tr>
                  </thead>
                  <tbody className="align-top text-[15px]">
                    <tr>
                      <td className="p-5 border border-slate-300 text-center font-bold text-lg">1</td>
                      <td className="p-5 border border-slate-300 whitespace-pre-wrap">{data.prioritas_masalah || "-"}</td>
                      <td className="p-5 border border-slate-300">
                        <ol className="list-decimal pl-4 space-y-1">
                          {data.solusi.filter(s => s.trim() !== "").length > 0 ? data.solusi.filter(s => s.trim() !== "").map((s, idx) => (
                            <li key={idx} className="pl-1 whitespace-pre-wrap">{s}</li>
                          )) : <li>-</li>}
                        </ol>
                      </td>
                      <td className="p-5 border border-slate-300">
                         {/* Action Plan Content */}
                         {data.ap_pelaksana && (
                           <div className="mb-5 flex flex-wrap gap-2">
                             <span className="px-3 py-1.5 bg-blue-50 border border-blue-200 text-blue-700 rounded-full text-xs font-bold uppercase tracking-wider">
                               BID. {data.ap_pelaksana}
                             </span>
                           </div>
                         )}
                         <div className="grid grid-cols-[130px_auto] gap-2 mb-3">
                           <div className="text-slate-500 font-medium">Nama Kegiatan</div>
                           <div className="font-semibold text-slate-800">: {data.ap_nama_kegiatan || "-"}</div>
                         </div>
                         <div className="grid grid-cols-[130px_auto] gap-2 mb-3">
                           <div className="text-slate-500 font-medium">Peserta</div>
                           <div className="font-medium text-slate-700">: {data.ap_sasaran || "-"}</div>
                         </div>
                         <div className="grid grid-cols-[130px_auto] gap-2 mb-3">
                           <div className="text-slate-500 font-medium">Waktu</div>
                           <div className="font-medium text-slate-700">: {data.ap_waktu || "-"}</div>
                         </div>
                         <div className="grid grid-cols-[130px_auto] gap-2 mb-3">
                           <div className="text-slate-500 font-medium">Indikator / Dana</div>
                           <div className="font-medium text-slate-700 whitespace-pre-wrap">: {data.ap_indikator || "-"}</div>
                         </div>
                      </td>
                    </tr>
                  </tbody>
               </table>
               
               <div className="mt-8 flex justify-between text-sm text-slate-600">
                  <div>Nama Kelompok: <strong>{data.nama_kelompok || "-"}</strong></div>
                  <div>Juru Bicara: <strong>{data.juru_bicara || "-"}</strong></div>
               </div>
             </div>
          ) : (
             // Juri Layout
             <div className="space-y-6">
               <div className="text-center border-b-2 border-black pb-4 mb-8">
                  <h1 className="text-2xl font-bold uppercase tracking-wider mb-1">Laporan Lengkap FGD</h1>
                  <p className="text-slate-600 font-medium">Data Terperinci untuk Penilaian Juri | CAI 2026 KOTA MADIUN</p>
                </div>
                
                <div className="mb-6">
                  <h2 className="text-sm font-bold bg-slate-100 p-2 border-l-4 border-slate-800 uppercase tracking-wide mb-3">I. Informasi Kelompok</h2>
                  <table className="w-full border-collapse border border-slate-800 text-[15px]">
                    <tbody>
                      <tr><td className="border border-slate-800 p-3 font-bold w-48 bg-slate-50">Nama Kelompok</td><td className="border border-slate-800 p-3 font-bold text-lg">{data.nama_kelompok || "-"}</td></tr>
                      <tr><td className="border border-slate-800 p-3 font-bold bg-slate-50">Fasilitator</td><td className="border border-slate-800 p-3">{data.fasilitator || "-"}</td></tr>
                      <tr><td className="border border-slate-800 p-3 font-bold bg-slate-50">Pendamping</td><td className="border border-slate-800 p-3">{data.pendamping || "-"}</td></tr>
                      <tr><td className="border border-slate-800 p-3 font-bold bg-slate-50">Penulis (Notulis)</td><td className="border border-slate-800 p-3">{data.penulis || "-"}</td></tr>
                      <tr><td className="border border-slate-800 p-3 font-bold bg-slate-50">Juru Bicara</td><td className="border border-slate-800 p-3 font-bold">{data.juru_bicara || "-"}</td></tr>
                      <tr><td className="border border-slate-800 p-3 font-bold bg-slate-50 align-top">Anggota Kelompok</td><td className="border border-slate-800 p-3">{currentMembers.length > 0 ? currentMembers.map(m => m.nama).join(", ") : "-"}</td></tr>
                    </tbody>
                  </table>
                </div>

                <div className="mb-6">
                  <h2 className="text-sm font-bold bg-slate-100 p-2 border-l-4 border-slate-800 uppercase tracking-wide mb-3">II. Hasil Diskusi</h2>
                  <table className="w-full border-collapse border border-slate-800 text-[15px]">
                    <tbody>
                      <tr>
                        <td className="border border-slate-800 p-3 font-bold w-48 bg-slate-50 align-top">Daftar Temuan Masalah</td>
                        <td className="border border-slate-800 p-3">
                          <ol className="list-decimal pl-5 space-y-2">
                            {data.temuan_masalah.filter(t => t.trim() !== "").length > 0 ? data.temuan_masalah.filter(t => t.trim() !== "").map((t, idx) => (
                              <li key={idx} className="pl-1 whitespace-pre-wrap">{t}</li>
                            )) : <li>-</li>}
                          </ol>
                        </td>
                      </tr>
                      <tr><td className="border border-slate-800 p-3 font-bold bg-slate-50 align-top">Prioritas Masalah</td><td className="border border-slate-800 p-3 whitespace-pre-wrap font-medium">{data.prioritas_masalah || "-"}</td></tr>
                      <tr><td className="border border-slate-800 p-3 font-bold bg-slate-50 align-top">Akar Masalah</td><td className="border border-slate-800 p-3 whitespace-pre-wrap">{data.akar_masalah || "-"}</td></tr>
                      <tr>
                        <td className="border border-slate-800 p-3 font-bold bg-slate-50 align-top">Solusi yang Disepakati</td>
                        <td className="border border-slate-800 p-3">
                          <ol className="list-decimal pl-5 space-y-2 font-medium">
                            {data.solusi.filter(s => s.trim() !== "").length > 0 ? data.solusi.filter(s => s.trim() !== "").map((s, idx) => (
                              <li key={idx} className="pl-1 whitespace-pre-wrap">{s}</li>
                            )) : <li>-</li>}
                          </ol>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="mb-6">
                  <h2 className="text-sm font-bold bg-slate-100 p-2 border-l-4 border-slate-800 uppercase tracking-wide mb-3">III. Action Plan</h2>
                  <table className="w-full border-collapse border border-slate-800 text-[15px]">
                    <tbody>
                      <tr><td className="border border-slate-800 p-3 font-bold w-48 bg-slate-50">Nama Kegiatan</td><td className="border border-slate-800 p-3 font-bold text-base">{data.ap_nama_kegiatan || "-"}</td></tr>
                      <tr><td className="border border-slate-800 p-3 font-bold bg-slate-50 align-top">Deskripsi Kegiatan</td><td className="border border-slate-800 p-3 whitespace-pre-wrap">{data.ap_deskripsi || "-"}</td></tr>
                      <tr><td className="border border-slate-800 p-3 font-bold bg-slate-50">Sasaran</td><td className="border border-slate-800 p-3">{data.ap_sasaran || "-"}</td></tr>
                      <tr><td className="border border-slate-800 p-3 font-bold bg-slate-50">Pelaksana</td><td className="border border-slate-800 p-3">{data.ap_pelaksana || "-"}</td></tr>
                      <tr><td className="border border-slate-800 p-3 font-bold bg-slate-50">Waktu Pelaksanaan</td><td className="border border-slate-800 p-3">{data.ap_waktu || "-"}</td></tr>
                      <tr><td className="border border-slate-800 p-3 font-bold bg-slate-50 align-top">Indikator Keberhasilan</td><td className="border border-slate-800 p-3 whitespace-pre-wrap">{data.ap_indikator || "-"}</td></tr>
                    </tbody>
                  </table>
                </div>
             </div>
          )}
        </div>
        
        <style dangerouslySetInnerHTML={{__html: `
          @media print {
            @page {
              margin: 15mm;
              size: ${printMode === 'publik' ? 'A4 landscape' : 'A4 portrait'};
            }
            body {
              background: white !important;
            }
            * {
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
          }
        `}} />
      </div>
    );
  }

  return (
    <div className="relative">
      {/* INTERACTIVE UI - HIDDEN ON PRINT */}
      <div className="max-w-6xl mx-auto space-y-6 pb-20 print:hidden">
      
        {/* HEADER */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm print:hidden">
        <div>
          <h1 className="text-xl font-extrabold text-slate-800 flex items-center gap-2">
            <MessageSquare className="text-[#203598]" />
            Focus Group Discussion
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
        </div>
      </div>

      {message && (
        <div className={"p-4 rounded-xl flex items-start gap-3 print:hidden " + (message.type === 'success' ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800')}>
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

              <div className="space-y-3">
                <label className="text-sm font-semibold text-slate-700">4. Solusi</label>
                <div className="space-y-2 print:hidden">
                  {data.solusi.map((s, idx) => (
                    <div key={idx} className="flex gap-2 items-start">
                      <span className="mt-2 text-sm font-bold text-emerald-600 w-5">{idx + 1}.</span>
                      <textarea
                        value={s}
                        onChange={(e) => handleSolusiChange(idx, e.target.value)}
                        placeholder={`Solusi ke-${idx + 1}`}
                        className="flex-1 px-3 py-2 bg-emerald-50/30 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-emerald-600 min-h-[60px]"
                      />
                      <button 
                        onClick={() => removeSolusi(idx)}
                        disabled={data.solusi.length === 1}
                        className="mt-1 p-2 text-red-500 hover:bg-red-50 rounded-lg disabled:opacity-30 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  <button 
                    onClick={addSolusi}
                    className="flex items-center gap-1.5 text-sm font-semibold text-emerald-600 hover:text-emerald-800 mt-2 px-2 py-1 rounded-md hover:bg-emerald-50 transition-colors ml-6"
                  >
                    <Plus className="w-4 h-4" /> Tambah Solusi
                  </button>
                </div>
                <div className="hidden print:block text-sm text-justify p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-900 font-medium">
                  <ol className="list-decimal pl-4 space-y-1.5">
                    {data.solusi.filter(s => s.trim() !== "").map((s, idx) => (
                      <li key={idx} className="pl-1 whitespace-pre-wrap">{s}</li>
                    ))}
                    {data.solusi.filter(s => s.trim() !== "").length === 0 && (
                      <li className="text-slate-400 italic">Belum ada solusi</li>
                    )}
                  </ol>
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

          {/* SAVE BUTTON BOTTOM */}
          <div className="flex justify-end pt-2 print:hidden">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-6 py-3 bg-[#203598] hover:bg-blue-800 text-white font-bold text-[15px] rounded-xl transition-all flex items-center gap-2 shadow-sm hover:shadow-md disabled:opacity-50"
            >
              {saving ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save className="w-5 h-5" />}
              Simpan Data FGD
            </button>
          </div>
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

      </div> {/* END INTERACTIVE UI */}

    </div>
  );
}
