"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Tent,
  MessageSquare,
  Users,
  Search,
  Filter,
  RefreshCw,
  FileSpreadsheet,
  Plus,
  ArrowRightLeft,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ChevronRight,
  Eye,
  Edit2,
  Trash2,
  UserX,
  Sparkles,
  ChevronLeft,
  ChevronDown,
  X,
  Check,
  UserCheck,
  UserPlus
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { exportDataToExcel } from "@/lib/excelExport";

export interface PesertaItem {
  id: number;
  nama: string;
  kelompok: string | null;
  dapukan: string | null;
  tenda: string | null;
  grup_fgd: string | null;
  created_at?: string;
}

export interface RiwayatMutasiItem {
  id?: number;
  peserta_id?: number | null;
  nama_peserta: string;
  tipe_plotting: "tenda" | "fgd" | string;
  tujuan_sebelum: string;
  tujuan_baru: string;
  created_at: string;
}

interface PlottingPesertaProps {
  type: "tenda" | "fgd";
}

interface GroupMetadata {
  name: string;
  ketua?: string | null;
  ketuaL: string | null;
  ketuaP: string | null;
}

export default function PlottingPeserta({ type }: PlottingPesertaProps) {
  const isTenda = type === "tenda";
  const fieldKey = isTenda ? "tenda" : "grup_fgd";
  const labelName = isTenda ? "Tenda" : "FGD";
  const labelNameFull = isTenda ? "Tenda" : "Grup FGD";
  const groupTableName = isTenda ? "plotting_tenda" : "plotting_fgd";

  const [pesertaList, setPesertaList] = useState<PesertaItem[]>([]);
  const [dbGroupList, setDbGroupList] = useState<{ id?: number; nama: string; ketua?: string; ketua_l?: string; ketua_p?: string }[]>([]);
  const [mutasiHistory, setMutasiHistory] = useState<RiwayatMutasiItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  // Active Main Tab: "daftar" | "belum_terdaftar" | "riwayat"
  const [activeTab, setActiveTab] = useState<"daftar" | "belum_terdaftar" | "riwayat">("daftar");

  // Search & Filter
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedKelompok, setSelectedKelompok] = useState<string>("ALL");
  const [showFilterDrawer, setShowFilterDrawer] = useState(false);

  // Pagination for Daftar Group
  const [groupPage, setGroupPage] = useState(1);
  const [groupPageSize, setGroupPageSize] = useState(10);

  // Pagination for Belum Terdaftar
  const [unassignedPage, setUnassignedPage] = useState(1);
  const [unassignedPageSize, setUnassignedPageSize] = useState(10);

  // Pagination for Riwayat Mutasi
  const [mutasiPage, setMutasiPage] = useState(1);
  const [mutasiPageSize, setMutasiPageSize] = useState(10);

  // Selection for bulk mutasi
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  // Modals
  const [showAddGroupModal, setShowAddGroupModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupKetua, setNewGroupKetua] = useState("");

  // Edit Group Modal
  const [editingGroup, setEditingGroup] = useState<string | null>(null);
  const [editGroupNameInput, setEditGroupNameInput] = useState("");
  const [editGroupKetuaInput, setEditGroupKetuaInput] = useState("");

  // View Group Detail / Members Modal
  const [viewingGroup, setViewingGroup] = useState<string | null>(null);

  // Mutasi Modal
  const [showMutasiModal, setShowMutasiModal] = useState(false);
  const [targetGroupForMutasi, setTargetGroupForMutasi] = useState<string>("");
  const [customNewGroupName, setCustomNewGroupName] = useState<string>("");
  const [mutasiTargetPeserta, setMutasiTargetPeserta] = useState<PesertaItem | null>(null);
  const [mutasiDropdownOpen, setMutasiDropdownOpen] = useState(false);
  const [mutasiDropdownSearch, setMutasiDropdownSearch] = useState("");

  // Auto Distribute Modal
  const [showAutoDistributeModal, setShowAutoDistributeModal] = useState(false);
  const [distributeTargetGroups, setDistributeTargetGroups] = useState<string[]>([]);

  // Custom persistent / runtime groups
  const [customGroupList, setCustomGroupList] = useState<string[]>([]);

  // Toast / Feedback
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const showToast = (type: "success" | "error", message: string) => {
    setFeedback({ type, message });
    setTimeout(() => {
      setFeedback(null);
    }, 4000);
  };

  // Helper to determine L/P (Gender) directly from Supabase jenis_kelamin
  const getGender = useCallback((p: PesertaItem): "L" | "P" => {
    if (p.jenis_kelamin) {
      const jk = p.jenis_kelamin.toString().trim().toUpperCase();
      if (
        jk === "P" ||
        jk.startsWith("P") ||
        jk.includes("WANITA") ||
        jk.includes("PUTRI") ||
        jk.includes("PEREMPUAN")
      ) {
        return "P";
      }
      if (
        jk === "L" ||
        jk.startsWith("L") ||
        jk.includes("PRIA") ||
        jk.includes("PUTRA") ||
        jk.includes("LAKI")
      ) {
        return "L";
      }
    }
    const text = `${p.dapukan || ""} ${p.nama || ""}`.toLowerCase();
    if (
      text.includes("putri") ||
      text.includes("akhwat") ||
      text.includes("perempuan") ||
      text.includes("ibu") ||
      text.includes("ny.") ||
      text.includes("sdri") ||
      text.includes("ayu") ||
      text.includes("melati") ||
      text.includes("qurota") ||
      text.includes("berliana") ||
      text.includes("kencana") ||
      text.includes("safitri") ||
      text.includes("anisa") ||
      text.includes("nur") ||
      text.includes("siti") ||
      text.includes("zahra")
    ) {
      return "P";
    }
    return "L";
  }, []);

  // Fetch Peserta, Group Master, and Riwayat Mutasi from Supabase
  const fetchPeserta = useCallback(async () => {
    setLoading(true);
    try {
      const [pesertaRes, groupRes, mutasiRes] = await Promise.allSettled([
        supabase.from("peserta").select("*").order("nama", { ascending: true }),
        supabase.from(groupTableName).select("*").order("nama", { ascending: true }),
        supabase
          .from("riwayat_mutasi")
          .select("*")
          .eq("tipe_plotting", type)
          .order("created_at", { ascending: false })
          .limit(300),
      ]);

      if (pesertaRes.status === "fulfilled") {
        if (pesertaRes.value.error) throw pesertaRes.value.error;
        setPesertaList(pesertaRes.value.data || []);
      } else {
        throw pesertaRes.reason;
      }

      if (groupRes.status === "fulfilled" && !groupRes.value.error && groupRes.value.data) {
        setDbGroupList(groupRes.value.data);
      }

      if (mutasiRes.status === "fulfilled" && !mutasiRes.value.error && mutasiRes.value.data) {
        setMutasiHistory(mutasiRes.value.data);
      }
    } catch (err: any) {
      console.error("Gagal memuat data peserta:", err);
      showToast("error", "Gagal memuat data peserta: " + (err.message || err));
    } finally {
      setLoading(false);
    }
  }, [groupTableName, type]);

  useEffect(() => {
    fetchPeserta();

    // Supabase Realtime Subscription for automatic multi-device synchronization
    const channel = supabase
      .channel(`plotting-${type}-sync`)
      .on("postgres_changes", { event: "*", schema: "public", table: "peserta" }, () => {
        fetchPeserta();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: groupTableName }, () => {
        fetchPeserta();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "riwayat_mutasi" }, () => {
        fetchPeserta();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchPeserta, type, groupTableName]);

  // Initial default options matching the system classes / tents
  const defaultInitialGroups = useMemo(() => {
    if (isTenda) {
      return ["Tenda 01", "Tenda 02", "Tenda 03", "Tenda 04"];
    } else {
      return ["Pegon SMP", "Bacaan SMP", "Lambatan SMP", "Cepatan SMP"];
    }
  }, [isTenda]);

  // Extract all existing groups combining DB master table, peserta assignments, and defaults
  const existingGroups = useMemo(() => {
    const groupSet = new Set<string>(defaultInitialGroups);

    // From DB group master table
    dbGroupList.forEach((g) => {
      if (g.nama && g.nama.trim()) groupSet.add(g.nama.trim());
    });

    // From active peserta
    pesertaList.forEach((p) => {
      const val = isTenda ? p.tenda : p.grup_fgd;
      if (val && val.trim() !== "" && val.trim() !== "-") {
        groupSet.add(val.trim());
      }
    });

    // From custom group runtime list
    customGroupList.forEach((g) => {
      if (g.trim()) groupSet.add(g.trim());
    });

    return Array.from(groupSet).sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })
    );
  }, [pesertaList, dbGroupList, customGroupList, isTenda, defaultInitialGroups]);

  // Extract distinct kelompok options
  const kelompokOptions = useMemo(() => {
    const kSet = new Set<string>();
    pesertaList.forEach((p) => {
      if (p.kelompok && p.kelompok.trim() !== "" && p.kelompok.trim() !== "-") {
        kSet.add(p.kelompok.trim());
      }
    });
    return Array.from(kSet).sort();
  }, [pesertaList]);

  // Group summary statistics for "Daftar Tenda/FGD"
  const groupStatsList = useMemo(() => {
    const map = new Map<
      string,
      {
        name: string;
        ketua: string | null;
        maleCount: number;
        femaleCount: number;
        totalCount: number;
        ketuaL: string | null;
        ketuaP: string | null;
        members: PesertaItem[];
      }
    >();

    // Initialize all existing groups
    existingGroups.forEach((g) => {
      const dbMatch = dbGroupList.find((item) => item.nama?.trim().toLowerCase() === g.trim().toLowerCase());
      map.set(g, {
        name: g,
        ketua: dbMatch?.ketua && dbMatch.ketua !== "-" ? dbMatch.ketua : null,
        maleCount: 0,
        femaleCount: 0,
        totalCount: 0,
        ketuaL: dbMatch?.ketua_l && dbMatch.ketua_l !== "-" ? dbMatch.ketua_l : null,
        ketuaP: dbMatch?.ketua_p && dbMatch.ketua_p !== "-" ? dbMatch.ketua_p : null,
        members: [],
      });
    });

    // Populate counts and members
    pesertaList.forEach((p) => {
      const val = (isTenda ? p.tenda : p.grup_fgd)?.trim();
      if (val && val !== "-" && val !== "") {
        if (!map.has(val)) {
          map.set(val, {
            name: val,
            ketua: null,
            maleCount: 0,
            femaleCount: 0,
            totalCount: 0,
            ketuaL: null,
            ketuaP: null,
            members: [],
          });
        }

        const g = map.get(val)!;
        g.members.push(p);
        g.totalCount++;

        const gender = getGender(p);
        if (gender === "L") {
          g.maleCount++;
          if (
            !g.ketuaL &&
            (p.dapukan?.toLowerCase().includes("ketua") ||
              p.dapukan?.toLowerCase().includes("koordinator") ||
              p.dapukan?.toLowerCase().includes("pj"))
          ) {
            g.ketuaL = p.nama;
          }
        } else {
          g.femaleCount++;
          if (
            !g.ketuaP &&
            (p.dapukan?.toLowerCase().includes("ketua") ||
              p.dapukan?.toLowerCase().includes("koordinator") ||
              p.dapukan?.toLowerCase().includes("pj"))
          ) {
            g.ketuaP = p.nama;
          }
        }
      }
    });

    return Array.from(map.values()).sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" })
    );
  }, [pesertaList, dbGroupList, existingGroups, isTenda, getGender]);

  // Filtered Groups for Table 1
  const filteredGroups = useMemo(() => {
    return groupStatsList.filter((g) => {
      if (!searchTerm) return true;
      const term = searchTerm.toLowerCase();
      return (
        g.name.toLowerCase().includes(term) ||
        (g.ketua && g.ketua.toLowerCase().includes(term)) ||
        (g.ketuaL && g.ketuaL.toLowerCase().includes(term)) ||
        (g.ketuaP && g.ketuaP.toLowerCase().includes(term))
      );
    });
  }, [groupStatsList, searchTerm]);

  // Paginated Groups
  const paginatedGroups = useMemo(() => {
    const start = (groupPage - 1) * groupPageSize;
    return filteredGroups.slice(start, start + groupPageSize);
  }, [filteredGroups, groupPage, groupPageSize]);

  const totalGroupPages = Math.ceil(filteredGroups.length / groupPageSize) || 1;

  // Unassigned participants for Table 2
  const unassignedPesertaList = useMemo(() => {
    return pesertaList.filter((p) => {
      const val = (isTenda ? p.tenda : p.grup_fgd)?.trim();
      return !val || val === "-" || val === "";
    });
  }, [pesertaList, isTenda]);

  // Filtered Unassigned Peserta
  const filteredUnassigned = useMemo(() => {
    return unassignedPesertaList.filter((p) => {
      const matchesSearch =
        !searchTerm ||
        p.nama.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.kelompok && p.kelompok.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (p.dapukan && p.dapukan.toLowerCase().includes(searchTerm.toLowerCase())) ||
        String(p.id).includes(searchTerm);

      const matchesKelompok =
        selectedKelompok === "ALL" ||
        (selectedKelompok === "EMPTY" && (!p.kelompok || p.kelompok === "-")) ||
        p.kelompok === selectedKelompok;

      return matchesSearch && matchesKelompok;
    });
  }, [unassignedPesertaList, searchTerm, selectedKelompok]);

  // Paginated Unassigned Peserta
  const paginatedUnassigned = useMemo(() => {
    const start = (unassignedPage - 1) * unassignedPageSize;
    return filteredUnassigned.slice(start, start + unassignedPageSize);
  }, [filteredUnassigned, unassignedPage, unassignedPageSize]);

  const totalUnassignedPages = Math.ceil(filteredUnassigned.length / unassignedPageSize) || 1;

  // Filtered Riwayat Mutasi
  const filteredMutasi = useMemo(() => {
    return mutasiHistory.filter((m) => {
      if (!searchTerm) return true;
      const term = searchTerm.toLowerCase();
      return (
        (m.nama_peserta && m.nama_peserta.toLowerCase().includes(term)) ||
        (m.tujuan_sebelum && m.tujuan_sebelum.toLowerCase().includes(term)) ||
        (m.tujuan_baru && m.tujuan_baru.toLowerCase().includes(term)) ||
        (m.peserta_id && String(m.peserta_id).includes(term))
      );
    });
  }, [mutasiHistory, searchTerm]);

  // Paginated Riwayat Mutasi
  const paginatedMutasi = useMemo(() => {
    const start = (mutasiPage - 1) * mutasiPageSize;
    return filteredMutasi.slice(start, start + mutasiPageSize);
  }, [filteredMutasi, mutasiPage, mutasiPageSize]);

  const totalMutasiPages = Math.ceil(filteredMutasi.length / mutasiPageSize) || 1;

  // Overview Counts
  const stats = useMemo(() => {
    const total = pesertaList.length;
    const unassignedCount = unassignedPesertaList.length;
    const assignedCount = total - unassignedCount;
    return {
      total,
      assignedCount,
      unassignedCount,
      totalGroups: existingGroups.length,
      totalMutasi: mutasiHistory.length,
    };
  }, [pesertaList, unassignedPesertaList, existingGroups, mutasiHistory]);

  // Execute Mutasi / Plotting Move with Supabase riwayat_mutasi logging
  const executeMutasi = async (ids: number[], destinationGroup: string) => {
    if (ids.length === 0) return;
    const finalVal = destinationGroup.trim() === "" ? "-" : destinationGroup.trim();

    setUpdating(true);
    try {
      const updatePayload = {
        [fieldKey]: finalVal,
      };

      const { error } = await supabase
        .from("peserta")
        .update(updatePayload)
        .in("id", ids);

      if (error) throw error;

      // Prepare Mutasi Log Payloads for Supabase riwayat_mutasi
      const mutasiPayloads: RiwayatMutasiItem[] = ids.map((id) => {
        const p = pesertaList.find((item) => item.id === id);
        const prevGroup = (isTenda ? p?.tenda : p?.grup_fgd) || "-";
        return {
          peserta_id: id,
          nama_peserta: p?.nama || `Peserta #${id}`,
          tipe_plotting: type,
          tujuan_sebelum: prevGroup.trim() === "" ? "-" : prevGroup.trim(),
          tujuan_baru: finalVal,
          created_at: new Date().toISOString(),
        };
      });

      // Insert directly to riwayat_mutasi table
      try {
        const { data: insertedLogs, error: logErr } = await supabase
          .from("riwayat_mutasi")
          .insert(mutasiPayloads)
          .select("*");

        if (insertedLogs && insertedLogs.length > 0) {
          setMutasiHistory((prev) => [...insertedLogs, ...prev]);
        } else if (!logErr) {
          setMutasiHistory((prev) => [...mutasiPayloads, ...prev]);
        }
      } catch (logErr) {
        console.warn("Catatan riwayat_mutasi warning:", logErr);
      }

      // Optimistic update in UI state
      setPesertaList((prev) =>
        prev.map((p) => (ids.includes(p.id) ? { ...p, [fieldKey]: finalVal } : p))
      );

      // Register new group name if custom
      if (finalVal !== "-" && !existingGroups.includes(finalVal)) {
        setCustomGroupList((prev) => [...prev, finalVal]);
      }

      // Toast message
      if (mutasiTargetPeserta && ids.length === 1) {
        showToast(
          "success",
          finalVal === "-"
            ? `Santri "${mutasiTargetPeserta.nama}" dikeluarkan dari ${labelName.toLowerCase()}. Riwayat mutasi tersimpan.`
            : `Santri "${mutasiTargetPeserta.nama}" berhasil dimasukkan ke ${labelName.toLowerCase()} ${finalVal}. Riwayat mutasi tersimpan.`
        );
      } else {
        showToast(
          "success",
          `Berhasil memutasikan ${ids.length} peserta ke ${
            finalVal === "-" ? "Belum Terdaftar" : `${labelName} ${finalVal}`
          }. Riwayat mutasi tersimpan di database.`
        );
      }

      // Reset state
      setSelectedIds((prev) => prev.filter((id) => !ids.includes(id)));
      setShowMutasiModal(false);
      setMutasiTargetPeserta(null);
      setTargetGroupForMutasi("");
      setCustomNewGroupName("");
      setMutasiDropdownOpen(false);
      setMutasiDropdownSearch("");
    } catch (err: any) {
      console.error("Gagal memutasi peserta:", err);
      showToast("error", "Gagal memutasi peserta: " + (err.message || err));
    } finally {
      setUpdating(false);
    }
  };

  // Add new group
  const handleAddNewGroup = async () => {
    const clean = newGroupName.trim();
    if (!clean) return;
    const ketuaVal = newGroupKetua.trim() || "-";

    if (!existingGroups.includes(clean)) {
      setCustomGroupList((prev) => [...prev, clean]);
      setDbGroupList((prev) => [...prev, { nama: clean, ketua: ketuaVal }]);

      try {
        await supabase
          .from(groupTableName)
          .insert({ nama: clean, ketua: ketuaVal });
      } catch (err) {
        console.warn("Sync to DB group table notice:", err);
      }

      showToast("success", `${labelName} "${clean}" berhasil ditambahkan ke database.`);
    } else {
      showToast("error", `${labelName} "${clean}" sudah terdaftar.`);
    }

    setNewGroupName("");
    setNewGroupKetua("");
    setShowAddGroupModal(false);
  };

  // Rename group & update Ketua
  const handleRenameGroup = async () => {
    if (!editingGroup) return;
    const newName = editGroupNameInput.trim();
    const newKetua = editGroupKetuaInput.trim();
    if (!newName) {
      setEditingGroup(null);
      return;
    }

    setUpdating(true);
    try {
      if (newName !== editingGroup) {
        const { error } = await supabase
          .from("peserta")
          .update({ [fieldKey]: newName })
          .eq(fieldKey, editingGroup);

        if (error) console.warn("Peserta update error:", error);

        setPesertaList((prev) =>
          prev.map((p) => (p[fieldKey] === editingGroup ? { ...p, [fieldKey]: newName } : p))
        );

        setCustomGroupList((prev) =>
          prev.map((g) => (g === editingGroup ? newName : g))
        );
      }

      // Update in DB group master table
      try {
        await supabase
          .from(groupTableName)
          .upsert({ nama: newName, ketua: newKetua || "-" }, { onConflict: "nama" });
      } catch (err) {
        console.warn("DB master group table update notice:", err);
      }

      setDbGroupList((prev) => {
        const exists = prev.some((g) => g.nama === editingGroup || g.nama === newName);
        if (exists) {
          return prev.map((g) =>
            g.nama === editingGroup || g.nama === newName
              ? { ...g, nama: newName, ketua: newKetua || g.ketua }
              : g
          );
        }
        return [...prev, { nama: newName, ketua: newKetua || "-" }];
      });

      showToast("success", `Data ${labelName} "${newName}" berhasil diperbarui di database.`);
      setEditingGroup(null);
      setEditGroupNameInput("");
      setEditGroupKetuaInput("");
    } catch (err: any) {
      console.error("Gagal mengubah data grup:", err);
      showToast("error", "Gagal mengubah data grup: " + (err.message || err));
    } finally {
      setUpdating(false);
    }
  };

  // Delete / Clear Group
  const handleDeleteGroup = async (groupName: string) => {
    if (!window.confirm(`Apakah Anda yakin ingin menghapus ${labelName} "${groupName}"? Peserta di dalamnya akan berstatus "Belum Terdaftar".`)) {
      return;
    }

    setUpdating(true);
    try {
      const affectedPeserta = pesertaList.filter(
        (p) => (isTenda ? p.tenda : p.grup_fgd) === groupName
      );

      const { error } = await supabase
        .from("peserta")
        .update({ [fieldKey]: "-" })
        .eq(fieldKey, groupName);

      if (error) throw error;

      // Delete from DB group table
      try {
        await supabase.from(groupTableName).delete().eq("nama", groupName);
      } catch (err) {
        console.warn("DB group table delete notice:", err);
      }

      // Record mutasi logs for cleared members
      if (affectedPeserta.length > 0) {
        const mutasiLogs: RiwayatMutasiItem[] = affectedPeserta.map((p) => ({
          peserta_id: p.id,
          nama_peserta: p.nama,
          tipe_plotting: type,
          tujuan_sebelum: groupName,
          tujuan_baru: "-",
          created_at: new Date().toISOString(),
        }));
        try {
          const { data: inserted } = await supabase.from("riwayat_mutasi").insert(mutasiLogs).select("*");
          if (inserted) setMutasiHistory((prev) => [...inserted, ...prev]);
        } catch (e) {
          console.warn("Riwayat mutasi delete log notice:", e);
        }
      }

      setPesertaList((prev) =>
        prev.map((p) => (p[fieldKey] === groupName ? { ...p, [fieldKey]: "-" } : p))
      );

      setCustomGroupList((prev) => prev.filter((g) => g !== groupName));
      setDbGroupList((prev) => prev.filter((g) => g.nama !== groupName));

      showToast("success", `${labelName} "${groupName}" berhasil dikosongkan/dihapus.`);
    } catch (err: any) {
      console.error("Gagal menghapus grup:", err);
      showToast("error", "Gagal menghapus grup: " + (err.message || err));
    } finally {
      setUpdating(false);
    }
  };

  // Auto Distribute (Bagi Rata)
  const handleExecuteAutoDistribute = async () => {
    if (distributeTargetGroups.length === 0) {
      showToast("error", "Pilih minimal 1 grup tujuan pembagian.");
      return;
    }

    if (unassignedPesertaList.length === 0) {
      showToast("error", `Semua peserta sudah memiliki ${labelName}.`);
      setShowAutoDistributeModal(false);
      return;
    }

    setUpdating(true);
    try {
      const updates: { id: number; group: string; name: string }[] = [];
      unassignedPesertaList.forEach((p, idx) => {
        const targetG = distributeTargetGroups[idx % distributeTargetGroups.length];
        updates.push({ id: p.id, group: targetG, name: p.nama });
      });

      const groupAssignments = new Map<string, number[]>();
      updates.forEach(({ id, group }) => {
        if (!groupAssignments.has(group)) groupAssignments.set(group, []);
        groupAssignments.get(group)!.push(id);
      });

      const promises = Array.from(groupAssignments.entries()).map(([g, ids]) =>
        supabase.from("peserta").update({ [fieldKey]: g }).in("id", ids)
      );

      await Promise.all(promises);

      // Record batch mutasi logs in riwayat_mutasi
      const batchLogs: RiwayatMutasiItem[] = updates.map((u) => ({
        peserta_id: u.id,
        nama_peserta: u.name,
        tipe_plotting: type,
        tujuan_sebelum: "Belum Terdaftar",
        tujuan_baru: u.group,
        created_at: new Date().toISOString(),
      }));

      try {
        const { data: insertedLogs } = await supabase.from("riwayat_mutasi").insert(batchLogs).select("*");
        if (insertedLogs) setMutasiHistory((prev) => [...insertedLogs, ...prev]);
      } catch (e) {
        console.warn("Auto distribute mutasi log warning:", e);
      }

      setPesertaList((prev) =>
        prev.map((p) => {
          const found = updates.find((u) => u.id === p.id);
          return found ? { ...p, [fieldKey]: found.group } : p;
        })
      );

      showToast(
        "success",
        `Berhasil membagi rata ${unassignedPesertaList.length} peserta ke dalam ${distributeTargetGroups.length} ${labelName}!`
      );
      setShowAutoDistributeModal(false);
    } catch (err: any) {
      console.error("Gagal auto distribute:", err);
      showToast("error", "Gagal membagi peserta: " + (err.message || err));
    } finally {
      setUpdating(false);
    }
  };

  // Export to Excel
  const handleExportExcel = () => {
    if (pesertaList.length === 0) {
      showToast("error", "Tidak ada data untuk diekspor.");
      return;
    }

    const headers = [
      "No",
      "ID Peserta",
      "Nama Lengkap",
      "Kelompok",
      "Dapukan",
      labelNameFull,
      isTenda ? "Grup FGD" : "Tenda",
      "Status Plotting",
    ];

    const rows = pesertaList.map((p, idx) => {
      const currentVal = isTenda ? p.tenda : p.grup_fgd;
      const otherVal = isTenda ? p.grup_fgd : p.tenda;
      const isPlotted = currentVal && currentVal.trim() !== "" && currentVal.trim() !== "-";

      return [
        idx + 1,
        p.id,
        p.nama,
        p.kelompok || "-",
        p.dapukan || "-",
        currentVal || "Belum Terdaftar",
        otherVal || "-",
        isPlotted ? "Terdaftar" : "Belum Terdaftar",
      ];
    });

    const summaryHeaders = ["No", `Nama ${labelNameFull}`, "Ketua", "Laki-laki", "Perempuan", "Total Peserta"];
    const summaryRows = groupStatsList.map((g, idx) => [
      idx + 1,
      g.name,
      g.ketua || "-",
      g.maleCount,
      g.femaleCount,
      g.totalCount,
    ]);

    const mutasiHeaders = ["No", "Waktu Mutasi", "ID Peserta", "Nama Peserta", "Tipe", "Asal", "Tujuan Baru"];
    const mutasiRows = mutasiHistory.map((m, idx) => [
      idx + 1,
      new Date(m.created_at).toLocaleString("id-ID"),
      m.peserta_id || "-",
      m.nama_peserta || "-",
      m.tipe_plotting?.toUpperCase() || "-",
      m.tujuan_sebelum || "Belum Terdaftar",
      m.tujuan_baru === "-" ? "Dikeluarkan / Belum Terdaftar" : m.tujuan_baru,
    ]);

    exportDataToExcel(
      `Plotting_${labelNameFull.replace(/\s+/g, "_")}_${new Date().toISOString().slice(0, 10)}.xlsx`,
      [
        {
          sheetName: `Daftar ${labelNameFull}`,
          title: `DATA PLOTTING ${labelNameFull.toUpperCase()} PESERTA`,
          subtitle: `Total: ${pesertaList.length} | Terdaftar: ${stats.assignedCount} | Belum Terdaftar: ${stats.unassignedCount}`,
          headers,
          rows,
          customColWidths: [6, 12, 30, 20, 18, 20, 18, 20],
        },
        {
          sheetName: `Rekap ${labelNameFull}`,
          title: `REKAPITULASI JUMLAH PER ${labelNameFull.toUpperCase()}`,
          subtitle: `Total Grup: ${groupStatsList.length}`,
          headers: summaryHeaders,
          rows: summaryRows,
          customColWidths: [6, 25, 20, 15, 15, 18],
        },
        {
          sheetName: `Riwayat Mutasi`,
          title: `RIWAYAT MUTASI PLOTTING ${labelNameFull.toUpperCase()}`,
          subtitle: `Total Mutasi Tercatat: ${mutasiHistory.length}`,
          headers: mutasiHeaders,
          rows: mutasiRows,
          customColWidths: [6, 22, 14, 28, 12, 22, 25],
        },
      ]
    );
  };

  // Toggle selection for bulk actions
  const toggleSelect = (id: number) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const toggleSelectAllUnassigned = () => {
    if (selectedIds.length === filteredUnassigned.length && filteredUnassigned.length > 0) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredUnassigned.map((p) => p.id));
    }
  };

  return (
    <div className="w-full max-w-7xl mx-auto space-y-5 font-sans text-slate-800 pb-16">
      {/* Toast Notification */}
      {feedback && (
        <div
          className={`fixed top-18 right-6 z-50 px-4 py-3 rounded-2xl border font-bold text-xs flex items-center gap-2.5 shadow-xl transition-all animate-in slide-in-from-top-2 ${
            feedback.type === "success"
              ? "bg-emerald-600 text-white border-emerald-700"
              : "bg-rose-600 text-white border-rose-700"
          }`}
        >
          {feedback.type === "success" ? (
            <CheckCircle2 className="w-5 h-5 shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 shrink-0" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* 1. BREADCRUMB */}
      <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
        <span>{labelNameFull}</span>
        <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
        <span className="text-slate-800 font-semibold">Daftar</span>
      </div>

      {/* 2. PAGE HEADER ROW */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">
            {labelNameFull}
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Manajemen alokasi dan plotting {labelNameFull.toLowerCase()} peserta ({stats.total} total peserta)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => {
              setDistributeTargetGroups(existingGroups.length > 0 ? existingGroups : ["Grup 1", "Grup 2"]);
              setShowAutoDistributeModal(true);
            }}
            className="px-4 py-2 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-xl border border-slate-300 shadow-2xs flex items-center gap-2 transition-all active:scale-95"
            title="Bagi rata peserta yang belum di-plot"
          >
            <Sparkles className="w-4 h-4 text-amber-500" />
            <span>Bagi Otomatis</span>
          </button>

          <button
            onClick={handleExportExcel}
            className="px-4 py-2 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-xl border border-slate-300 shadow-2xs flex items-center gap-2 transition-all active:scale-95"
            title={`Unduh Data ${labelNameFull} Excel`}
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            <span>Ekspor</span>
          </button>

          <button
            onClick={() => setShowAddGroupModal(true)}
            className="px-4 py-2 bg-[#203598] hover:bg-[#182978] text-white rounded-xl text-xs font-semibold shadow-xs flex items-center gap-2 transition-all active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>Buat {labelName}</span>
          </button>
        </div>
      </div>

      {/* 3. CENTERED SEGMENTED PILLS SWITCHER */}
      <div className="flex justify-center pt-1 pb-1">
        <div className="inline-flex p-1 bg-white border border-slate-200/90 rounded-2xl shadow-2xs gap-1">
          <button
            onClick={() => {
              setActiveTab("daftar");
              setSearchTerm("");
            }}
            className={`px-5 py-2 rounded-xl text-xs font-semibold transition-all ${
              activeTab === "daftar"
                ? "bg-blue-50 text-[#203598] font-bold shadow-2xs"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
            }`}
          >
            Daftar {labelName}
          </button>

          <button
            onClick={() => {
              setActiveTab("belum_terdaftar");
              setSearchTerm("");
            }}
            className={`px-5 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
              activeTab === "belum_terdaftar"
                ? "bg-blue-50 text-[#203598] font-bold shadow-2xs"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
            }`}
          >
            <span>Belum Terdaftar {labelName}</span>
            {stats.unassignedCount > 0 && (
              <span
                className={`px-2 py-0.2 rounded-full text-[10px] font-bold ${
                  activeTab === "belum_terdaftar"
                    ? "bg-[#203598] text-white"
                    : "bg-slate-200 text-slate-700"
                }`}
              >
                {stats.unassignedCount}
              </span>
            )}
          </button>

          <button
            onClick={() => {
              setActiveTab("riwayat");
              setSearchTerm("");
            }}
            className={`px-5 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
              activeTab === "riwayat"
                ? "bg-blue-50 text-[#203598] font-bold shadow-2xs"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
            }`}
          >
            <ArrowRightLeft className="w-3.5 h-3.5" />
            <span>Riwayat Mutasi</span>
            {stats.totalMutasi > 0 && (
              <span
                className={`px-2 py-0.2 rounded-full text-[10px] font-bold ${
                  activeTab === "riwayat"
                    ? "bg-[#203598] text-white"
                    : "bg-slate-200 text-slate-700"
                }`}
              >
                {stats.totalMutasi}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* 4. MAIN TABLE CARD CONTAINER */}
      <div className="bg-white border border-slate-200/90 rounded-2xl shadow-2xs overflow-hidden">
        {/* Top Card Toolbar (Search & Filter Icon) */}
        <div className="p-4 md:px-6 border-b border-slate-200/80 flex items-center justify-end gap-3">
          <div className="relative w-full max-w-xs">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Cari"
              className="w-full pl-9 pr-8 py-1.5 text-xs bg-white border border-slate-300 rounded-xl focus:outline-none focus:border-[#203598] focus:ring-1 focus:ring-[#203598] text-slate-800"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <button
            onClick={() => setShowFilterDrawer(!showFilterDrawer)}
            className={`p-2 rounded-xl border transition-colors relative flex items-center gap-1 text-xs font-semibold ${
              showFilterDrawer || selectedKelompok !== "ALL"
                ? "bg-blue-50 text-[#203598] border-[#203598]/40"
                : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50"
            }`}
            title="Filter Data"
          >
            <Filter className="w-4 h-4" />
            <span className="text-[10px] font-bold text-slate-500">
              {selectedKelompok !== "ALL" ? "1" : "0"}
            </span>
          </button>

          <button
            onClick={fetchPeserta}
            disabled={loading}
            className="p-2 bg-white hover:bg-slate-50 text-slate-600 rounded-xl transition-colors border border-slate-300"
            title="Refresh Data"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>

        {/* Optional Collapsible Filter Bar */}
        {showFilterDrawer && (
          <div className="bg-slate-50/80 border-b border-slate-200 p-4 md:px-6 flex flex-wrap items-center gap-4 text-xs animate-in fade-in duration-100">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-700">Filter Kelompok:</span>
              <select
                value={selectedKelompok}
                onChange={(e) => setSelectedKelompok(e.target.value)}
                className="px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-[#203598]"
              >
                <option value="ALL">Semua Kelompok</option>
                {kelompokOptions.map((k) => (
                  <option key={k} value={k}>
                    Kelompok {k}
                  </option>
                ))}
                <option value="EMPTY">Tanpa Kelompok</option>
              </select>
            </div>

            {selectedKelompok !== "ALL" && (
              <button
                onClick={() => setSelectedKelompok("ALL")}
                className="text-rose-600 hover:text-rose-700 font-semibold cursor-pointer"
              >
                Reset Filter
              </button>
            )}
          </div>
        )}

        {/* ================= VIEW 1: DAFTAR TENDA / FGD ================= */}
        {activeTab === "daftar" && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50/90 text-slate-700 font-bold border-b border-slate-200/90">
                  <th className="py-3.5 px-4 w-28 text-center">Aksi</th>
                  <th className="py-3.5 px-4 font-semibold text-slate-800">
                    <div className="flex items-center gap-1">
                      <span>Nama {labelName}</span>
                      <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                    </div>
                  </th>
                  <th className="py-3.5 px-4 font-semibold text-slate-800">
                    <div className="flex items-center gap-1">
                      <span>Jumlah Peserta</span>
                      <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                    </div>
                  </th>
                  <th className="py-3.5 px-4 font-semibold text-slate-800">
                    <div className="flex items-center gap-1">
                      <span>Ketua</span>
                      <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                    </div>
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100 text-slate-700 font-normal">
                {loading ? (
                  <tr>
                    <td colSpan={4} className="py-12 text-center text-slate-400">
                      <div className="flex items-center justify-center gap-2">
                        <Loader2 className="w-5 h-5 animate-spin text-[#203598]" />
                        <span>Memuat daftar {labelName.toLowerCase()}...</span>
                      </div>
                    </td>
                  </tr>
                ) : paginatedGroups.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-12 text-center text-slate-400">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <Tent className="w-8 h-8 text-slate-300" />
                        <p className="font-semibold text-slate-600">Belum ada {labelName} yang terdaftar</p>
                        <button
                          onClick={() => setShowAddGroupModal(true)}
                          className="mt-1 px-3.5 py-1.5 bg-[#203598] text-white text-xs font-semibold rounded-xl"
                        >
                          + Buat {labelName} Sekarang
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  paginatedGroups.map((grp) => (
                    <tr key={grp.name} className="hover:bg-slate-50/70 transition-colors">
                      {/* Action Icons */}
                      <td className="py-3.5 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {/* Eye / View detail */}
                          <button
                            onClick={() => setViewingGroup(grp.name)}
                            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors border border-slate-200"
                            title={`Lihat Anggota ${grp.name}`}
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>

                          {/* Edit group */}
                          <button
                            onClick={() => {
                              setEditingGroup(grp.name);
                              setEditGroupNameInput(grp.name);
                              setEditGroupKetuaInput(grp.ketua || grp.ketuaL || grp.ketuaP || "");
                            }}
                            className="p-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors shadow-2xs"
                            title={`Ubah ${grp.name}`}
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>

                          {/* Delete group */}
                          <button
                            onClick={() => handleDeleteGroup(grp.name)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors border border-slate-200"
                            title={`Hapus / Kosongkan ${grp.name}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>

                      {/* Nama */}
                      <td className="py-3.5 px-4 font-bold text-slate-900 text-sm">
                        {grp.name}
                      </td>

                      {/* Jumlah Peserta */}
                      <td className="py-3.5 px-4 font-semibold text-slate-900 text-xs">
                        {grp.totalCount} Peserta
                      </td>

                      {/* Ketua */}
                      <td className="py-3.5 px-4">
                        {grp.ketua && grp.ketua !== "-" ? (
                          <div className="font-semibold text-slate-900 text-xs flex items-center gap-1.5">
                            <UserCheck className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                            <span>{grp.ketua}</span>
                          </div>
                        ) : (
                          <span className="text-slate-400 font-medium text-xs">
                            Belum Ditentukan
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>

            {/* Pagination Footer */}
            <div className="border-t border-slate-200/90 px-4 md:px-6 py-3 bg-white flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
              <div>
                Menampilkan{" "}
                <strong>
                  {filteredGroups.length > 0 ? (groupPage - 1) * groupPageSize + 1 : 0}
                </strong>{" "}
                sampai{" "}
                <strong>
                  {Math.min(groupPage * groupPageSize, filteredGroups.length)}
                </strong>{" "}
                dari <strong>{filteredGroups.length}</strong> hasil
              </div>

              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <span>per halaman</span>
                  <select
                    value={groupPageSize}
                    onChange={(e) => {
                      setGroupPageSize(Number(e.target.value));
                      setGroupPage(1);
                    }}
                    className="px-2 py-1 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 focus:outline-none"
                  >
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                </div>

                {totalGroupPages > 1 && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setGroupPage((p) => Math.max(1, p - 1))}
                      disabled={groupPage === 1}
                      className="p-1 border border-slate-300 rounded-lg disabled:opacity-40 hover:bg-slate-50"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    <span className="px-2">
                      {groupPage} / {totalGroupPages}
                    </span>
                    <button
                      onClick={() => setGroupPage((p) => Math.min(totalGroupPages, p + 1))}
                      disabled={groupPage === totalGroupPages}
                      className="p-1 border border-slate-300 rounded-lg disabled:opacity-40 hover:bg-slate-50"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ================= VIEW 2: BELUM TERDAFTAR (Image 2) ================= */}
        {activeTab === "belum_terdaftar" && (
          <div className="overflow-x-auto">
            {/* Floating Bulk Action Bar when checked */}
            {selectedIds.length > 0 && (
              <div className="bg-slate-900 text-white px-4 py-2.5 flex items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2 font-medium">
                  <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[11px] font-bold">
                    {selectedIds.length}
                  </span>
                  <span>Peserta terpilih</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setMutasiTargetPeserta(null);
                      setShowMutasiModal(true);
                    }}
                    className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg flex items-center gap-1.5 transition-colors"
                  >
                    <ArrowRightLeft className="w-3.5 h-3.5" />
                    <span>Plotting ke {labelName}...</span>
                  </button>
                  <button
                    onClick={() => setSelectedIds([])}
                    className="px-2.5 py-1 text-slate-400 hover:text-white"
                  >
                    Batal
                  </button>
                </div>
              </div>
            )}

            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50/90 text-slate-700 font-bold border-b border-slate-200/90">
                  <th className="py-3.5 px-4 w-12 text-center">
                    <input
                      type="checkbox"
                      checked={
                        filteredUnassigned.length > 0 &&
                        selectedIds.length === filteredUnassigned.length
                      }
                      onChange={toggleSelectAllUnassigned}
                      className="rounded text-[#203598] focus:ring-0 cursor-pointer"
                    />
                  </th>
                  <th className="py-3.5 px-4 w-28 text-left">Aksi</th>
                  <th className="py-3.5 px-4 font-semibold text-slate-800">
                    <div className="flex items-center gap-1">
                      <span>Nama</span>
                      <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                    </div>
                  </th>
                  <th className="py-3.5 px-4 font-semibold text-slate-800">
                    <div className="flex items-center gap-1">
                      <span>L/P</span>
                      <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                    </div>
                  </th>
                  <th className="py-3.5 px-4 font-semibold text-slate-800">Kelompok</th>
                  <th className="py-3.5 px-4 font-semibold text-slate-800">Dapukan</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100 text-slate-700 font-normal">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-400">
                      <div className="flex items-center justify-center gap-2">
                        <Loader2 className="w-5 h-5 animate-spin text-[#203598]" />
                        <span>Memuat data peserta...</span>
                      </div>
                    </td>
                  </tr>
                ) : paginatedUnassigned.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-400">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <UserCheck className="w-8 h-8 text-emerald-500" />
                        <p className="font-semibold text-slate-700">Semua peserta telah terdaftar di {labelName}!</p>
                        <p className="text-xs text-slate-500">Tidak ada peserta yang belum memiliki alokasi.</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  paginatedUnassigned.map((p) => {
                    const gender = getGender(p);
                    const isChecked = selectedIds.includes(p.id);

                    return (
                      <tr
                        key={p.id}
                        className={`hover:bg-slate-50/70 transition-colors ${
                          isChecked ? "bg-blue-50/40" : ""
                        }`}
                      >
                        {/* Checkbox */}
                        <td className="py-3.5 px-4 text-center">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleSelect(p.id)}
                            className="rounded text-[#203598] focus:ring-0 cursor-pointer"
                          />
                        </td>

                        {/* Mutasi Button */}
                        <td className="py-3.5 px-4 text-left">
                          <button
                            onClick={() => {
                              setMutasiTargetPeserta(p);
                              setShowMutasiModal(true);
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-blue-200/90 bg-blue-50/70 hover:bg-blue-100/80 text-[#1d4ed8] font-semibold text-xs transition-all cursor-pointer shadow-2xs active:scale-95"
                          >
                            <ArrowRightLeft className="w-3.5 h-3.5 text-[#1d4ed8]" />
                            <span>Mutasi</span>
                          </button>
                        </td>

                        {/* Nama & ID */}
                        <td className="py-3.5 px-4">
                          <div className="font-semibold text-slate-900 leading-tight text-xs">
                            {p.nama}
                          </div>
                          <div className="text-[11px] text-slate-400 mt-0.5 font-mono">
                            {p.id ? `2801${String(p.id).padStart(4, "0")}` : "-"}
                          </div>
                        </td>

                        {/* L/P Gender Badge */}
                        <td className="py-3.5 px-4">
                          {gender === "L" ? (
                            <span className="inline-block px-2.5 py-0.5 bg-blue-50 text-blue-600 border border-blue-200/90 rounded text-[11px] font-bold">
                              L
                            </span>
                          ) : (
                            <span className="inline-block px-2.5 py-0.5 bg-emerald-50 text-emerald-600 border border-emerald-200/90 rounded text-[11px] font-bold">
                              P
                            </span>
                          )}
                        </td>

                        {/* Kelompok */}
                        <td className="py-3.5 px-4 font-medium text-slate-700">
                          {p.kelompok || "-"}
                        </td>

                        {/* Dapukan */}
                        <td className="py-3.5 px-4 font-medium text-slate-700">
                          {p.dapukan || "Peserta"}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>

            {/* Pagination Footer */}
            <div className="border-t border-slate-200/90 px-4 md:px-6 py-3 bg-white flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
              <div>
                Menampilkan{" "}
                <strong>
                  {filteredUnassigned.length > 0
                    ? (unassignedPage - 1) * unassignedPageSize + 1
                    : 0}
                </strong>{" "}
                sampai{" "}
                <strong>
                  {Math.min(unassignedPage * unassignedPageSize, filteredUnassigned.length)}
                </strong>{" "}
                dari <strong>{filteredUnassigned.length}</strong> hasil
              </div>

              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <span>per halaman</span>
                  <select
                    value={unassignedPageSize}
                    onChange={(e) => {
                      setUnassignedPageSize(Number(e.target.value));
                      setUnassignedPage(1);
                    }}
                    className="px-2 py-1 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 focus:outline-none"
                  >
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                </div>

                {totalUnassignedPages > 1 && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setUnassignedPage((p) => Math.max(1, p - 1))}
                      disabled={unassignedPage === 1}
                      className="p-1 border border-slate-300 rounded-lg disabled:opacity-40 hover:bg-slate-50"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    <span className="px-2">
                      {unassignedPage} / {totalUnassignedPages}
                    </span>
                    <button
                      onClick={() =>
                        setUnassignedPage((p) => Math.min(totalUnassignedPages, p + 1))
                      }
                      disabled={unassignedPage === totalUnassignedPages}
                      className="p-1 border border-slate-300 rounded-lg disabled:opacity-40 hover:bg-slate-50"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ================= VIEW 3: RIWAYAT MUTASI PLOTTING (Connected to Database) ================= */}
        {activeTab === "riwayat" && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50/90 text-slate-700 font-bold border-b border-slate-200/90">
                  <th className="py-3.5 px-4 w-12 text-center text-slate-400 font-semibold">
                    No
                  </th>
                  <th className="py-3.5 px-4">Waktu Mutasi (WIB)</th>
                  <th className="py-3.5 px-4">Nama Santri</th>
                  <th className="py-3.5 px-4">Asal ({labelName} Sebelum)</th>
                  <th className="py-3.5 px-4">Tujuan ({labelName} Baru)</th>
                  <th className="py-3.5 px-4">Status / Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedMutasi.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-16 text-center text-slate-400">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                          <ArrowRightLeft className="w-6 h-6" />
                        </div>
                        <span className="font-medium text-xs text-slate-600">
                          Belum ada data riwayat mutasi {labelName.toLowerCase()} yang tercatat.
                        </span>
                        <span className="text-[11px] text-slate-400">
                          Semua pemindahan atau plotting santri akan otomatis dicatat di tabel riwayat database.
                        </span>
                      </div>
                    </td>
                  </tr>
                ) : (
                  paginatedMutasi.map((item, idx) => {
                    const rowNumber = (mutasiPage - 1) * mutasiPageSize + idx + 1;
                    const dateObj = new Date(item.created_at);
                    const formattedDate = dateObj.toLocaleDateString("id-ID", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    });
                    const formattedTime = dateObj.toLocaleTimeString("id-ID", {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    });

                    const isFromUnassigned =
                      !item.tujuan_sebelum ||
                      item.tujuan_sebelum === "-" ||
                      item.tujuan_sebelum === "Belum Terdaftar";
                    const isToUnassigned =
                      !item.tujuan_baru ||
                      item.tujuan_baru === "-" ||
                      item.tujuan_baru === "Belum Terdaftar";

                    let actionType = "Pindah";
                    let badgeClass = "bg-blue-50 text-blue-700 border-blue-200";

                    if (isFromUnassigned && !isToUnassigned) {
                      actionType = "Plotting Baru";
                      badgeClass = "bg-emerald-50 text-emerald-700 border-emerald-200";
                    } else if (isToUnassigned) {
                      actionType = "Dikeluarkan";
                      badgeClass = "bg-rose-50 text-rose-700 border-rose-200";
                    }

                    return (
                      <tr
                        key={item.id || `mutasi-${idx}-${item.created_at}`}
                        className="hover:bg-slate-50/70 transition-colors"
                      >
                        {/* No */}
                        <td className="py-3.5 px-4 text-center text-slate-400 font-mono">
                          {rowNumber}
                        </td>

                        {/* Waktu */}
                        <td className="py-3.5 px-4">
                          <div className="font-semibold text-slate-800">
                            {formattedDate}
                          </div>
                          <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                            {formattedTime} WIB
                          </div>
                        </td>

                        {/* Nama Santri & ID */}
                        <td className="py-3.5 px-4">
                          <div className="font-semibold text-slate-900 text-xs">
                            {item.nama_peserta}
                          </div>
                          <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                            {item.peserta_id
                              ? `2801${String(item.peserta_id).padStart(4, "0")}`
                              : "-"}
                          </div>
                        </td>

                        {/* Asal */}
                        <td className="py-3.5 px-4 font-medium">
                          {isFromUnassigned ? (
                            <span className="inline-block px-2 py-0.5 bg-slate-100 text-slate-500 rounded text-[11px] font-semibold border border-slate-200">
                              Belum Terdaftar
                            </span>
                          ) : (
                            <span className="inline-block px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-[11px] font-bold border border-slate-300">
                              {item.tujuan_sebelum}
                            </span>
                          )}
                        </td>

                        {/* Tujuan */}
                        <td className="py-3.5 px-4 font-medium">
                          {isToUnassigned ? (
                            <span className="inline-block px-2 py-0.5 bg-slate-100 text-slate-500 rounded text-[11px] font-semibold border border-slate-200">
                              Belum Terdaftar
                            </span>
                          ) : (
                            <span className="inline-block px-2 py-0.5 bg-blue-50 text-[#1d4ed8] rounded text-[11px] font-bold border border-blue-200">
                              {item.tujuan_baru}
                            </span>
                          )}
                        </td>

                        {/* Status / Aksi */}
                        <td className="py-3.5 px-4">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold border ${badgeClass}`}
                          >
                            {actionType}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>

            {/* Pagination Footer for Riwayat Mutasi */}
            <div className="border-t border-slate-200/90 px-4 md:px-6 py-3 bg-white flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
              <div>
                Menampilkan{" "}
                <strong>
                  {filteredMutasi.length > 0
                    ? (mutasiPage - 1) * mutasiPageSize + 1
                    : 0}
                </strong>{" "}
                sampai{" "}
                <strong>
                  {Math.min(mutasiPage * mutasiPageSize, filteredMutasi.length)}
                </strong>{" "}
                dari <strong>{filteredMutasi.length}</strong> log mutasi
              </div>

              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <span>per halaman</span>
                  <select
                    value={mutasiPageSize}
                    onChange={(e) => {
                      setMutasiPageSize(Number(e.target.value));
                      setMutasiPage(1);
                    }}
                    className="px-2 py-1 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 focus:outline-none"
                  >
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                </div>

                {totalMutasiPages > 1 && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setMutasiPage((p) => Math.max(1, p - 1))}
                      disabled={mutasiPage === 1}
                      className="p-1 border border-slate-300 rounded-lg disabled:opacity-40 hover:bg-slate-50"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    <span className="px-2">
                      {mutasiPage} / {totalMutasiPages}
                    </span>
                    <button
                      onClick={() =>
                        setMutasiPage((p) => Math.min(totalMutasiPages, p + 1))
                      }
                      disabled={mutasiPage === totalMutasiPages}
                      className="p-1 border border-slate-300 rounded-lg disabled:opacity-40 hover:bg-slate-50"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ================= MODAL: VIEW GROUP DETAIL / MEMBERS ================= */}
      {viewingGroup && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl border border-slate-200">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#203598] flex items-center justify-center font-bold">
                  {isTenda ? <Tent className="w-5 h-5" /> : <MessageSquare className="w-5 h-5" />}
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-base">
                    Daftar Anggota {labelName} {viewingGroup}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {
                      pesertaList.filter(
                        (p) => (isTenda ? p.tenda : p.grup_fgd)?.trim() === viewingGroup
                      ).length
                    }{" "}
                    anggota terdaftar
                  </p>
                </div>
              </div>

              <button
                onClick={() => setViewingGroup(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body - Member List */}
            <div className="p-5 overflow-y-auto flex-1 divide-y divide-slate-100">
              {pesertaList.filter(
                (p) => (isTenda ? p.tenda : p.grup_fgd)?.trim() === viewingGroup
              ).length === 0 ? (
                <div className="text-center py-8 text-slate-400 text-xs">
                  Belum ada peserta di {labelName} ini.
                </div>
              ) : (
                pesertaList
                  .filter((p) => (isTenda ? p.tenda : p.grup_fgd)?.trim() === viewingGroup)
                  .map((p, idx) => {
                    const gender = getGender(p);
                    return (
                      <div
                        key={p.id}
                        className="py-3 flex items-center justify-between gap-3 text-xs"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-slate-400 w-5 text-center font-mono">{idx + 1}</span>
                          <div>
                            <div className="font-semibold text-slate-900">{p.nama}</div>
                            <div className="text-[11px] text-slate-500">
                              Kelompok: {p.kelompok || "-"} | Dapukan: {p.dapukan || "Peserta"}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              gender === "L"
                                ? "bg-blue-50 text-blue-600"
                                : "bg-emerald-50 text-emerald-600"
                            }`}
                          >
                            {gender === "L" ? "Laki-laki" : "Perempuan"}
                          </span>

                          <button
                            onClick={() => {
                              setMutasiTargetPeserta(p);
                              setShowMutasiModal(true);
                            }}
                            className="px-2.5 py-1 text-blue-600 hover:bg-blue-50 rounded-lg text-xs font-semibold border border-blue-200 transition-colors"
                          >
                            Mutasi
                          </button>

                          <button
                            onClick={() => executeMutasi([p.id], "-")}
                            disabled={updating}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg border border-slate-200 transition-colors"
                            title="Keluarkan dari grup"
                          >
                            <UserX className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs">
              <button
                onClick={() => {
                  setViewingGroup(null);
                  setActiveTab("belum_terdaftar");
                }}
                className="text-[#203598] font-bold hover:underline"
              >
                + Tambah Anggota dari Peserta Belum Terdaftar
              </button>

              <button
                onClick={() => setViewingGroup(null)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl font-semibold transition-colors"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: MUTASI / PLOTTING (Exact Video Design & Responsive) ================= */}
      {showMutasiModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-lg w-full p-5 sm:p-6 shadow-2xl border border-slate-200 space-y-4 sm:space-y-5 animate-in zoom-in-95 duration-150 my-auto max-h-[92vh] flex flex-col justify-between overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-extrabold text-slate-900 text-lg tracking-tight">
                  Masukkan Santri ke {labelName}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Masukkan santri baru ke {labelName.toLowerCase()}
                </p>
              </div>
              <button
                onClick={() => {
                  setShowMutasiModal(false);
                  setMutasiTargetPeserta(null);
                  setMutasiDropdownOpen(false);
                  setMutasiDropdownSearch("");
                }}
                className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              {/* Card 1: Informasi Santri */}
              <div className="border border-slate-200/90 rounded-xl p-4 bg-slate-50/40 space-y-3">
                <h4 className="font-bold text-slate-800 text-xs">Informasi Santri</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-600 font-medium mb-1 text-[11px]">
                      Nama Santri
                    </label>
                    <input
                      type="text"
                      readOnly
                      value={
                        mutasiTargetPeserta?.nama ||
                        (selectedIds.length > 1
                          ? `${selectedIds.length} Santri Terpilih`
                          : "-")
                      }
                      className="w-full px-3 py-2 bg-slate-100/80 border border-slate-200 rounded-lg text-slate-800 font-medium cursor-not-allowed select-none text-xs focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-600 font-medium mb-1 text-[11px]">
                      {labelName} Saat Ini
                    </label>
                    <input
                      type="text"
                      readOnly
                      value={
                        mutasiTargetPeserta
                          ? (isTenda
                              ? mutasiTargetPeserta.tenda
                              : mutasiTargetPeserta.grup_fgd) || "Belum masuk kelas"
                          : "Belum masuk kelas"
                      }
                      className="w-full px-3 py-2 bg-slate-100/80 border border-slate-200 rounded-lg text-slate-600 cursor-not-allowed select-none text-xs focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Card 2: Mutasi & Destination Select */}
              <div className="border border-slate-200/90 rounded-xl p-4 bg-white space-y-3">
                <h4 className="font-bold text-slate-800 text-xs">Mutasi</h4>

                <div>
                  <label className="block text-slate-700 font-medium mb-1.5 text-xs">
                    {labelName} Tujuan<span className="text-rose-500 ml-0.5">*</span>
                  </label>

                  {/* Dropdown Selector Button */}
                  <div
                    onClick={() => setMutasiDropdownOpen(!mutasiDropdownOpen)}
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl flex items-center justify-between cursor-pointer hover:border-slate-400 transition-colors shadow-2xs"
                  >
                    <span
                      className={`text-xs ${
                        targetGroupForMutasi || customNewGroupName
                          ? "font-semibold text-[#203598]"
                          : "text-slate-400"
                      }`}
                    >
                      {customNewGroupName ||
                        targetGroupForMutasi ||
                        "Pilih salah satu opsi"}
                    </span>

                    <div className="flex items-center gap-1.5 text-slate-400">
                      {(targetGroupForMutasi || customNewGroupName) && (
                        <span
                          onClick={(e) => {
                            e.stopPropagation();
                            setTargetGroupForMutasi("");
                            setCustomNewGroupName("");
                          }}
                          className="p-0.5 hover:text-slate-600 hover:bg-slate-100 rounded"
                          title="Hapus pilihan"
                        >
                          <X className="w-3.5 h-3.5" />
                        </span>
                      )}
                      <ChevronDown
                        className={`w-4 h-4 transition-transform duration-200 ${
                          mutasiDropdownOpen ? "rotate-180 text-[#203598]" : ""
                        }`}
                      />
                    </div>
                  </div>

                  {/* Helper Text */}
                  <p className="text-[11px] text-slate-400 mt-1">
                    Pilih {labelName.toLowerCase()} tujuan untuk santri
                  </p>

                  {/* Expandable Options Container */}
                  {mutasiDropdownOpen && (
                    <div className="mt-2 border border-slate-200 rounded-xl bg-slate-50/60 p-2.5 space-y-2 animate-in fade-in duration-100">
                      {/* Search in Dropdown */}
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          value={mutasiDropdownSearch}
                          onChange={(e) => setMutasiDropdownSearch(e.target.value)}
                          placeholder="Ketik untuk mencari opsi..."
                          className="w-full pl-8 pr-7 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-[#203598] focus:ring-1 focus:ring-[#203598] text-slate-800"
                          autoFocus
                        />
                        {mutasiDropdownSearch && (
                          <button
                            type="button"
                            onClick={() => setMutasiDropdownSearch("")}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </div>

                      {/* Options List with comfortable scrolling and bottom breathing room */}
                      <div className="max-h-48 overflow-y-auto space-y-1 pr-1 pb-2">
                        {existingGroups
                          .filter((grp) =>
                            grp
                              .toLowerCase()
                              .includes(mutasiDropdownSearch.toLowerCase())
                          )
                          .map((grp) => {
                            const isSelected = targetGroupForMutasi === grp;
                            return (
                              <button
                                key={grp}
                                type="button"
                                onClick={() => {
                                  setTargetGroupForMutasi(grp);
                                  setCustomNewGroupName("");
                                  setMutasiDropdownOpen(false);
                                  setMutasiDropdownSearch("");
                                }}
                                className={`w-full px-3 py-2 rounded-lg flex items-center justify-between text-xs text-left cursor-pointer transition-all border ${
                                  isSelected
                                    ? "bg-blue-50 text-[#203598] font-bold border-blue-200 shadow-2xs"
                                    : "bg-white text-slate-700 hover:bg-slate-100/80 border-slate-200/80"
                                }`}
                              >
                                <span>{grp}</span>
                                {isSelected ? (
                                  <Check className="w-3.5 h-3.5 text-[#203598]" />
                                ) : null}
                              </button>
                            );
                          })}

                        {/* Add Custom New Group if search doesn't match */}
                        {mutasiDropdownSearch.trim() &&
                          !existingGroups.some(
                            (g) =>
                              g.toLowerCase() ===
                              mutasiDropdownSearch.trim().toLowerCase()
                          ) && (
                            <button
                              type="button"
                              onClick={() => {
                                setCustomNewGroupName(mutasiDropdownSearch.trim());
                                setTargetGroupForMutasi("");
                                setMutasiDropdownOpen(false);
                                setMutasiDropdownSearch("");
                              }}
                              className="w-full px-3 py-2 rounded-lg flex items-center gap-2 text-xs text-[#203598] font-semibold bg-blue-50 hover:bg-blue-100/70 border border-blue-200 transition-colors text-left"
                            >
                              <Plus className="w-3.5 h-3.5 shrink-0" />
                              <span>
                                Buat & pilih {labelName} &quot;{mutasiDropdownSearch.trim()}&quot;
                              </span>
                            </button>
                          )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Modal Footer Actions */}
            <div className="flex items-center gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  const finalDest =
                    customNewGroupName.trim() || targetGroupForMutasi.trim();
                  if (!finalDest) {
                    showToast(
                      "error",
                      `Silakan pilih atau masukkan nama ${labelName} tujuan.`
                    );
                    return;
                  }
                  const idsToMove = mutasiTargetPeserta
                    ? [mutasiTargetPeserta.id]
                    : selectedIds;
                  executeMutasi(idsToMove, finalDest);
                }}
                disabled={
                  updating || (!targetGroupForMutasi && !customNewGroupName.trim())
                }
                className="px-5 py-2.5 bg-[#203598] hover:bg-[#182978] text-white text-xs font-bold rounded-xl transition-all flex items-center gap-2 shadow-xs disabled:opacity-50 active:scale-95"
              >
                {updating ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Memproses...</span>
                  </>
                ) : (
                  <span>Kirim</span>
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowMutasiModal(false);
                  setMutasiTargetPeserta(null);
                  setTargetGroupForMutasi("");
                  setCustomNewGroupName("");
                  setMutasiDropdownOpen(false);
                  setMutasiDropdownSearch("");
                }}
                disabled={updating}
                className="px-5 py-2.5 bg-white hover:bg-slate-50 text-slate-600 text-xs font-semibold rounded-xl border border-slate-200 transition-colors"
              >
                Batal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: ADD NEW GROUP ================= */}
      {showAddGroupModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                <Plus className="w-4 h-4 text-[#203598]" />
                Tambah {labelName} Baru
              </h3>
              <button
                onClick={() => setShowAddGroupModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1.5">
                  Nama {labelName}<span className="text-rose-500 ml-0.5">*</span>
                </label>
                <input
                  type="text"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  placeholder={`Contoh: ${isTenda ? "Tenda 01" : "Pegon SMP"}`}
                  className="w-full px-3.5 py-2 bg-white border border-slate-300 rounded-xl focus:outline-none focus:border-[#203598]"
                  autoFocus
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1.5">
                  Ketua {labelName} (Opsional)
                </label>
                <input
                  type="text"
                  value={newGroupKetua}
                  onChange={(e) => setNewGroupKetua(e.target.value)}
                  placeholder="Nama ketua / koordinator"
                  className="w-full px-3.5 py-2 bg-white border border-slate-300 rounded-xl focus:outline-none focus:border-[#203598]"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => {
                  setShowAddGroupModal(false);
                  setNewGroupName("");
                  setNewGroupKetua("");
                }}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleAddNewGroup}
                disabled={!newGroupName.trim()}
                className="px-4 py-2 bg-[#203598] hover:bg-[#182978] text-white text-xs font-bold rounded-xl transition-all shadow-xs disabled:opacity-50"
              >
                Buat {labelName}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: EDIT GROUP ================= */}
      {editingGroup && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-blue-600" />
                Ubah Data {labelName}
              </h3>
              <button
                onClick={() => setEditingGroup(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1.5">
                  Nama {labelName}<span className="text-rose-500 ml-0.5">*</span>
                </label>
                <input
                  type="text"
                  value={editGroupNameInput}
                  onChange={(e) => setEditGroupNameInput(e.target.value)}
                  className="w-full px-3.5 py-2 bg-white border border-slate-300 rounded-xl focus:outline-none focus:border-[#203598]"
                  autoFocus
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1.5">
                  Ketua {labelName} (Opsional)
                </label>
                <input
                  type="text"
                  value={editGroupKetuaInput}
                  onChange={(e) => setEditGroupKetuaInput(e.target.value)}
                  placeholder="Nama ketua / koordinator"
                  className="w-full px-3.5 py-2 bg-white border border-slate-300 rounded-xl focus:outline-none focus:border-[#203598]"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setEditingGroup(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleRenameGroup}
                disabled={updating || !editGroupNameInput.trim()}
                className="px-4 py-2 bg-[#203598] hover:bg-[#182978] text-white text-xs font-bold rounded-xl transition-all shadow-xs disabled:opacity-50"
              >
                {updating ? "Menyimpan..." : "Simpan Perubahan"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: AUTO DISTRIBUTE ================= */}
      {showAutoDistributeModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center gap-3 border-b pb-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-900 flex items-center justify-center shrink-0">
                <Sparkles className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-base">
                  Bagi Rata Otomatis ke {labelName}
                </h3>
                <p className="text-xs text-slate-500">
                  {stats.unassignedCount} peserta yang belum terdaftar akan dibagi secara rata.
                </p>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <div className="text-slate-700 font-semibold">
                Pilih {labelName} yang akan menerima alokasi peserta:
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-56 overflow-y-auto p-2 bg-slate-50 rounded-xl border border-slate-200">
                {existingGroups.map((grp) => {
                  const isChecked = distributeTargetGroups.includes(grp);
                  return (
                    <button
                      key={grp}
                      type="button"
                      onClick={() => {
                        setDistributeTargetGroups((prev) =>
                          isChecked ? prev.filter((g) => g !== grp) : [...prev, grp]
                        );
                      }}
                      className={`p-2 rounded-xl text-left text-xs font-semibold flex items-center justify-between gap-1 transition-all border ${
                        isChecked
                          ? "bg-blue-600 text-white border-blue-700 shadow-2xs"
                          : "bg-white text-slate-700 border-slate-200 hover:bg-slate-100"
                      }`}
                    >
                      <span className="truncate">{grp}</span>
                      {isChecked && <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />}
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>{distributeTargetGroups.length} grup dipilih</span>
                <button
                  type="button"
                  onClick={() => setDistributeTargetGroups(existingGroups)}
                  className="text-[#203598] font-bold hover:underline"
                >
                  Pilih Semua Grup
                </button>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setShowAutoDistributeModal(false)}
                disabled={updating}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleExecuteAutoDistribute}
                disabled={
                  updating ||
                  distributeTargetGroups.length === 0 ||
                  stats.unassignedCount === 0
                }
                className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 shadow-xs disabled:opacity-50"
              >
                {updating ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Membagi...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    Mulai Bagi Rata
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
