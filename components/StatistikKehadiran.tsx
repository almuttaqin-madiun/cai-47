"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  PieChart as PieChartIcon,
  Users,
  CheckCircle2,
  XCircle,
  Calendar,
  Clock,
  Filter,
  RefreshCw,
  Search,
  Download,
  Building2,
  Layers,
  ArrowUpDown,
  BookOpen,
  Utensils,
  Moon,
  Sparkles,
  TrendingUp,
  Percent,
  Check,
  ChevronRight,
  Info,
  UserX,
  UserCheck
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { exportDataToExcel } from "@/lib/excelExport";
import { hexToDecimal, toTitleCase } from "@/lib/utils";
import { SesiAbsensi } from "./ManajemenSesi";

interface Peserta {
  id: number | string;
  nama: string;
  kelompok?: string;
  dapukan?: string;
  tenda?: string;
  grup?: string;
  grup_fgd?: string;
  jenis_kelamin?: string;
  nfc_uid?: string;
  serial_number?: string;
}

interface RawAttendance {
  id: number | string;
  serial_number: string;
  nama_peserta?: string;
  nama?: string;
  sesi_nama?: string;
  jadwal?: string;
  kategori?: string;
  timestamp: string | Date;
  kelompok?: string;
  tenda?: string;
  grup?: string;
  grup_fgd?: string;
  jenis_kelamin?: string;
  status_kehadiran?: string;
  menit_terlambat?: number;
  waktu_telat?: string;
}

interface SessionAttendanceStat {
  sessionKey: string;
  sessionName: string;
  kategori: "materi" | "makan" | "sholat" | "umum" | string;
  tanggal: string;
  jamMulai?: string;
  jamSelesai?: string;
  isActive?: boolean;
  isOngoing?: boolean;
  totalPeserta: number;
  hadirCount: number;
  tepatWaktuCount: number;
  terlambatCount: number;
  belumHadirCount: number;
  persentaseHadir: number;
  persentaseTepatWaktu: number;
  persentaseTerlambat: number;
  persentaseBelumHadir: number;
  hadirLakiLaki: number;
  hadirPerempuan: number;
  hadirUids: Set<string>;
  hadirNames: Set<string>;
  earliestTime?: Date;
  latestTime?: Date;
}

// -------------------------------------------------------------
// Interactive Modern SVG Donut Chart Component
// -------------------------------------------------------------
export const DONUT_COLORS = {
  blue: "#859BCA",   // Top-Right / Periwinkle Blue
  coral: "#FF8C66",  // Bottom / Warm Coral Orange
  mint: "#59BA9B",   // Top-Left / Mint Teal Green
  purple: "#9b85ca",
  slate: "#94a3b8",
};

export interface DonutSliceItem {
  id: string;
  label: string;
  value: number;
  color: string;
  percentage?: number;
  sublabel?: string;
}

interface DonutChartProps {
  slices?: DonutSliceItem[];
  hadirCount?: number;
  belumHadirCount?: number;
  tepatWaktuCount?: number;
  terlambatCount?: number;
  total?: number;
  size?: number;
  showDetails?: boolean;
  animate?: boolean;
  title?: string;
  activeMode?: "status3" | "kehadiran2" | "gender3";
}

function formatSlicePct(val: number): string {
  if (val <= 0) return "0%";
  const formatted = val.toFixed(1);
  return formatted.endsWith(".0") ? `${Math.round(val)}%` : `${formatted}%`;
}

// Math helper for drawing SVG Donut Arcs (Annulus Sectors)
function getDonutArc(
  cx: number,
  cy: number,
  rInner: number,
  rOuter: number,
  startAngle: number,
  endAngle: number
) {
  const diff = endAngle - startAngle;
  // Full 360 degree circle edge case
  if (diff >= 2 * Math.PI - 0.0001) {
    const rMid = (rInner + rOuter) / 2;
    return {
      path: `
        M ${cx} ${cy - rOuter}
        A ${rOuter} ${rOuter} 0 1 1 ${cx} ${cy + rOuter}
        A ${rOuter} ${rOuter} 0 1 1 ${cx} ${cy - rOuter}
        M ${cx} ${cy - rInner}
        A ${rInner} ${rInner} 0 1 0 ${cx} ${cy + rInner}
        A ${rInner} ${rInner} 0 1 0 ${cx} ${cy - rInner}
        Z
      `,
      textX: cx,
      textY: cy - rMid,
      midAngle: startAngle + Math.PI,
    };
  }

  const xO1 = cx + rOuter * Math.cos(startAngle);
  const yO1 = cy + rOuter * Math.sin(startAngle);
  const xO2 = cx + rOuter * Math.cos(endAngle);
  const yO2 = cy + rOuter * Math.sin(endAngle);

  const xI2 = cx + rInner * Math.cos(endAngle);
  const yI2 = cy + rInner * Math.sin(endAngle);
  const xI1 = cx + rInner * Math.cos(startAngle);
  const yI1 = cy + rInner * Math.sin(startAngle);

  const largeArc = diff > Math.PI ? 1 : 0;

  const path = [
    `M ${xO1} ${yO1}`,
    `A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${xO2} ${yO2}`,
    `L ${xI2} ${yI2}`,
    `A ${rInner} ${rInner} 0 ${largeArc} 0 ${xI1} ${yI1}`,
    "Z",
  ].join(" ");

  const midAngle = (startAngle + endAngle) / 2;
  const rMid = (rInner + rOuter) / 2;
  const textX = cx + rMid * Math.cos(midAngle);
  const textY = cy + rMid * Math.sin(midAngle);

  return { path, textX, textY, midAngle };
}

