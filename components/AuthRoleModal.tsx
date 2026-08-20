"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import {
  ShieldCheck,
  User,
  ChevronRight,
  ArrowLeft,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Lock,
  Layers,
  Calendar,
  Nfc,
  Users,
  Compass,
  Briefcase
} from "lucide-react";
import { supabase } from "@/lib/supabase";

export type RoleType =
  | "kesekertariatan"
  | "acara"
  | "operator"
  | "steering committee"
  | "organizing committee"
  | "fasilitator";

export interface UserSession {
  id?: string | number;
  nama_lengkap: string;
  role: RoleType;
  role_label: string;
  login_at: string;
}

export interface RoleConfig {
  id: RoleType;
  title: string;
  subtitle: string;
  badge: string;
  icon: any;
  cardGradient: string; // Tailored styling resembling the reference image
  bgPattern: string;
}

export const ROLES_CONFIG: RoleConfig[] = [
  {
    id: "kesekertariatan",
    title: "Kesekretariatan",
    subtitle: "Akses penuh master data peserta, registrasi NFC, plotting, jadwal, perizinan & rekapitulasi",
    badge: "Master Akses",
    icon: Layers,
    cardGradient: "from-[#203598] to-[#3b5998]",
    bgPattern: "bg-blue-900",
  },
  {
    id: "acara",
    title: "Acara",
    subtitle: "Manajemen dan monitoring jadwal sesi (Materi, Makan, Sholat), grafik presensi & perizinan",
    badge: "Rundown & Sesi",
    icon: Calendar,
    cardGradient: "from-[#1d4ed8] to-[#2563eb]",
    bgPattern: "bg-blue-800",
  },
  {
    id: "operator",
    title: "Operator",
    subtitle: "Operasional pemindaian kartu NFC presensi kehadiran peserta & pencatatan perizinan sesi",
    badge: "Scanner & Tap",
    icon: Nfc,
    cardGradient: "from-[#0f766e] to-[#0d9488]",
    bgPattern: "bg-teal-800",
  },
  {
    id: "steering committee",
    title: "Steering Committee",
    subtitle: "Monitoring evaluasi kehadiran, rekapitulasi data absensi, data peserta & kontrol kebijakan",
    badge: "Pengarah / SC",
    icon: Compass,
    cardGradient: "from-[#b45309] to-[#d97706]",
    bgPattern: "bg-amber-800",
  },
  {
    id: "organizing committee",
    title: "Organizing Committee",
    subtitle: "Pelaksanaan operasional lapangan, pemantauan presensi, plotting kelompok, jadwal & rekap data",
    badge: "Panitia Pelaksana",
    icon: Briefcase,
    cardGradient: "from-[#c2410c] to-[#ea580c]",
    bgPattern: "bg-orange-800",
  },
  {
    id: "fasilitator",
    title: "Fasilitator",
    subtitle: "Pendampingan peserta, pemantauan plotting tenda & FGD, grafik presensi serta perizinan sesi",
    badge: "Pendamping",
    icon: Users,
    cardGradient: "from-[#4338ca] to-[#6366f1]",
    bgPattern: "bg-indigo-800",
  },
];

interface AuthRoleModalProps {
  isOpen: boolean;
  onLoginSuccess: (user: UserSession) => void;
}

