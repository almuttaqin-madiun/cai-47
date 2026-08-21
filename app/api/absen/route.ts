import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAllUidCandidates } from "@/lib/utils";

export const dynamic = "force-dynamic";

// Inisialisasi Supabase Client (Gunakan SUPABASE_SERVICE_ROLE_KEY jika ada untuk bypass RLS di server)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://vutuiyhwpnxkcxsgcypu.supabase.co";
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "sb_publishable_cTSP_1BUjITwKFn507y9WA_9aI7Mly4";

const supabase = createClient(supabaseUrl, supabaseKey);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { serial_number, sesi_nama } = body;

    if (!serial_number || typeof serial_number !== "string" || !serial_number.trim()) {
      return NextResponse.json(
        { success: false, message: "Serial number (UID) kartu NFC tidak valid." },
        { status: 400 }
      );
    }

    const cleanUid = serial_number.trim();
    const uidCandidates = getAllUidCandidates(cleanUid);

    // 1. Cari data peserta di Supabase tabel 'nfc_peserta'
    let namaPengguna = "";
    let pesertaId = null;

    // A. Query nfc_peserta by nfc_uid candidates
    const { data: nfcDataList, error: nfcErr } = await supabase
      .from("nfc_peserta")
      .select("*")
      .in("nfc_uid", uidCandidates);

    if (!nfcErr && nfcDataList && nfcDataList.length > 0) {
      const nfcRecord = nfcDataList[0];
      namaPengguna = nfcRecord.nama || nfcRecord.nama_peserta || "";
      pesertaId = nfcRecord.peserta_id || nfcRecord.id;

      // Jika nama di nfc_peserta belum terisi tapi ada peserta_id, ambil dari tabel 'peserta'
      if (!namaPengguna && nfcRecord.peserta_id) {
        const { data: pDetail } = await supabase
          .from("peserta")
          .select("nama, nama_peserta")
          .eq("id", nfcRecord.peserta_id)
          .maybeSingle();

        if (pDetail) {
          namaPengguna = pDetail.nama || pDetail.nama_peserta || "";
        }
      }
    }

    // B. Search nfc_peserta by ilike or trim if exact match failed
    if (!namaPengguna) {
      const { data: nfcAll } = await supabase.from("nfc_peserta").select("*").limit(500);
      if (nfcAll && nfcAll.length > 0) {
        const found = nfcAll.find((item: any) => {
          const u = String(item.nfc_uid || "").trim();
          return uidCandidates.some((cand) => cand.toLowerCase() === u.toLowerCase());
        });
        if (found) {
          namaPengguna = found.nama || found.nama_peserta || "";
          pesertaId = found.peserta_id || found.id;
          if (!namaPengguna && found.peserta_id) {
            const { data: pDetail } = await supabase
              .from("peserta")
              .select("nama, nama_peserta")
              .eq("id", found.peserta_id)
              .maybeSingle();

            if (pDetail) {
              namaPengguna = pDetail.nama || pDetail.nama_peserta || "";
            }
          }
        }
      }
    }

    // C. Fallback query tabel 'peserta' langsung
    if (!namaPengguna) {
      const { data: fallbackData } = await supabase
        .from("peserta")
        .select("*")
        .or(uidCandidates.map((u) => `nfc_uid.eq.${u},serial_number.eq.${u}`).join(","))
        .maybeSingle();

      if (fallbackData) {
        namaPengguna = fallbackData.nama || fallbackData.nama_peserta || "";
        pesertaId = fallbackData.id;
      }
    }

    // Jika peserta tidak ditemukan di database (Identitas tidak dikenal)
    if (!namaPengguna) {
      return NextResponse.json(
        {
          success: false,
          isUnknown: true,
          message: `Identitas tidak dikenal! Kartu NFC (UID: ${cleanUid}) belum terdaftar di database nfc_peserta.`,
          serial_number: cleanUid,
        },
        { status: 404 }
      );
    }

    // Determine jadwal / kategori (makan / sholat / materi)
    let jenisJadwal = body.jadwal || body.kategori || "materi";
    if (!body.jadwal && !body.kategori && sesi_nama) {
      const lowerSesi = String(sesi_nama).toLowerCase();
      if (
        lowerSesi.includes("makan") ||
        lowerSesi.includes("sarapan") ||
        lowerSesi.includes("prasmanan") ||
        lowerSesi.includes("konsumsi")
      ) {
        jenisJadwal = "makan";
      } else if (
        lowerSesi.includes("sholat") ||
        lowerSesi.includes("subuh") ||
        lowerSesi.includes("dzuhur") ||
        lowerSesi.includes("ashar") ||
        lowerSesi.includes("maghrib") ||
        lowerSesi.includes("isya")
      ) {
        jenisJadwal = "sholat";
      }
    }

    // 2. Determine session timing & late attendance status
    let statusKehadiran = "Tepat Waktu";
    let menitTerlambat = 0;
    let batasWaktuTelat = "";

    try {
      const todayStr = new Date().toISOString().slice(0, 10);
      const { data: sesiList } = await supabase
        .from("sesi_absensi")
        .select("*")
        .eq("is_active", true);

      let matchedSesi = sesiList?.find((s: any) => s.nama_sesi === (sesi_nama || ""));
      if (!matchedSesi && sesiList && sesiList.length > 0) {
        matchedSesi = sesiList[0];
      }

      if (matchedSesi) {
        const start = matchedSesi.jam_mulai ? matchedSesi.jam_mulai.slice(0, 5) : "08:00";
        const toleransi = typeof matchedSesi.toleransi_menit === "number" ? matchedSesi.toleransi_menit : 15;
        
        if (matchedSesi.waktu_telat) {
          batasWaktuTelat = matchedSesi.waktu_telat.slice(0, 5);
        } else {
          const [sH, sM] = start.split(":").map(Number);
          const totalM = sH * 60 + sM + toleransi;
          const telatH = Math.floor(totalM / 60) % 24;
          const telatM = totalM % 60;
          batasWaktuTelat = `${String(telatH).padStart(2, "0")}:${String(telatM).padStart(2, "0")}`;
        }

        const now = new Date();
        const currentTotalMinutes = now.getHours() * 60 + now.getMinutes();
        const [bH, bM] = batasWaktuTelat.split(":").map(Number);
        const batasTotalMinutes = bH * 60 + bM;
        const [stH, stM] = start.split(":").map(Number);
        const startTotalMinutes = stH * 60 + stM;

        if (currentTotalMinutes > batasTotalMinutes) {
          statusKehadiran = "Terlambat";
          menitTerlambat = Math.max(0, currentTotalMinutes - startTotalMinutes);
        }
      }
    } catch (sesiErr) {
      console.warn("Gagal mengecek batas telat sesi:", sesiErr);
    }

    // 3. Cek Anti Dobel Absen (Satu nama / kartu dilarang absen 2x dalam sesi yang sama)
    const targetSesiNama = sesi_nama || "Umum";
    try {
      const [checkRw, checkKeh] = await Promise.all([
        supabase
          .from("riwayat_absen")
          .select("id, nama_peserta, serial_number, timestamp")
          .eq("sesi_nama", targetSesiNama)
          .or(`nama_peserta.ilike.${namaPengguna},serial_number.eq.${cleanUid}`)
          .limit(1),
        supabase
          .from("kehadiran")
          .select("id, nama, serial_number, timestamp")
          .eq("sesi_nama", targetSesiNama)
          .or(`nama.ilike.${namaPengguna},serial_number.eq.${cleanUid}`)
          .limit(1),
      ]);

      const hasDuplicate =
        (checkRw.data && checkRw.data.length > 0) ||
        (checkKeh.data && checkKeh.data.length > 0);

      if (hasDuplicate) {
        return NextResponse.json(
          {
            success: false,
            isDuplicate: true,
            message: `Peserta "${namaPengguna}" sudah melakukan presensi pada sesi "${targetSesiNama}".`,
            nama: namaPengguna,
            serial_number: cleanUid,
            sesi_nama: targetSesiNama,
          },
          { status: 409 }
        );
      }
    } catch (checkErr) {
      console.warn("Gagal cek duplikasi presensi di server:", checkErr);
    }

    // 4. Simpan riwayat absensi ke tabel Supabase 'riwayat_absen' (atau 'kehadiran')
    const timestampNow = new Date().toISOString();
    const payloadAbsen = {
      serial_number: cleanUid,
      nama_peserta: namaPengguna,
      peserta_id: pesertaId,
      sesi_nama: targetSesiNama,
      jadwal: jenisJadwal,
      kategori: jenisJadwal,
      timestamp: timestampNow,
      status: "Hadir",
      status_kehadiran: statusKehadiran,
      menit_terlambat: menitTerlambat,
      waktu_telat: batasWaktuTelat,
    };

    // Insert into 'riwayat_absen' with fallback if columns missing
    const saveToRiwayat = async () => {
      const { error } = await supabase.from("riwayat_absen").insert([payloadAbsen]);
      if (error) {
        const { status_kehadiran: _sk, menit_terlambat: _mt, waktu_telat: _wt, jadwal: _j, kategori: _k, ...basicPayload } = payloadAbsen;
        await supabase.from("riwayat_absen").insert([basicPayload]);
      }
    };

    // Insert into 'kehadiran' with fallback if columns missing
    const saveToKehadiran = async () => {
      const { error } = await supabase.from("kehadiran").insert([
        {
          serial_number: cleanUid,
          nama: namaPengguna,
          timestamp: timestampNow,
          sesi_nama: sesi_nama || "Umum",
          jadwal: jenisJadwal,
          kategori: jenisJadwal,
          status_kehadiran: statusKehadiran,
          menit_terlambat: menitTerlambat,
          waktu_telat: batasWaktuTelat,
        },
      ]);
      if (error) {
        await supabase.from("kehadiran").insert([
          {
            serial_number: cleanUid,
            nama: namaPengguna,
            timestamp: timestampNow,
            sesi_nama: sesi_nama || "Umum",
          },
        ]);
      }
    };

    await Promise.allSettled([saveToRiwayat(), saveToKehadiran()]);

    // 4. Kembalikan Response Sukses
    return NextResponse.json({
      success: true,
      message: `Presensi Berhasil! Selamat datang, ${namaPengguna}. (${statusKehadiran})`,
      nama: namaPengguna,
      serial_number: cleanUid,
      timestamp: timestampNow,
      sesi_nama: sesi_nama || "Umum",
      status_kehadiran: statusKehadiran,
      menit_terlambat: menitTerlambat,
      waktu_telat: batasWaktuTelat,
    });
  } catch (err: any) {
    console.error("API /api/absen error:", err);
    return NextResponse.json(
      {
        success: false,
        message: err.message || "Terjadi kesalahan server saat memproses absensi.",
      },
      { status: 500 }
    );
  }
}
