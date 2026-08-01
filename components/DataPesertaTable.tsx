"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Users,
  Search,
  RefreshCw,
  Edit3,
  Trash2,
  Plus,
  X,
  Check,
  Building2,
  Loader2,
  AlertCircle,
  Filter
} from "lucide-react";
import { supabase } from "@/lib/supabase";

export interface Peserta {
  id: number;
  created_at?: string;
  nama: string;
  kelompok: string;
}

interface DataPesertaTableProps {
  onGoToInput?: () => void;
}

export default function DataPesertaTable({ onGoToInput }: DataPesertaTableProps) {
  const [pesertaList, setPesertaList] = useState<Peserta[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Search & Filter
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedKelompok, setSelectedKelompok] = useState<string>("ALL");

  // Edit State
  const [editingPeserta, setEditingPeserta] = useState<Peserta | null>(null);
  const [editNama, setEditNama] = useState("");
  const [editKelompok, setEditKelompok] = useState("");
  const [editLoading, setEditLoading] = useState(false);

  // Delete State
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // Fetch Peserta from Supabase
  const fetchPeserta = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const { data, error } = await supabase
        .from("peserta")
        .select("*")
        .order("id", { ascending: false });

      if (error) throw error;
      setPesertaList(data || []);
    } catch (err: any) {
      console.error("Error fetching data peserta:", err);
      let msg = err.message || "Gagal mengambil data dari tabel 'peserta'.";
      if (err.code === "42501" || msg.toLowerCase().includes("row-level security")) {
        msg = "Akses membaca ditolak oleh RLS Supabase. Tambahkan RLS Policy untuk SELECT pada tabel 'peserta' di dashboard Supabase (atau Disable RLS).";
      }
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPeserta();
  }, [fetchPeserta]);

  // Distinct groups for dropdown filter
  const kelompokOptions = useMemo(() => {
    const groups = new Set<string>();
    pesertaList.forEach((p) => {
      if (p.kelompok && p.kelompok.trim()) {
        groups.add(p.kelompok.trim());
      }
    });
    return Array.from(groups).sort();
  }, [pesertaList]);

  // Filtered List
  const filteredPeserta = useMemo(() => {
    return pesertaList.filter((p) => {
      const matchesSearch =
        p.nama.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.kelompok.toLowerCase().includes(searchTerm.toLowerCase()) ||
        String(p.id).includes(searchTerm);

      const matchesKelompok =
        selectedKelompok === "ALL" || p.kelompok === selectedKelompok;

      return matchesSearch && matchesKelompok;
    });
  }, [pesertaList, searchTerm, selectedKelompok]);

  // Open Edit Dialog
  const handleStartEdit = (p: Peserta) => {
    setEditingPeserta(p);
    setEditNama(p.nama);
    setEditKelompok(p.kelompok);
  };

  // Save Edit
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPeserta) return;

    setEditLoading(true);
    try {
      const { error } = await supabase
        .from("peserta")
        .update({
          nama: editNama.trim(),
          kelompok: editKelompok.trim() || "-",
        })
        .eq("id", editingPeserta.id);

      if (error) throw error;

      setPesertaList((prev) =>
        prev.map((item) =>
          item.id === editingPeserta.id
            ? { ...item, nama: editNama.trim(), kelompok: editKelompok.trim() || "-" }
            : item
        )
      );
      setEditingPeserta(null);
    } catch (err: any) {
      alert("Gagal mengedit data: " + err.message);
    } finally {
      setEditLoading(false);
    }
  };

  // Delete Peserta
  const handleDelete = async (id: number) => {
    if (!confirm("Apakah Anda yakin ingin menghapus peserta ini dari tabel?")) return;

    setDeletingId(id);
    try {
      const { error } = await supabase.from("peserta").delete().eq("id", id);
      if (error) throw error;

      setPesertaList((prev) => prev.filter((item) => item.id !== id));
    } catch (err: any) {
      alert("Gagal menghapus data: " + err.message);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="w-full max-w-7xl mx-auto space-y-6">
      {/* Top Banner & Stats */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-50 rounded-xl text-[#203598]">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-800">Daftar Data Peserta</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Terhubung langsung dengan tabel <code className="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded font-mono">peserta</code> Supabase
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="bg-slate-50 px-4 py-2 rounded-xl border border-slate-200 text-center flex-1 md:flex-initial">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Peserta</div>
            <div className="text-lg font-bold text-[#203598]">{pesertaList.length}</div>
          </div>
          <div className="bg-slate-50 px-4 py-2 rounded-xl border border-slate-200 text-center flex-1 md:flex-initial">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Kelompok</div>
            <div className="text-lg font-bold text-slate-700">{kelompokOptions.length}</div>
          </div>
          {onGoToInput && (
            <button
              onClick={onGoToInput}
              className="bg-[#203598] hover:bg-[#1a2c7d] text-white px-4 py-3 rounded-xl font-semibold text-sm transition-all shadow-md flex items-center justify-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Tambah
            </button>
          )}
        </div>
      </div>

      {/* Main Table Container */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
        {/* Toolbar */}
        <div className="p-4 bg-slate-50/80 border-b border-slate-200 flex flex-col md:flex-row gap-3 items-center justify-between">
          <div className="flex flex-1 flex-col sm:flex-row gap-3 w-full">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Cari berdasarkan nama atau kelompok..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#203598]/20 focus:border-[#203598]"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Kelompok Filter Dropdown */}
            {kelompokOptions.length > 0 && (
              <div className="relative shrink-0">
                <Filter className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <select
                  value={selectedKelompok}
                  onChange={(e) => setSelectedKelompok(e.target.value)}
                  className="pl-10 pr-8 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#203598]/20 focus:border-[#203598] appearance-none cursor-pointer"
                >
                  <option value="ALL">Semua Kelompok ({pesertaList.length})</option>
                  {kelompokOptions.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <button
            onClick={fetchPeserta}
            disabled={loading}
            className="p-2.5 text-slate-600 hover:text-[#203598] hover:bg-white bg-slate-100 rounded-xl border border-slate-200 transition-all flex items-center gap-2 text-xs font-semibold self-end md:self-auto shrink-0"
            title="Refresh Data"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-[#203598]" : ""}`} />
            Refresh
          </button>
        </div>

        {/* Error Alert */}
        {errorMsg && (
          <div className="p-4 bg-red-50 border-b border-red-200 text-red-700 flex items-center gap-3 text-sm">
            <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
            <p className="flex-1">{errorMsg}</p>
            <button
              onClick={fetchPeserta}
              className="px-3 py-1 bg-red-100 hover:bg-red-200 text-red-800 rounded-lg text-xs font-semibold"
            >
              Coba Lagi
            </button>
          </div>
        )}

        {/* Table Content */}
        <div className="overflow-x-auto min-h-[300px]">
          {loading ? (
            <div className="flex flex-col items-center justify-center p-12 text-slate-400 gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-[#203598]" />
              <p className="text-sm font-medium">Memuat data peserta dari Supabase...</p>
            </div>
          ) : filteredPeserta.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 text-center text-slate-400 gap-3">
              <Users className="w-10 h-10 opacity-40" />
              <p className="text-base font-semibold text-slate-700">Tidak ada data peserta</p>
              <p className="text-xs text-slate-500">
                {searchTerm || selectedKelompok !== "ALL"
                  ? "Tidak ditemukan peserta yang sesuai dengan pencarian/filter."
                  : "Belum ada peserta di tabel peserta Supabase."}
              </p>
              {onGoToInput && (
                <button
                  onClick={onGoToInput}
                  className="mt-2 px-4 py-2 bg-[#203598] text-white rounded-xl text-xs font-semibold hover:bg-[#1a2c7d] transition-all"
                >
                  Tambah Peserta Pertama
                </button>
              )}
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs font-bold uppercase tracking-wider">
                  <th className="px-6 py-3.5">Nama Peserta</th>
                  <th className="px-6 py-3.5">Kelompok</th>
                  <th className="px-6 py-3.5 text-right w-28">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredPeserta.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/80 transition-colors group">
                    <td className="px-6 py-4 font-semibold text-slate-800">
                      {p.nama}
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-50 text-[#203598] font-medium text-xs border border-blue-100">
                        <Building2 className="w-3 h-3" />
                        {p.kelompok || "-"}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleStartEdit(p)}
                          className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Edit Peserta"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(p.id)}
                          disabled={deletingId === p.id}
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                          title="Hapus Peserta"
                        >
                          {deletingId === p.id ? (
                            <Loader2 className="w-4 h-4 animate-spin text-red-500" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer info */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 text-xs text-slate-500 flex justify-between items-center">
          <span>Menampilkan {filteredPeserta.length} dari {pesertaList.length} peserta</span>
          <span className="text-slate-400">Tabel: <code className="font-mono">peserta</code></span>
        </div>
      </div>

      {/* Edit Modal */}
      {editingPeserta && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between mb-4 border-b pb-3">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-[#203598]" />
                Edit Data Peserta #{editingPeserta.id}
              </h3>
              <button
                onClick={() => setEditingPeserta(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Nama Lengkap
                </label>
                <input
                  type="text"
                  value={editNama}
                  onChange={(e) => setEditNama(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#203598]/20 focus:border-[#203598]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Kelompok
                </label>
                <input
                  type="text"
                  value={editKelompok}
                  onChange={(e) => setEditKelompok(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#203598]/20 focus:border-[#203598]"
                />
              </div>

              <div className="flex gap-2 pt-2 justify-end">
                <button
                  type="button"
                  onClick={() => setEditingPeserta(null)}
                  className="px-4 py-2.5 text-slate-600 hover:bg-slate-100 rounded-xl text-xs font-semibold transition-all"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={editLoading}
                  className="px-5 py-2.5 bg-[#203598] hover:bg-[#1a2c7d] text-white rounded-xl text-xs font-semibold transition-all flex items-center gap-2 shadow-md"
                >
                  {editLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Menyimpan...
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      Simpan Perubahan
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