export default function AuthRoleModal({ isOpen, onLoginSuccess }: AuthRoleModalProps) {
  const [selectedRole, setSelectedRole] = useState<RoleConfig | null>(null);
  const [namaLengkap, setNamaLengkap] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Reset modal state when opening
  useEffect(() => {
    if (isOpen) {
      setSelectedRole(null);
      setNamaLengkap("");
      setErrorMessage(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSelectRole = (role: RoleConfig) => {
    setSelectedRole(role);
    setErrorMessage(null);
    setNamaLengkap("");
  };

  const handleBackToRoles = () => {
    setSelectedRole(null);
    setErrorMessage(null);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRole) return;

    const cleanInputName = namaLengkap.trim();
    if (!cleanInputName) {
      setErrorMessage("Silakan masukkan Nama Lengkap Anda.");
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      // 1. Check in Supabase table 'pengguna' (case-insensitive query)
      const { data, error } = await supabase
        .from("pengguna")
        .select("*")
        .ilike("nama_lengkap", cleanInputName);

      let authenticatedUser: any = null;

      if (!error && data && data.length > 0) {
        // Find user with matching role (case-insensitive)
        const matchRole = data.find(
          (u: any) =>
            String(u.role || "").trim().toLowerCase() === selectedRole.id.toLowerCase()
        );

        if (matchRole) {
          authenticatedUser = matchRole;
        } else {
          // User exists in database but under a different role
          const actualRole = data[0].role || "-";
          const matchedCfg = ROLES_CONFIG.find(
            (r) => r.id.toLowerCase() === actualRole.toLowerCase()
          );
          const roleDisplay = matchedCfg ? matchedCfg.title : actualRole;

          setErrorMessage(
            `Nama "${cleanInputName}" terdaftar sebagai role "${roleDisplay}". Silakan pilih role "${roleDisplay}" untuk masuk.`
          );
          setLoading(false);
          return;
        }
      }

      // 2. Default Initial Account Fallback (Angie Seprisa Pamungkas -> Kesekretariatan)
      // This ensures Angie can log in immediately even if database table is not yet migrated!
      if (!authenticatedUser) {
        const isDefaultAngie =
          cleanInputName.toLowerCase() === "angie seprisa pamungkas" &&
          selectedRole.id === "kesekertariatan";

        if (isDefaultAngie) {
          authenticatedUser = {
            id: 1,
            nama_lengkap: "Angie Seprisa Pamungkas",
            role: "kesekertariatan",
            status: "aktif",
          };
        }
      }

      // 3. If still not found, check localStorage local users
      if (!authenticatedUser) {
        const localUsersStr = localStorage.getItem("cai_local_pengguna");
        if (localUsersStr) {
          try {
            const localUsers = JSON.parse(localUsersStr);
            const foundLocal = localUsers.find(
              (u: any) =>
                u.nama_lengkap.trim().toLowerCase() === cleanInputName.toLowerCase() &&
                u.role.trim().toLowerCase() === selectedRole.id.toLowerCase()
            );
            if (foundLocal) {
              authenticatedUser = foundLocal;
            }
          } catch (e) {}
        }
      }

      // 4. Handle Result
      if (authenticatedUser) {
        const userSession: UserSession = {
          id: authenticatedUser.id || Date.now(),
          nama_lengkap: authenticatedUser.nama_lengkap || cleanInputName,
          role: selectedRole.id,
          role_label: selectedRole.title,
          login_at: new Date().toISOString(),
        };

        // Persist session
        localStorage.setItem("cai_current_user", JSON.stringify(userSession));
        onLoginSuccess(userSession);
      } else {
        setErrorMessage(
          `Nama "${cleanInputName}" belum terdaftar di database untuk role ${selectedRole.title}. Pastikan penulisan nama lengkap sudah sesuai.`
        );
      }
    } catch (err: any) {
      console.error("Auth error:", err);

      // Offline / Connection fallback for Angie Seprisa Pamungkas
      if (
        cleanInputName.toLowerCase() === "angie seprisa pamungkas" &&
        selectedRole.id === "kesekertariatan"
      ) {
        const userSession: UserSession = {
          id: 1,
          nama_lengkap: "Angie Seprisa Pamungkas",
          role: "kesekertariatan",
          role_label: "Kesekretariatan",
          login_at: new Date().toISOString(),
        };
        localStorage.setItem("cai_current_user", JSON.stringify(userSession));
        onLoginSuccess(userSession);
        return;
      }

      setErrorMessage(
        "Gagal memverifikasi pengguna dari database. Silakan periksa koneksi atau coba lagi."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-xl w-full overflow-hidden animate-in fade-in zoom-in duration-200 my-auto">
        {/* MODAL HEADER */}
        <div className="bg-[#203598] text-white p-5 sm:p-6 relative overflow-hidden">
          {/* Subtle background circles */}
          <div className="absolute -top-12 -right-12 w-36 h-36 bg-white/10 rounded-full blur-xl pointer-events-none" />
          <div className="absolute -bottom-12 -left-12 w-36 h-36 bg-blue-400/10 rounded-full blur-xl pointer-events-none" />

          <div className="relative z-10 flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-white p-1 shadow-md shrink-0 flex items-center justify-center">
              <Image
                src="https://vutuiyhwpnxkcxsgcypu.supabase.co/storage/v1/object/public/CAI%202026/Logo/logo%20CAI%2047.png"
                alt="Logo CAI 2026"
                width={40}
                height={40}
                className="object-contain"
                referrerPolicy="no-referrer"
                unoptimized
              />
            </div>
            <div>
              <span className="text-[10px] font-extrabold uppercase tracking-widest text-blue-200 bg-white/10 px-2 py-0.5 rounded-full border border-white/20">
                Sistem Presensi CAI 2026
              </span>
              <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white mt-1">
                {selectedRole ? "Verifikasi Nama Pengguna" : "Pilih Role Akses"}
              </h2>
              <p className="text-xs text-blue-100/90 mt-0.5">
                {selectedRole
                  ? `Masuk sebagai ${selectedRole.title} menggunakan nama lengkap Anda`
                  : "Silakan pilih peran Anda untuk membuka menu yang sesuai"}
              </p>
            </div>
          </div>
        </div>

        {/* MODAL BODY */}
        <div className="p-4 sm:p-6 max-h-[72vh] overflow-y-auto">
          {!selectedRole ? (
            /* STEP 1: ROLE SELECTION CARDS (Styled like reference image) */
            <div className="space-y-3">
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider px-1">
                Daftar Role Pengguna:
              </div>

              <div className="grid grid-cols-1 gap-2.5">
                {ROLES_CONFIG.map((role) => {
                  const IconComp = role.icon;
                  return (
                    <div
                      key={role.id}
                      onClick={() => handleSelectRole(role)}
                      className="group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white hover:border-[#203598] hover:shadow-lg transition-all duration-200 cursor-pointer p-4 flex items-center justify-between gap-3.5"
                    >
                      {/* Left accent strip */}
                      <div
                        className={`absolute inset-y-0 left-0 w-2 bg-gradient-to-b ${role.cardGradient} opacity-90 group-hover:w-3 transition-all`}
                      />

                      <div className="flex items-center gap-3.5 pl-2">
                        <div
                          className={`w-11 h-11 rounded-xl bg-gradient-to-br ${role.cardGradient} text-white flex items-center justify-center shadow-sm shrink-0 group-hover:scale-105 transition-transform`}
                        >
                          <IconComp className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-extrabold text-sm sm:text-base text-slate-900 group-hover:text-[#203598] transition-colors">
                              {role.title}
                            </h3>
                            <span className="text-[10px] font-bold text-slate-600 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full">
                              {role.badge}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 line-clamp-2 mt-0.5 leading-relaxed">
                            {role.subtitle}
                          </p>
                        </div>
                      </div>

                      <div className="w-8 h-8 rounded-full bg-slate-100 group-hover:bg-[#203598] text-slate-400 group-hover:text-white flex items-center justify-center shrink-0 transition-colors shadow-2xs">
                        <ChevronRight className="w-4 h-4" />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            /* STEP 2: USERNAME INPUT FORM */
            <form onSubmit={handleLogin} className="space-y-4">
              {/* Selected Role Banner */}
              <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-10 h-10 rounded-xl bg-gradient-to-br ${selectedRole.cardGradient} text-white flex items-center justify-center shadow-xs shrink-0`}
                  >
                    <selectedRole.icon className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                      Role Dipilih:
                    </span>
                    <span className="font-extrabold text-sm text-slate-900">
                      {selectedRole.title}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleBackToRoles}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 transition-colors shadow-2xs flex items-center gap-1.5 cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Ganti Role</span>
                </button>
              </div>

              {/* Error Message */}
              {errorMessage && (
                <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl flex items-start gap-2.5 text-rose-800 text-xs animate-in fade-in">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <p className="font-bold">Verifikasi Gagal</p>
                    <p className="text-[11px] leading-relaxed text-rose-700">
                      {errorMessage}
                    </p>
                  </div>
                </div>
              )}

              {/* Input Field Nama Lengkap */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700">
                  Nama Lengkap (Username) <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    autoFocus
                    placeholder="Contoh: Angie Seprisa Pamungkas"
                    value={namaLengkap}
                    onChange={(e) => setNamaLengkap(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 text-xs sm:text-sm bg-white border border-slate-300 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#203598] focus:border-[#203598] text-slate-900 font-medium placeholder:text-slate-400 shadow-2xs"
                  />
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-400 px-1 pt-0.5">
                  <span>* Bebas menggunakan huruf besar atau huruf kecil</span>
                  {selectedRole.id === "kesekertariatan" && (
                    <button
                      type="button"
                      onClick={() => setNamaLengkap("angie seprisa pamungkas")}
                      className="text-[#203598] hover:underline font-semibold cursor-pointer"
                    >
                      Gunakan Akun Angie
                    </button>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={handleBackToRoles}
                  disabled={loading}
                  className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Kembali
                </button>
                <button
                  type="submit"
                  disabled={loading || !namaLengkap.trim()}
                  className="px-6 py-2.5 rounded-xl text-xs sm:text-sm font-extrabold text-white bg-[#203598] hover:bg-[#1a2c7d] disabled:opacity-50 transition-all shadow-md flex items-center gap-2 cursor-pointer active:scale-95"
                >
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <ShieldCheck className="w-4 h-4" />
                  )}
                  <span>{loading ? "Memverifikasi..." : "Masuk ke Sistem"}</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
