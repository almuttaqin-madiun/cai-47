import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

// Inisialisasi Supabase Client (Gunakan SUPABASE_SERVICE_ROLE_KEY jika ada untuk bypass RLS di server)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://vutuiyhwpnxkcxsgcypu.supabase.co";
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "sb_publishable_cTSP_1BUjITwKFn507y9WA_9aI7Mly4";

const supabase = createClient(supabaseUrl, supabaseKey);

function getUidCandidates(input: string): string[] {
  const clean = input.trim();
  const candidates = new Set<string>([clean]);

  const stripped = clean.replace(/[:\s-]/g, "");
  if (stripped) {
    candidates.add(stripped);
    candidates.add(stripped.toLowerCase());
    candidates.add(stripped.toUpperCase());
  }

  if (/^\d+$/.test(stripped)) {
    try {
      const num = BigInt(stripped);
      const hex = num.toString(16);
      candidates.add(hex);
      candidates.add(hex.toLowerCase());
      candidates.add(hex.toUpperCase());

      const hexColons = hex.padStart(hex.length + (hex.length % 2), "0").match(/.{1,2}/g)?.join(":") || "";
      if (hexColons) {
        candidates.add(hexColons.toLowerCase());
        candidates.add(hexColons.toUpperCase());
      }
    } catch (e) {}
  }

  if (/^[0-9a-fA-F]+$/.test(stripped)) {
    try {
      const dec = BigInt("0x" + stripped).toString(10);
      candidates.add(dec);
    } catch (e) {}
  }

  return Array.from(candidates).filter(Boolean);
}

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
    const uidCandidates = getUidCandidates(cleanUid);

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

    // 2. Simpan riwayat absensi ke tabel Supabase 'riwayat_absen' (atau 'kehadiran')
    const timestampNow = new Date().toISOString();
    const payloadAbsen = {
      serial_number: cleanUid,
      nama_peserta: namaPengguna,
      peserta_id: pesertaId,
      sesi_nama: sesi_nama || "Umum",
      timestamp: timestampNow,
      status: "Hadir",
    };

    // Attempt insert into 'riwayat_absen'
    const { error: insertError } = await supabase.from("riwayat_absen").insert([payloadAbsen]);

    if (insertError) {
      // Fallback insert into 'kehadiran'
      await supabase.from("kehadiran").insert([
        {
          serial_number: cleanUid,
          nama: namaPengguna,
          timestamp: timestampNow,
          sesi_nama: sesi_nama || "Umum",
        },
      ]);
    }

    // 3. Kembalikan Response Sukses
    return NextResponse.json({
      success: true,
      message: `Presensi Berhasil! Selamat datang, ${namaPengguna}.`,
      nama: namaPengguna,
      serial_number: cleanUid,
      timestamp: timestampNow,
      sesi_nama: sesi_nama || "Umum",
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