function ModernDonutChart({
  slices: customSlices,
  hadirCount = 0,
  belumHadirCount = 0,
  tepatWaktuCount = 0,
  terlambatCount = 0,
  total = 0,
  size = 280,
  showDetails = true,
  animate = true,
  activeMode = "status3",
}: DonutChartProps) {
  const [hoveredSliceId, setHoveredSliceId] = useState<string | null>(null);

  // Construct chart slices
  const slices = useMemo<DonutSliceItem[]>(() => {
    if (customSlices && customSlices.length > 0) {
      const sum = customSlices.reduce((acc, s) => acc + s.value, 0) || total || 1;
      return customSlices.map((s) => ({
        ...s,
        percentage: sum > 0 ? (s.value / sum) * 100 : 0,
      }));
    }

    const calcTotal = total > 0 ? total : Math.max(1, hadirCount + belumHadirCount);

    if (activeMode === "status3") {
      // If there are recorded late participants or default 3-segment mode
      const tepat = tepatWaktuCount > 0 ? tepatWaktuCount : Math.max(0, hadirCount - terlambatCount);
      const telat = terlambatCount;
      const belum = belumHadirCount;

      return [
        {
          id: "belum",
          label: "Belum Hadir",
          value: belum,
          color: DONUT_COLORS.blue,
          percentage: (belum / calcTotal) * 100,
          sublabel: "Perlu tap kartu NFC",
        },
        {
          id: "terlambat",
          label: "Terlambat",
          value: telat,
          color: DONUT_COLORS.coral,
          percentage: (telat / calcTotal) * 100,
          sublabel: "Melewati batas toleransi",
        },
        {
          id: "tepat",
          label: "Tepat Waktu",
          value: tepat,
          color: DONUT_COLORS.mint,
          percentage: (tepat / calcTotal) * 100,
          sublabel: "Hadir sebelum batas telat",
        },
      ];
    } else {
      // 2-segment mode (Hadir vs Belum Hadir)
      return [
        {
          id: "hadir",
          label: "Sudah Hadir",
          value: hadirCount,
          color: DONUT_COLORS.mint,
          percentage: (hadirCount / calcTotal) * 100,
          sublabel: "Total peserta yang sudah hadir",
        },
        {
          id: "belum",
          label: "Belum Hadir",
          value: belumHadirCount,
          color: DONUT_COLORS.coral,
          percentage: (belumHadirCount / calcTotal) * 100,
          sublabel: "Belum melakukan presensi",
        },
      ];
    }
  }, [
    customSlices,
    hadirCount,
    belumHadirCount,
    tepatWaktuCount,
    terlambatCount,
    total,
    activeMode,
  ]);

  const totalValue = useMemo(() => {
    return slices.reduce((acc, s) => acc + s.value, 0) || 1;
  }, [slices]);

  // Geometry calculations
  const cx = size / 2;
  const cy = size / 2;
  const rOuter = size * 0.46;
  const rInner = size * 0.24; // clean donut hole ratio (~52% thickness)

  // Calculate arc sectors
  const arcSlices = useMemo(() => {
    let currentAngle = -Math.PI / 2; // Start at 12 o'clock (top)

    return slices.map((slice) => {
      const angleSpan = (slice.value / totalValue) * 2 * Math.PI;
      const startAngle = currentAngle;
      const endAngle = currentAngle + angleSpan;
      currentAngle = endAngle;

      const arc = getDonutArc(cx, cy, rInner, rOuter, startAngle, endAngle);
      return {
        ...slice,
        startAngle,
        endAngle,
        angleSpan,
        ...arc,
      };
    });
  }, [slices, totalValue, cx, cy, rInner, rOuter]);

  const activeSlice = slices.find((s) => s.id === hoveredSliceId) || null;

  return (
    <div className="flex flex-col items-center justify-center relative w-full">
      {/* SVG Donut Graphic */}
      <div
        className="relative flex items-center justify-center select-none"
        style={{ width: size, height: size }}
      >
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="overflow-visible"
        >
          <defs>
            <filter id="donutSliceGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="2" stdDeviation="4" floodOpacity="0.2" />
            </filter>
          </defs>

          {/* Empty Background Ring if 0 total */}
          {totalValue <= 0 && (
            <circle
              cx={cx}
              cy={cy}
              r={(rInner + rOuter) / 2}
              fill="none"
              stroke="#e2e8f0"
              strokeWidth={rOuter - rInner}
            />
          )}

          {/* Arc Slices */}
          {arcSlices.map((slice) => {
            if (slice.value <= 0) return null;
            const isHovered = hoveredSliceId === slice.id;

            return (
              <g
                key={slice.id}
                className="cursor-pointer transition-all duration-300"
                onMouseEnter={() => setHoveredSliceId(slice.id)}
                onMouseLeave={() => setHoveredSliceId(null)}
              >
                {/* Donut Path Segment */}
                <path
                  d={slice.path}
                  fill={slice.color}
                  stroke="#ffffff"
                  strokeWidth={2}
                  filter={isHovered ? "url(#donutSliceGlow)" : undefined}
                  className="transition-all duration-300 hover:opacity-95"
                  style={{
                    transformOrigin: `${cx}px ${cy}px`,
                    transform: isHovered ? "scale(1.025)" : "scale(1)",
                  }}
                />

                {/* Percentage Text on Slice (Rendered in Bold White) */}
                {(slice.percentage ?? 0) >= 3.5 && (
                  <text
                    x={slice.textX}
                    y={slice.textY}
                    fill="#ffffff"
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={size >= 240 ? 14 : size >= 140 ? 11 : 9}
                    fontWeight="700"
                    className="font-sans select-none pointer-events-none drop-shadow-xs"
                    style={{
                      transformOrigin: `${cx}px ${cy}px`,
                      transform: isHovered ? "scale(1.04)" : "scale(1)",
                    }}
                  >
                    {formatSlicePct(slice.percentage ?? 0)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        {/* Center Donut Hole Info */}
        <div
          className="absolute flex flex-col items-center justify-center text-center pointer-events-none p-2"
          style={{
            width: rInner * 2 - 8,
            height: rInner * 2 - 8,
            borderRadius: "50%",
          }}
        >
          {activeSlice ? (
            <div className="animate-in fade-in zoom-in-95 duration-200">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block line-clamp-1">
                {activeSlice.label}
              </span>
              <div className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight leading-none my-0.5">
                {formatSlicePct(activeSlice.percentage ?? 0)}
              </div>
              <span className="text-[11px] font-bold text-slate-600 block">
                {activeSlice.value} Peserta
              </span>
            </div>
          ) : (
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                Total
              </span>
              <div className="text-xl sm:text-2xl font-black text-slate-800 tracking-tight leading-none my-0.5">
                {totalValue}
              </div>
              <span className="text-[11px] font-semibold text-slate-500 block">
                Peserta
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Modern Legend Chips Matching Palette */}
      {showDetails && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 w-full mt-4">
          {slices.map((slice) => {
            const isHovered = hoveredSliceId === slice.id;
            return (
              <div
                key={slice.id}
                onMouseEnter={() => setHoveredSliceId(slice.id)}
                onMouseLeave={() => setHoveredSliceId(null)}
                className={`p-3 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between ${
                  isHovered
                    ? "bg-slate-50 border-slate-400 ring-2 ring-slate-300 shadow-xs scale-[1.02]"
                    : "bg-white border-slate-200/80 hover:bg-slate-50/70 shadow-2xs"
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className="w-3 h-3 rounded-full shrink-0 shadow-xs ring-2 ring-white"
                    style={{ backgroundColor: slice.color }}
                  />
                  <span className="text-xs font-bold text-slate-700 truncate">
                    {slice.label}
                  </span>
                </div>
                <div className="flex items-baseline justify-between mt-1">
                  <span className="text-base font-extrabold text-slate-900">
                    {slice.value}{" "}
                    <span className="text-[11px] font-normal text-slate-500">org</span>
                  </span>
                  <span
                    className="text-xs font-extrabold px-2 py-0.5 rounded-md text-white shadow-2xs"
                    style={{ backgroundColor: slice.color }}
                  >
                    {formatSlicePct(slice.percentage ?? 0)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// -------------------------------------------------------------
// Main Component: StatistikKehadiran
// -------------------------------------------------------------
interface StatistikKehadiranProps {
  embedded?: boolean;
  defaultSessionName?: string;
}

export default function StatistikKehadiran({ embedded = false, defaultSessionName }: StatistikKehadiranProps = {}) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Raw Database Data
  const [pesertaList, setPesertaList] = useState<Peserta[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<RawAttendance[]>([]);
  const [sessionList, setSessionList] = useState<SesiAbsensi[]>([]);

  // Filter States
  const [selectedKategori, setSelectedKategori] = useState<string>("SEMUA");
  const [selectedTanggal, setSelectedTanggal] = useState<string>("SEMUA");
  const [selectedSessionKey, setSelectedSessionKey] = useState<string>("");
  const [selectedKelompokFilter, setSelectedKelompokFilter] = useState<string>("SEMUA");
  const [searchPeserta, setSearchPeserta] = useState<string>("");
  const [activeListTab, setActiveListTab] = useState<"semua" | "hadir" | "belum">("hadir");
  const [donutMode, setDonutMode] = useState<"status3" | "kehadiran2" | "gender3">("status3");

  // Load all required data from Supabase
  const loadData = useCallback(async () => {
    try {
      const [resPeserta, resNfc, resRiwayat, resKehadiran, resJadwal, resSesi] = await Promise.all([
        supabase.from("peserta").select("*"),
        supabase.from("nfc_peserta").select("*"),
        supabase.from("riwayat_absen").select("*").order("timestamp", { ascending: false }),
        supabase.from("kehadiran").select("*").order("timestamp", { ascending: false }),
        supabase.from("jadwal_absensi").select("*").order("tanggal", { ascending: true }),
        supabase.from("sesi_absensi").select("*").order("tanggal", { ascending: true }),
      ]);

      // 1. Process Master Peserta & merge with NFC smartcard info
      const nfcMap = new Map<string, string>();
      if (resNfc.data) {
        for (const n of resNfc.data) {
          if (n.nfc_uid && (n.nama || n.nama_peserta)) {
            nfcMap.set((n.nama || n.nama_peserta).trim().toLowerCase(), n.nfc_uid);
          }
        }
      }

      const pList: Peserta[] = (resPeserta.data || []).map((p: any) => {
        const rawName = p.nama || p.nama_peserta || "-";
        const rawKel = p.kelompok || "-";
        const rawDap = p.dapukan || "-";
        const rawTen = p.tenda || p.grup || "-";
        const rawFgd = p.grup_fgd || "-";

        return {
          id: p.id,
          nama: rawName !== "-" ? toTitleCase(rawName) : "-",
          kelompok: rawKel !== "-" ? toTitleCase(rawKel) : "-",
          dapukan: rawDap !== "-" ? toTitleCase(rawDap) : "-",
          tenda: rawTen !== "-" ? toTitleCase(rawTen) : "-",
          grup: rawTen !== "-" ? toTitleCase(rawTen) : "-",
          grup_fgd: rawFgd !== "-" ? toTitleCase(rawFgd) : "-",
          jenis_kelamin: p.jenis_kelamin || (rawName.toLowerCase().includes("binti") ? "P" : "L"),
          nfc_uid: p.nfc_uid || p.serial_number || nfcMap.get(rawName.trim().toLowerCase()) || "",
        };
      });
      setPesertaList(pList);

      // 2. Process Sessions
      const rawSessions: SesiAbsensi[] = [];
      if (resJadwal.data) rawSessions.push(...resJadwal.data);
      if (resSesi.data) {
        for (const s of resSesi.data) {
          if (!rawSessions.some((r) => r.id === s.id && r.nama_sesi === s.nama_sesi)) {
            rawSessions.push(s);
          }
        }
      }

      // Check localStorage for offline/cached sessions if empty
      if (rawSessions.length === 0 && typeof window !== "undefined") {
        const local = localStorage.getItem("cai_sesi_absensi");
        if (local) {
          try {
            rawSessions.push(...JSON.parse(local));
          } catch (e) {}
        }
      }

      setSessionList(rawSessions);

      // 3. Process Attendance Records
      const mergedRecords: RawAttendance[] = [];
      const seenMap = new Set<string>();

      const addRecord = (item: any) => {
        const uid = hexToDecimal(String(item.serial_number || "").trim(), true);
        const rawName = (item.nama_peserta || item.nama || "").trim();
        const rawSesi = (item.sesi_nama || "Umum").trim();
        const rawKel = item.kelompok || "-";
        const rawTen = item.tenda || item.grup || "-";
        const rawFgd = item.grup_fgd || "-";

        const name = rawName ? toTitleCase(rawName) : "Peserta NFC";
        const sesi = rawSesi ? toTitleCase(rawSesi) : "Umum";
        const key = `${uid}_${sesi}_${item.timestamp ? new Date(item.timestamp).toISOString().split("T")[0] : ""}`;

        const isLate = item.status_kehadiran === "Terlambat" || Number(item.menit_terlambat || 0) > 0;

        if (!seenMap.has(key)) {
          seenMap.add(key);
          mergedRecords.push({
            id: item.id,
            serial_number: uid,
            nama: name,
            nama_peserta: name,
            sesi_nama: sesi,
            jadwal: item.jadwal || item.kategori || "materi",
            kategori: item.kategori || item.jadwal || "materi",
            timestamp: item.timestamp || new Date(),
            kelompok: rawKel !== "-" ? toTitleCase(rawKel) : "-",
            tenda: rawTen !== "-" ? toTitleCase(rawTen) : "-",
            grup: rawTen !== "-" ? toTitleCase(rawTen) : "-",
            grup_fgd: rawFgd !== "-" ? toTitleCase(rawFgd) : "-",
            jenis_kelamin: item.jenis_kelamin,
            status_kehadiran: isLate ? "Terlambat" : (item.status_kehadiran || "Tepat Waktu"),
            menit_terlambat: Number(item.menit_terlambat || 0),
            waktu_telat: item.waktu_telat || "",
          });
        }
      };

      if (resRiwayat.data) resRiwayat.data.forEach(addRecord);
      if (resKehadiran.data) resKehadiran.data.forEach(addRecord);

      setAttendanceRecords(mergedRecords);
    } catch (error) {
      console.error("Error loading statistik kehadiran data:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    // Auto-polling every 10 seconds for real-time live attendance stats
    const interval = setInterval(loadData, 10000);
    return () => clearInterval(interval);
  }, [loadData]);

  const handleManualRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  // -------------------------------------------------------------
  // Process Statistics per Session
  // -------------------------------------------------------------
  const totalRegisteredPeserta = pesertaList.length;

  const distinctDates = useMemo(() => {
    const dSet = new Set<string>();
    sessionList.forEach((s) => s.tanggal && dSet.add(s.tanggal));
    attendanceRecords.forEach((a) => {
      if (a.timestamp) {
        try {
          const dStr = new Date(a.timestamp).toISOString().split("T")[0];
          dSet.add(dStr);
        } catch (e) {}
      }
    });
    return Array.from(dSet).sort();
  }, [sessionList, attendanceRecords]);

  const distinctKelompok = useMemo(() => {
    const kSet = new Set<string>();
    pesertaList.forEach((p) => p.kelompok && p.kelompok !== "-" && kSet.add(p.kelompok));
    return Array.from(kSet).sort();
  }, [pesertaList]);

  // Generate complete session statistic cards
  const sessionStats = useMemo<SessionAttendanceStat[]>(() => {
    const statsMap = new Map<string, SessionAttendanceStat>();
    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    // 1. Initialize from registered sessions in jadwal / sesi
    sessionList.forEach((s) => {
      const sKey = `${s.nama_sesi}__${s.tanggal}`;
      let isOngoing = false;

      if (s.is_active && s.tanggal === todayStr && s.jam_mulai && s.jam_selesai) {
        const [sh, sm] = s.jam_mulai.split(":").map(Number);
        const [eh, em] = s.jam_selesai.split(":").map(Number);
        const startM = sh * 60 + sm;
        const endM = eh * 60 + em;
        isOngoing = currentMinutes >= startM && currentMinutes <= endM;
      }

      statsMap.set(sKey, {
        sessionKey: sKey,
        sessionName: s.nama_sesi,
        kategori: s.kategori || s.jadwal || "materi",
        tanggal: s.tanggal,
        jamMulai: s.jam_mulai,
        jamSelesai: s.jam_selesai,
        isActive: s.is_active,
        isOngoing,
        totalPeserta: totalRegisteredPeserta,
        hadirCount: 0,
        tepatWaktuCount: 0,
        terlambatCount: 0,
        belumHadirCount: totalRegisteredPeserta,
        persentaseHadir: 0,
        persentaseTepatWaktu: 0,
        persentaseTerlambat: 0,
        persentaseBelumHadir: 100,
        hadirLakiLaki: 0,
        hadirPerempuan: 0,
        hadirUids: new Set<string>(),
        hadirNames: new Set<string>(),
      });
    });

    // 2. Also register any sessions found from attendance records if not already in list
    attendanceRecords.forEach((a) => {
      const aDate = a.timestamp ? new Date(a.timestamp).toISOString().split("T")[0] : todayStr;
      const sKey = `${a.sesi_nama || "Umum"}__${aDate}`;
      if (!statsMap.has(sKey)) {
        let detectedKategori = a.kategori || a.jadwal || "materi";
        const lower = (a.sesi_nama || "").toLowerCase();
        if (lower.includes("makan") || lower.includes("sarapan") || lower.includes("konsumsi")) {
          detectedKategori = "makan";
        } else if (lower.includes("sholat") || lower.includes("subuh") || lower.includes("dzuhur") || lower.includes("ashar") || lower.includes("maghrib") || lower.includes("isya")) {
          detectedKategori = "sholat";
        }

        statsMap.set(sKey, {
          sessionKey: sKey,
          sessionName: a.sesi_nama || "Umum",
          kategori: detectedKategori,
          tanggal: aDate,
          totalPeserta: totalRegisteredPeserta,
          hadirCount: 0,
          tepatWaktuCount: 0,
          terlambatCount: 0,
          belumHadirCount: totalRegisteredPeserta,
          persentaseHadir: 0,
          persentaseTepatWaktu: 0,
          persentaseTerlambat: 0,
          persentaseBelumHadir: 100,
          hadirLakiLaki: 0,
          hadirPerempuan: 0,
          hadirUids: new Set<string>(),
          hadirNames: new Set<string>(),
        });
      }
    });

    // 3. Aggregate presence for each session
    attendanceRecords.forEach((a) => {
      const aDate = a.timestamp ? new Date(a.timestamp).toISOString().split("T")[0] : todayStr;
      const sKey = `${a.sesi_nama || "Umum"}__${aDate}`;
      const stat = statsMap.get(sKey);
      if (!stat) return;

      const uid = (a.serial_number || "").trim();
      const nama = (a.nama_peserta || a.nama || "").trim().toLowerCase();

      // Check if already counted
      const isAlreadyCounted = (uid && stat.hadirUids.has(uid)) || (nama && stat.hadirNames.has(nama));
      if (!isAlreadyCounted) {
        if (uid) stat.hadirUids.add(uid);
        if (nama) stat.hadirNames.add(nama);

        if (a.status_kehadiran === "Terlambat") {
          stat.terlambatCount += 1;
        } else {
          stat.tepatWaktuCount += 1;
        }

        // Find participant gender
        const matchedPeserta = pesertaList.find(
          (p) =>
            (uid && p.nfc_uid && (p.nfc_uid === uid || hexToDecimal(p.nfc_uid, true) === uid)) ||
            (nama && p.nama && p.nama.trim().toLowerCase() === nama)
        );

        const gender = matchedPeserta?.jenis_kelamin || a.jenis_kelamin || "L";
        if (gender === "P") {
          stat.hadirPerempuan += 1;
        } else {
          stat.hadirLakiLaki += 1;
        }

        // Track timestamp bounds
        const recTime = a.timestamp ? new Date(a.timestamp) : undefined;
        if (recTime) {
          if (!stat.earliestTime || recTime < stat.earliestTime) {
            stat.earliestTime = recTime;
          }
          if (!stat.latestTime || recTime > stat.latestTime) {
            stat.latestTime = recTime;
          }
        }
      }
    });

    // 4. Calculate final percentages
    const result: SessionAttendanceStat[] = [];
    statsMap.forEach((stat) => {
      const hadir = stat.hadirUids.size || stat.hadirNames.size;
      stat.hadirCount = hadir;
      if (stat.tepatWaktuCount === 0 && stat.terlambatCount === 0 && hadir > 0) {
        stat.tepatWaktuCount = hadir;
      }
      stat.belumHadirCount = Math.max(0, stat.totalPeserta - hadir);
      stat.persentaseHadir = stat.totalPeserta > 0 ? (hadir / stat.totalPeserta) * 100 : 0;
      stat.persentaseTepatWaktu = stat.totalPeserta > 0 ? (stat.tepatWaktuCount / stat.totalPeserta) * 100 : 0;
      stat.persentaseTerlambat = stat.totalPeserta > 0 ? (stat.terlambatCount / stat.totalPeserta) * 100 : 0;
      stat.persentaseBelumHadir =
        stat.totalPeserta > 0 ? (stat.belumHadirCount / stat.totalPeserta) * 100 : 100;
      result.push(stat);
    });

    // Sort: ongoing first, then by date descending, then by jam
    return result.sort((a, b) => {
      if (a.isOngoing && !b.isOngoing) return -1;
      if (!a.isOngoing && b.isOngoing) return 1;
      if (a.tanggal !== b.tanggal) return b.tanggal.localeCompare(a.tanggal);
      return (a.jamMulai || "").localeCompare(b.jamMulai || "");
    });
  }, [sessionList, attendanceRecords, totalRegisteredPeserta, pesertaList]);

  // Filtered Session Stats based on controls
  const filteredSessionStats = useMemo(() => {
    return sessionStats.filter((stat) => {
      if (selectedKategori !== "SEMUA" && stat.kategori.toLowerCase() !== selectedKategori.toLowerCase()) {
        return false;
      }
      if (selectedTanggal !== "SEMUA" && stat.tanggal !== selectedTanggal) {
        return false;
      }
      return true;
    });
  }, [sessionStats, selectedKategori, selectedTanggal]);

  // Default select the first active/ongoing session or first available session
  useEffect(() => {
    if (sessionStats.length > 0 && !selectedSessionKey) {
      if (defaultSessionName) {
        const matched = sessionStats.find((s) => s.sessionName.toLowerCase() === defaultSessionName.toLowerCase());
        if (matched) {
          setSelectedSessionKey(matched.sessionKey);
          return;
        }
      }
      const ongoing = sessionStats.find((s) => s.isOngoing);
      if (ongoing) {
        setSelectedSessionKey(ongoing.sessionKey);
      } else {
        setSelectedSessionKey(sessionStats[0].sessionKey);
      }
    }
  }, [sessionStats, selectedSessionKey, defaultSessionName]);

  // Current Active Selected Session Detail
  const currentSelectedStat = useMemo<SessionAttendanceStat | null>(() => {
    if (!selectedSessionKey) return filteredSessionStats[0] || null;
    return sessionStats.find((s) => s.sessionKey === selectedSessionKey) || filteredSessionStats[0] || null;
  }, [selectedSessionKey, sessionStats, filteredSessionStats]);

  // -------------------------------------------------------------
  // Detailed Participant List for Selected Session
  // -------------------------------------------------------------
  const participantDetails = useMemo(() => {
    if (!currentSelectedStat) return { hadir: [], belum: [] };

    const hadirSetUids = currentSelectedStat.hadirUids;
    const hadirSetNames = currentSelectedStat.hadirNames;

    const hadirList: Array<{
      peserta: Peserta;
      timestamp?: Date;
      status: "hadir";
    }> = [];

    const belumList: Array<{
      peserta: Peserta;
      status: "belum";
    }> = [];

    pesertaList.forEach((p) => {
      const cleanUid = p.nfc_uid ? hexToDecimal(p.nfc_uid, true) : "";
      const pNameLower = (p.nama || "").trim().toLowerCase();

      const isHadir =
        (cleanUid && hadirSetUids.has(cleanUid)) ||
        (pNameLower && hadirSetNames.has(pNameLower));

      if (isHadir) {
        // Find exact attendance record for timestamp
        const matchedRec = attendanceRecords.find((a) => {
          const aUid = a.serial_number ? hexToDecimal(a.serial_number, true) : "";
          const aNameLower = (a.nama_peserta || a.nama || "").trim().toLowerCase();
          const aDate = a.timestamp ? new Date(a.timestamp).toISOString().split("T")[0] : "";
          return (
            ((cleanUid && aUid === cleanUid) || (pNameLower && aNameLower === pNameLower)) &&
            (a.sesi_nama === currentSelectedStat.sessionName &&
              (!currentSelectedStat.tanggal || aDate === currentSelectedStat.tanggal))
          );
        });

        hadirList.push({
          peserta: p,
          timestamp: matchedRec?.timestamp ? new Date(matchedRec.timestamp) : undefined,
          status: "hadir",
        });
      } else {
        belumList.push({
          peserta: p,
          status: "belum",
        });
      }
    });

    return { hadir: hadirList, belum: belumList };
  }, [currentSelectedStat, pesertaList, attendanceRecords]);

  // Filter participant details by search and kelompok
  const filteredParticipants = useMemo(() => {
    let list: Array<{ peserta: Peserta; timestamp?: Date; status: "hadir" | "belum" }> = [];
    if (activeListTab === "hadir") {
      list = participantDetails.hadir;
    } else if (activeListTab === "belum") {
      list = participantDetails.belum;
    } else {
      list = [...participantDetails.hadir, ...participantDetails.belum];
    }

    return list.filter((item) => {
      if (selectedKelompokFilter !== "SEMUA" && item.peserta.kelompok !== selectedKelompokFilter) {
        return false;
      }
      if (searchPeserta.trim()) {
        const query = searchPeserta.toLowerCase();
        const matchName = item.peserta.nama?.toLowerCase().includes(query);
        const matchKel = item.peserta.kelompok?.toLowerCase().includes(query);
        const matchGrup = item.peserta.grup?.toLowerCase().includes(query) || item.peserta.tenda?.toLowerCase().includes(query);
        const matchUid = item.peserta.nfc_uid?.toLowerCase().includes(query);
        return matchName || matchKel || matchGrup || matchUid;
      }
      return true;
    });
  }, [participantDetails, activeListTab, selectedKelompokFilter, searchPeserta]);

  // -------------------------------------------------------------
  // Group / Kelompok Attendance Breakdown for Selected Session
  // -------------------------------------------------------------
  const kelompokBreakdown = useMemo(() => {
    if (!currentSelectedStat) return [];

    const kMap = new Map<
      string,
      { total: number; hadir: number; belum: number; persentase: number }
    >();

    pesertaList.forEach((p) => {
      const k = p.kelompok && p.kelompok !== "-" ? p.kelompok : "Tanpa Kelompok";
      if (!kMap.has(k)) {
        kMap.set(k, { total: 0, hadir: 0, belum: 0, persentase: 0 });
      }
      const item = kMap.get(k)!;
      item.total += 1;

      const cleanUid = p.nfc_uid ? hexToDecimal(p.nfc_uid, true) : "";
      const pNameLower = (p.nama || "").trim().toLowerCase();
      const isHadir =
        (cleanUid && currentSelectedStat.hadirUids.has(cleanUid)) ||
        (pNameLower && currentSelectedStat.hadirNames.has(pNameLower));

      if (isHadir) {
        item.hadir += 1;
      } else {
        item.belum += 1;
      }
    });

    const list: Array<{
      kelompok: string;
      total: number;
      hadir: number;
      belum: number;
      persentase: number;
    }> = [];

    kMap.forEach((val, key) => {
      val.persentase = val.total > 0 ? (val.hadir / val.total) * 100 : 0;
      list.push({ kelompok: key, ...val });
    });

    return list.sort((a, b) => b.persentase - a.persentase || b.hadir - a.hadir);
  }, [currentSelectedStat, pesertaList]);

  // -------------------------------------------------------------
  // Export Statistics to Excel
  // -------------------------------------------------------------
  const handleExportExcel = () => {
    if (!currentSelectedStat) return;

    // Sheet 1: Ringkasan Sesi
    const summaryHeaders = [
      "Nama Sesi",
      "Kategori",
      "Tanggal",
      "Jam Mulai",
      "Jam Selesai",
      "Total Peserta",
      "Sudah Hadir",
      "Belum Hadir",
      "Persentase Hadir (%)",
      "Persentase Belum Hadir (%)",
      "Hadir Laki-laki",
      "Hadir Perempuan",
    ];

    const summaryRows = filteredSessionStats.map((s) => [
      s.sessionName,
      s.kategori.toUpperCase(),
      s.tanggal || "-",
      s.jamMulai || "-",
      s.jamSelesai || "-",
      s.totalPeserta,
      s.hadirCount,
      s.belumHadirCount,
      s.persentaseHadir.toFixed(1) + "%",
      s.persentaseBelumHadir.toFixed(1) + "%",
      s.hadirLakiLaki,
      s.hadirPerempuan,
    ]);

    // Sheet 2: Daftar Peserta Hadir pada Sesi Terpilih
    const hadirHeaders = [
      "No",
      "Nama Peserta",
      "L/P",
      "Kelompok",
      "Grup",
      "Dapukan",
      "Smartcard UID",
      "Waktu Presensi",
      "Status",
    ];
    const hadirRows = participantDetails.hadir.map((item, idx) => [
      idx + 1,
      item.peserta.nama,
      item.peserta.jenis_kelamin || "-",
      item.peserta.kelompok || "-",
      item.peserta.grup || item.peserta.tenda || "-",
      item.peserta.dapukan || "-",
      item.peserta.nfc_uid || "-",
      item.timestamp ? item.timestamp.toLocaleTimeString("id-ID") : "-",
      "Sudah Hadir",
    ]);

    // Sheet 3: Daftar Peserta Belum Hadir pada Sesi Terpilih
    const belumHeaders = [
      "No",
      "Nama Peserta",
      "L/P",
      "Kelompok",
      "Grup",
      "Dapukan",
      "Smartcard UID",
      "Status",
    ];
    const belumRows = participantDetails.belum.map((item, idx) => [
      idx + 1,
      item.peserta.nama,
      item.peserta.jenis_kelamin || "-",
      item.peserta.kelompok || "-",
      item.peserta.grup || item.peserta.tenda || "-",
      item.peserta.dapukan || "-",
      item.peserta.nfc_uid || "-",
      "Belum Hadir",
    ]);

    // Sheet 4: Rekap Kehadiran per Kelompok
    const kelompokHeaders = [
      "Kelompok",
      "Total Anggota",
      "Jumlah Hadir",
      "Jumlah Belum Hadir",
      "Persentase Kehadiran",
    ];
    const kelompokRows = kelompokBreakdown.map((k) => [
      k.kelompok,
      k.total,
      k.hadir,
      k.belum,
      k.persentase.toFixed(1) + "%",
    ]);

    exportDataToExcel(`Statistik_Presensi_${currentSelectedStat.sessionName.replace(/\s+/g, "_")}`, [
      {
        sheetName: "Ringkasan Semua Sesi",
        title: "STATISTIK KEHADIRAN SEMUA SESI CAI 2026",
        subtitle: `Tanggal: ${selectedTanggal === "SEMUA" ? "Semua Tanggal" : selectedTanggal}`,
        headers: summaryHeaders,
        rows: summaryRows,
      },
      {
        sheetName: `Hadir (${currentSelectedStat.sessionName.slice(0, 15)})`,
        title: `DAFTAR PESERTA SUDAH HADIR - ${currentSelectedStat.sessionName.toUpperCase()}`,
        subtitle: `Tanggal: ${currentSelectedStat.tanggal} | Hadir: ${currentSelectedStat.hadirCount}/${currentSelectedStat.totalPeserta} (${currentSelectedStat.persentaseHadir.toFixed(1)}%)`,
        headers: hadirHeaders,
        rows: hadirRows,
      },
      {
        sheetName: `Belum Hadir (${currentSelectedStat.sessionName.slice(0, 10)})`,
        title: `DAFTAR PESERTA BELUM HADIR - ${currentSelectedStat.sessionName.toUpperCase()}`,
        subtitle: `Tanggal: ${currentSelectedStat.tanggal} | Belum Hadir: ${currentSelectedStat.belumHadirCount}/${currentSelectedStat.totalPeserta} (${currentSelectedStat.persentaseBelumHadir.toFixed(1)}%)`,
        headers: belumHeaders,
        rows: belumRows,
      },
      {
        sheetName: "Rekap Kelompok",
        title: `REKAP PERSENTASE KEHADIRAN PER KELOMPOK - ${currentSelectedStat.sessionName.toUpperCase()}`,
        headers: kelompokHeaders,
        rows: kelompokRows,
      },
    ]);
  };

  const getKategoriBadge = (kategori: string) => {
    switch (kategori.toLowerCase()) {
      case "materi":
        return {
          icon: BookOpen,
          bg: "bg-blue-50 text-blue-700 border-blue-200",
          dot: "bg-blue-500",
          label: "Materi",
        };
      case "makan":
        return {
          icon: Utensils,
          bg: "bg-amber-50 text-amber-700 border-amber-200",
          dot: "bg-amber-500",
          label: "Makan",
        };
      case "sholat":
        return {
          icon: Moon,
          bg: "bg-emerald-50 text-emerald-700 border-emerald-200",
          dot: "bg-emerald-500",
          label: "Sholat",
        };
      default:
        return {
          icon: Clock,
          bg: "bg-slate-50 text-slate-700 border-slate-200",
          dot: "bg-slate-500",
          label: "Umum",
        };
    }
  };

  return (
    <div className="space-y-5">
      {/* 1. Header & Quick Actions */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-5 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#203598] to-blue-700 text-white flex items-center justify-center shadow-md shadow-blue-900/10">
              <PieChartIcon className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight">
                  Statistik Kehadiran Sesi
                </h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Live Sync
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Visualisasi grafik donat modern persentase peserta hadir vs belum hadir di setiap sesi
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleManualRefresh}
              disabled={refreshing}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors border border-slate-200/60 shadow-2xs cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin text-blue-600" : ""}`} />
              <span>{refreshing ? "Memperbarui..." : "Refresh Data"}</span>
            </button>

            <button
              onClick={handleExportExcel}
              disabled={!currentSelectedStat}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition-colors shadow-sm shadow-emerald-700/20 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Statistik (.xlsx)</span>
            </button>
          </div>
        </div>

        {/* Filters Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 mt-4 pt-4 border-t border-slate-100">
          {/* Kategori Sesi Filter */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
              Kategori Sesi
            </label>
            <select
              value={selectedKategori}
              onChange={(e) => setSelectedKategori(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:border-[#203598] focus:bg-white"
            >
              <option value="SEMUA">Semua Kategori (Materi, Makan, Sholat)</option>
              <option value="materi">Sesi Materi</option>
              <option value="makan">Sesi Makan</option>
              <option value="sholat">Sesi Sholat</option>
            </select>
          </div>

          {/* Tanggal Sesi Filter */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
              Filter Tanggal
            </label>
            <select
              value={selectedTanggal}
              onChange={(e) => setSelectedTanggal(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:border-[#203598] focus:bg-white"
            >
              <option value="SEMUA">Semua Tanggal</option>
              {distinctDates.map((d) => (
                <option key={d} value={d}>
                  {new Date(d).toLocaleDateString("id-ID", {
                    weekday: "long",
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </option>
              ))}
            </select>
          </div>

          {/* Sesi Dropdown Switcher */}
          <div className="sm:col-span-2">
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
              Pilih Sesi Fokus
            </label>
            <select
              value={selectedSessionKey}
              onChange={(e) => setSelectedSessionKey(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-[#203598] focus:outline-none focus:border-[#203598] focus:bg-white truncate"
            >
              {filteredSessionStats.length === 0 ? (
                <option value="">Belum ada sesi tersedia</option>
              ) : (
                filteredSessionStats.map((s) => (
                  <option key={s.sessionKey} value={s.sessionKey}>
                    {s.isOngoing ? "🟢 [LIVE SEKARANG] " : ""}
                    {s.sessionName} ({s.tanggal || "-"} | {s.jamMulai || "00:00"} - {s.jamSelesai || "00:00"}) - Hadir: {s.persentaseHadir.toFixed(1)}%
                  </option>
                ))
              )}
            </select>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="p-12 bg-white rounded-2xl border border-slate-200 flex flex-col items-center justify-center text-center">
          <RefreshCw className="w-8 h-8 text-[#203598] animate-spin mb-3" />
          <p className="text-sm font-bold text-slate-700">Memuat Statistik Kehadiran...</p>
          <p className="text-xs text-slate-400 mt-1">Menghitung persentase presensi seluruh sesi</p>
        </div>
      ) : !currentSelectedStat ? (
        <div className="p-12 bg-white rounded-2xl border border-slate-200 text-center">
          <Info className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-800">Tidak Ada Sesi Ditemukan</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
            Silakan sesuaikan filter kategori atau tanggal, atau tambahkan jadwal sesi pada menu Jadwal.
          </p>
        </div>
      ) : (
        <>
          {/* 2. Hero Interactive Donut Chart & Key Metrics Section */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Main Donut Chart Card */}
            <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200/90 p-5 sm:p-6 shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                    Grafik Donat Presensi
                  </span>
                  {currentSelectedStat.isOngoing ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                      Sedang Berlangsung
                    </span>
                  ) : (
                    <span className="text-[11px] font-semibold text-slate-400">
                      {currentSelectedStat.tanggal}
                    </span>
                  )}
                </div>

                <h2 className="text-lg font-extrabold text-slate-900 leading-tight">
                  {currentSelectedStat.sessionName}
                </h2>
                <div className="flex items-center gap-2 mt-1 text-xs text-slate-500">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  <span>
                    {currentSelectedStat.jamMulai || "--:--"} - {currentSelectedStat.jamSelesai || "--:--"} WIB
                  </span>
                  <span>•</span>
                  <span className="capitalize font-semibold text-slate-700">
                    Kategori {currentSelectedStat.kategori}
                  </span>
                </div>

                {/* Donut Mode Switcher Pills */}
                <div className="flex items-center gap-1 bg-slate-100/90 p-1 rounded-xl mt-3.5 border border-slate-200/70">
                  <button
                    type="button"
                    onClick={() => setDonutMode("status3")}
                    className={`flex-1 py-1.5 px-2 text-[11px] font-extrabold rounded-lg transition-all ${
                      donutMode === "status3"
                        ? "bg-white text-slate-900 shadow-xs"
                        : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    3 Status (Presensi)
                  </button>
                  <button
                    type="button"
                    onClick={() => setDonutMode("kehadiran2")}
                    className={`flex-1 py-1.5 px-2 text-[11px] font-extrabold rounded-lg transition-all ${
                      donutMode === "kehadiran2"
                        ? "bg-white text-slate-900 shadow-xs"
                        : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    Hadir / Belum
                  </button>
                  <button
                    type="button"
                    onClick={() => setDonutMode("gender3")}
                    className={`flex-1 py-1.5 px-2 text-[11px] font-extrabold rounded-lg transition-all ${
                      donutMode === "gender3"
                        ? "bg-white text-slate-900 shadow-xs"
                        : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    Gender
                  </button>
                </div>
              </div>

              {/* Interactive Donut Graphic */}
              <div className="my-6 flex justify-center">
                <ModernDonutChart
                  hadirCount={currentSelectedStat.hadirCount}
                  tepatWaktuCount={currentSelectedStat.tepatWaktuCount}
                  terlambatCount={currentSelectedStat.terlambatCount}
                  hadirLakiLaki={currentSelectedStat.hadirLakiLaki}
                  hadirPerempuan={currentSelectedStat.hadirPerempuan}
                  belumHadirCount={currentSelectedStat.belumHadirCount}
                  total={currentSelectedStat.totalPeserta}
                  activeMode={donutMode}
                  size={260}
                  strokeWidth={32}
                  showDetails={true}
                  animate={true}
                />
              </div>

              {/* Footer Indicator info */}
              <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-100 text-[11px] text-slate-600 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-[#203598]" />
                  <span>Arahkan kursor ke slice cincin untuk detail</span>
                </span>
                <span className="font-bold text-slate-800">
                  {totalRegisteredPeserta} Terdaftar
                </span>
              </div>
            </div>

            {/* Key Metrics Cards & Breakdown */}
            <div className="lg:col-span-7 flex flex-col gap-4 justify-between">
              {/* 4 Summary Stat Tiles */}
              <div className="grid grid-cols-2 sm:grid-cols-2 gap-3.5">
                {/* 1. Tepat Waktu */}
                <div className="p-4 bg-[#59BA9B]/10 rounded-2xl border border-[#59BA9B]/30 shadow-2xs">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-extrabold text-[#2d7760] uppercase tracking-wider">
                      Tepat Waktu
                    </span>
                    <div className="w-7 h-7 rounded-lg bg-[#59BA9B] text-white flex items-center justify-center shadow-xs">
                      <UserCheck className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-2xl sm:text-3xl font-extrabold text-[#1f5847]">
                      {currentSelectedStat.tepatWaktuCount || (currentSelectedStat.hadirCount - (currentSelectedStat.terlambatCount || 0))}
                    </span>
                    <span className="text-xs font-extrabold text-[#2d7760]">
                      ({(currentSelectedStat.persentaseTepatWaktu || ((currentSelectedStat.tepatWaktuCount || currentSelectedStat.hadirCount) / (currentSelectedStat.totalPeserta || 1) * 100)).toFixed(1)}%)
                    </span>
                  </div>
                  <p className="text-[11px] text-[#2d7760]/80 mt-0.5">
                    Hadir sebelum sesi dimulai
                  </p>
                </div>

                {/* 2. Terlambat */}
                <div className="p-4 bg-[#FF8C66]/10 rounded-2xl border border-[#FF8C66]/30 shadow-2xs">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-extrabold text-[#c04b23] uppercase tracking-wider">
                      Terlambat
                    </span>
                    <div className="w-7 h-7 rounded-lg bg-[#FF8C66] text-white flex items-center justify-center shadow-xs">
                      <Clock className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-2xl sm:text-3xl font-extrabold text-[#943312]">
                      {currentSelectedStat.terlambatCount || 0}
                    </span>
                    <span className="text-xs font-extrabold text-[#c04b23]">
                      ({(currentSelectedStat.persentaseTerlambat || 0).toFixed(1)}%)
                    </span>
                  </div>
                  <p className="text-[11px] text-[#c04b23]/80 mt-0.5">
                    Hadir setelah toleransi waktu
                  </p>
                </div>

                {/* 3. Belum Hadir */}
                <div className="p-4 bg-[#859BCA]/10 rounded-2xl border border-[#859BCA]/30 shadow-2xs">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-extrabold text-[#47629b] uppercase tracking-wider">
                      Belum Hadir
                    </span>
                    <div className="w-7 h-7 rounded-lg bg-[#859BCA] text-white flex items-center justify-center shadow-xs">
                      <UserX className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-2xl sm:text-3xl font-extrabold text-[#32497a]">
                      {currentSelectedStat.belumHadirCount}
                    </span>
                    <span className="text-xs font-extrabold text-[#47629b]">
                      ({currentSelectedStat.persentaseBelumHadir.toFixed(1)}%)
                    </span>
                  </div>
                  <p className="text-[11px] text-[#47629b]/80 mt-0.5">
                    Belum tap smartcard
                  </p>
                </div>

                {/* 4. Total Target Peserta */}
                <div className="p-4 bg-white rounded-2xl border border-slate-200/80 shadow-2xs">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                      Total Peserta
                    </span>
                    <div className="w-7 h-7 rounded-lg bg-blue-50 text-[#203598] flex items-center justify-center">
                      <Users className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="text-2xl sm:text-3xl font-extrabold text-slate-800">
                    {currentSelectedStat.totalPeserta}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {currentSelectedStat.hadirLakiLaki} Putra • {currentSelectedStat.hadirPerempuan} Putri hadir
                  </p>
                </div>
              </div>

              {/* Progress Bar Visual Breakdown per Gender & Target */}
              <div className="bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-5 shadow-2xs space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800">
                    Progres Ketercapaian Presensi Sesi
                  </span>
                  <span className="text-xs font-extrabold text-[#203598]">
                    {currentSelectedStat.hadirCount} dari {currentSelectedStat.totalPeserta} Peserta ({currentSelectedStat.persentaseHadir.toFixed(1)}%)
                  </span>
                </div>

                {/* Multi-segment Progress Bar with 3 Colors */}
                <div className="w-full h-3.5 bg-slate-100 rounded-full overflow-hidden flex p-0.5 border border-slate-200/60 shadow-inner">
                  <div
                    style={{ width: `${currentSelectedStat.persentaseTepatWaktu || ((currentSelectedStat.tepatWaktuCount || currentSelectedStat.hadirCount) / (currentSelectedStat.totalPeserta || 1) * 100)}%` }}
                    className="h-full bg-[#59BA9B] rounded-l-full transition-all duration-700"
                    title={`Tepat Waktu: ${(currentSelectedStat.persentaseTepatWaktu || 0).toFixed(1)}%`}
                  />
                  <div
                    style={{ width: `${currentSelectedStat.persentaseTerlambat || 0}%` }}
                    className="h-full bg-[#FF8C66] transition-all duration-700"
                    title={`Terlambat: ${(currentSelectedStat.persentaseTerlambat || 0).toFixed(1)}%`}
                  />
                  <div
                    style={{ width: `${currentSelectedStat.persentaseBelumHadir}%` }}
                    className="h-full bg-[#859BCA]/50 rounded-r-full transition-all duration-700"
                    title={`Belum Hadir: ${currentSelectedStat.persentaseBelumHadir.toFixed(1)}%`}
                  />
                </div>

                {/* Legend footer with percentages */}
                <div className="flex flex-wrap items-center justify-between text-xs pt-1 border-t border-slate-100 gap-2">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1.5 text-slate-700">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#59BA9B]" />
                      Tepat: <strong>{(currentSelectedStat.persentaseTepatWaktu || 0).toFixed(1)}%</strong>
                    </span>
                    <span className="flex items-center gap-1.5 text-slate-700">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#FF8C66]" />
                      Telat: <strong>{(currentSelectedStat.persentaseTerlambat || 0).toFixed(1)}%</strong>
                    </span>
                    <span className="flex items-center gap-1.5 text-slate-500">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#859BCA]" />
                      Belum: <strong>{currentSelectedStat.persentaseBelumHadir.toFixed(1)}%</strong>
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[11px] px-2 py-0.5 bg-blue-50 text-blue-700 font-semibold rounded-md">
                      L: {currentSelectedStat.hadirLakiLaki}
                    </span>
                    <span className="text-[11px] px-2 py-0.5 bg-pink-50 text-pink-700 font-semibold rounded-md">
                      P: {currentSelectedStat.hadirPerempuan}
                    </span>
                  </div>
                </div>
              </div>

              {/* Quick Kelompok / Desa Top Performance Ranking */}
              <div className="bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-5 shadow-2xs">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-[#203598]" />
                    <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">
                      Persentase Hadir per Kelompok / Desa
                    </h4>
                  </div>
                  <span className="text-[11px] text-slate-400">
                    {kelompokBreakdown.length} Kelompok
                  </span>
                </div>

                <div className="space-y-2 max-h-36 overflow-y-auto pr-1">
                  {kelompokBreakdown.map((k) => (
                    <div key={k.kelompok} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-slate-700 truncate max-w-[180px]">
                          {k.kelompok}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-slate-500 text-[11px]">
                            {k.hadir}/{k.total}
                          </span>
                          <span
                            className={`font-bold px-1.5 py-0.2 rounded text-[11px] ${
                              k.persentase >= 80
                                ? "text-emerald-700 bg-emerald-50"
                                : k.persentase >= 50
                                ? "text-amber-700 bg-amber-50"
                                : "text-rose-700 bg-rose-50"
                            }`}
                          >
                            {k.persentase.toFixed(0)}%
                          </span>
                        </div>
                      </div>
                      <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          style={{ width: `${k.persentase}%` }}
                          className={`h-full rounded-full transition-all duration-500 ${
                            k.persentase >= 80
                              ? "bg-emerald-500"
                              : k.persentase >= 50
                              ? "bg-amber-500"
                              : "bg-rose-500"
                          }`}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* 3. Grid of All Sesi Donut Cards (Multi-Session Overview) */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-5 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
              <div>
                <h3 className="text-sm sm:text-base font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
                  <span>Ringkasan Donat Seluruh Sesi</span>
                  <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                    {filteredSessionStats.length} Sesi
                  </span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Klik pada kartu sesi mana saja untuk melihat rincian presensi peserta
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5">
              {filteredSessionStats.map((stat) => {
                const badge = getKategoriBadge(stat.kategori);
                const BadgeIcon = badge.icon;
                const isSelected = stat.sessionKey === currentSelectedStat.sessionKey;

                return (
                  <div
                    key={stat.sessionKey}
                    onClick={() => setSelectedSessionKey(stat.sessionKey)}
                    className={`p-4 rounded-2xl border transition-all cursor-pointer relative flex flex-col justify-between ${
                      isSelected
                        ? "bg-gradient-to-b from-blue-50/50 to-white border-[#203598] ring-2 ring-[#203598]/20 shadow-md scale-[1.01]"
                        : "bg-white border-slate-200/80 hover:border-slate-300 hover:shadow-xs"
                    }`}
                  >
                    <div>
                      {/* Top status bar */}
                      <div className="flex items-center justify-between gap-1 mb-2">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border ${badge.bg}`}
                        >
                          <BadgeIcon className="w-3 h-3" />
                          <span>{badge.label}</span>
                        </span>

                        {stat.isOngoing ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            Live
                          </span>
                        ) : (
                          <span className="text-[10px] font-medium text-slate-400">
                            {stat.tanggal}
                          </span>
                        )}
                      </div>

                      <h4 className="font-extrabold text-sm text-slate-900 line-clamp-1 mb-1">
                        {stat.sessionName}
                      </h4>

                      <div className="flex items-center gap-1.5 text-[11px] text-slate-500 mb-3">
                        <Clock className="w-3 h-3 text-slate-400" />
                        <span>
                          {stat.jamMulai || "00:00"} - {stat.jamSelesai || "00:00"}
                        </span>
                      </div>
                    </div>

                    {/* Mini Donut & Percentage Side-by-Side */}
                    <div className="flex items-center justify-between gap-2 p-2.5 bg-slate-50/80 rounded-xl border border-slate-100 my-1">
                      <div className="shrink-0">
                        <ModernDonutChart
                          hadirCount={stat.hadirCount}
                          tepatWaktuCount={stat.tepatWaktuCount}
                          terlambatCount={stat.terlambatCount}
                          hadirLakiLaki={stat.hadirLakiLaki}
                          hadirPerempuan={stat.hadirPerempuan}
                          belumHadirCount={stat.belumHadirCount}
                          total={stat.totalPeserta}
                          activeMode="status3"
                          size={74}
                          strokeWidth={10}
                          showDetails={false}
                          animate={false}
                        />
                      </div>

                      <div className="flex-1 text-right">
                        <div className="text-xl font-extrabold text-slate-800">
                          {stat.persentaseHadir.toFixed(1)}%
                        </div>
                        <div className="flex items-center justify-end gap-1.5 text-[10px] font-bold mt-0.5">
                          <span className="text-[#2d7760]">{stat.tepatWaktuCount || (stat.hadirCount - (stat.terlambatCount || 0))} Tepat</span>
                          <span>•</span>
                          <span className="text-[#c04b23]">{stat.terlambatCount || 0} Telat</span>
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          {stat.belumHadirCount} Belum Hadir
                        </div>
                      </div>
                    </div>

                    {/* Footer active indicator button */}
                    <div className="mt-2 text-center">
                      <span
                        className={`text-[11px] font-bold inline-flex items-center gap-1 ${
                          isSelected ? "text-[#203598]" : "text-slate-400 hover:text-slate-600"
                        }`}
                      >
                        <span>{isSelected ? "Sedang Dilihat" : "Pilih Sesi Ini"}</span>
                        <ChevronRight className="w-3 h-3" />
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 4. Tabbed Table: Daftar Peserta Hadir / Belum Hadir pada Sesi Terpilih */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-5 shadow-xs space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-sm sm:text-base font-extrabold text-slate-900 tracking-tight">
                  Rincian Data Peserta: {currentSelectedStat.sessionName}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Daftar nama dan status kehadiran smartcard peserta pada sesi ini
                </p>
              </div>

              {/* Tab selector buttons */}
              <div className="inline-flex p-1 bg-slate-100 rounded-xl">
                <button
                  onClick={() => setActiveListTab("hadir")}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                    activeListTab === "hadir"
                      ? "bg-emerald-600 text-white shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Sudah Hadir ({participantDetails.hadir.length})</span>
                </button>

                <button
                  onClick={() => setActiveListTab("belum")}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                    activeListTab === "belum"
                      ? "bg-rose-600 text-white shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <XCircle className="w-3.5 h-3.5" />
                  <span>Belum Hadir ({participantDetails.belum.length})</span>
                </button>

                <button
                  onClick={() => setActiveListTab("semua")}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                    activeListTab === "semua"
                      ? "bg-[#203598] text-white shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>Semua ({pesertaList.length})</span>
                </button>
              </div>
            </div>

            {/* Sub-Filters inside Table */}
            <div className="flex flex-col sm:flex-row items-center gap-3">
              {/* Search input */}
              <div className="relative flex-1 w-full">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Cari nama peserta, kelompok, grup, atau UID smartcard..."
                  value={searchPeserta}
                  onChange={(e) => setSearchPeserta(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#203598] focus:bg-white"
                />
              </div>

              {/* Kelompok filter dropdown */}
              <div className="w-full sm:w-56 shrink-0">
                <select
                  value={selectedKelompokFilter}
                  onChange={(e) => setSelectedKelompokFilter(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:border-[#203598] focus:bg-white"
                >
                  <option value="SEMUA">Semua Kelompok ({distinctKelompok.length})</option>
                  {distinctKelompok.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Participant Table */}
            <div className="border border-slate-200/80 rounded-xl overflow-hidden overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200 select-none">
                  <tr>
                    <th className="py-3 px-3.5 w-12 text-center">No</th>
                    <th className="py-3 px-3.5 min-w-[180px]">Nama Peserta</th>
                    <th className="py-3 px-3.5 text-center w-16">L/P</th>
                    <th className="py-3 px-3.5 min-w-[120px]">Kelompok</th>
                    <th className="py-3 px-3.5 min-w-[110px]">Grup</th>
                    <th className="py-3 px-3.5 min-w-[110px]">Dapukan</th>
                    <th className="py-3 px-3.5 min-w-[130px]">Smartcard UID</th>
                    <th className="py-3 px-3.5 min-w-[130px]">Waktu Presensi</th>
                    <th className="py-3 px-3.5 text-center min-w-[110px]">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredParticipants.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-slate-400 font-medium">
                        Tidak ada data peserta yang cocok dengan filter pencarian
                      </td>
                    </tr>
                  ) : (
                    filteredParticipants.slice(0, 100).map((item, idx) => {
                      const isHadir = item.status === "hadir";
                      return (
                        <tr
                          key={`${item.peserta.id}_${idx}`}
                          className={`hover:bg-slate-50/80 transition-colors ${
                            isHadir ? "bg-emerald-50/20" : ""
                          }`}
                        >
                          <td className="py-2.5 px-3.5 text-center text-slate-400 font-mono">
                            {idx + 1}
                          </td>
                          <td className="py-2.5 px-3.5 font-bold text-slate-900">
                            {item.peserta.nama}
                          </td>
                          <td className="py-2.5 px-3.5 text-center">
                            <span
                              className={`inline-flex items-center justify-center w-5 h-5 rounded-md text-[10px] font-bold ${
                                item.peserta.jenis_kelamin === "P"
                                  ? "bg-pink-100 text-pink-700"
                                  : "bg-blue-100 text-blue-700"
                              }`}
                            >
                              {item.peserta.jenis_kelamin || "L"}
                            </span>
                          </td>
                          <td className="py-2.5 px-3.5 text-slate-700 font-medium">
                            {item.peserta.kelompok || "-"}
                          </td>
                          <td className="py-2.5 px-3.5 text-slate-700 font-medium">
                            {item.peserta.grup || item.peserta.tenda || "-"}
                          </td>
                          <td className="py-2.5 px-3.5 text-slate-600">
                            {item.peserta.dapukan || "-"}
                          </td>
                          <td className="py-2.5 px-3.5 font-mono text-[11px] text-slate-600">
                            {item.peserta.nfc_uid || "-"}
                          </td>
                          <td className="py-2.5 px-3.5 text-slate-600 text-[11px]">
                            {item.timestamp ? (
                              <span className="font-semibold text-emerald-700">
                                {item.timestamp.toLocaleTimeString("id-ID")} WIB
                              </span>
                            ) : (
                              <span className="text-slate-300">-</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3.5 text-center">
                            {isHadir ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                <Check className="w-3 h-3 text-emerald-700" />
                                Hadir
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-slate-100 text-slate-600 border border-slate-200">
                                Belum Hadir
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>

              {filteredParticipants.length > 100 && (
                <div className="p-2.5 bg-slate-50 text-center text-xs text-slate-500 border-t border-slate-100 font-medium">
                  Menampilkan 100 data pertama. Gunakan tombol Export Excel untuk mengunduh seluruh {filteredParticipants.length} data.
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
