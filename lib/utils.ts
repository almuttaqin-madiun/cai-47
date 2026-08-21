import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Mengubah string menjadi format Capitalize / Title Case (Huruf besar di awal setiap kata)
 * Contoh: "abda zaky fauzi" -> "Abda Zaky Fauzi"
 *         "ABDUL MUJIB" -> "Abdul Mujib"
 */
export function toTitleCase(str: string | null | undefined): string {
  if (!str) return "";
  return String(str)
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Mengonversi UID Heksadesimal NFC (contoh Android Web NFC: "31:79:E8:A7")
 * menjadi format Desimal murni (contoh: "2817030449").
 * 
 * @param hexInput String UID hex dengan/tanpa separator ":"
 * @param reverseBytes Mengurutkan ulang byte (Little Endian) jika USB reader membaca secara terbalik
 */
export function hexToDecimal(hexInput: string, reverseBytes: boolean = true): string {
  if (!hexInput) return "";

  // 1. Bersihkan karakter kontrol (\r, \n, \t), titik dua (:), strip (-), dan spasi
  const cleanInput = String(hexInput)
    .replace(/[\r\n\t]/g, "")
    .trim();
  const cleanHex = cleanInput.replace(/[:\s-]/g, "");

  if (!cleanHex) return "";

  // 2. Jika input sudah berupa string desimal murni, kembalikan langsung
  if (/^\d+$/.test(cleanHex)) {
    return cleanHex;
  }

  // 2b. Jika input berupa angka desimal dengan akhiran huruf (misal "2817250273M" dari scanner/keyboard)
  const onlyDigits = cleanHex.replace(/\D/g, "");
  if (onlyDigits && onlyDigits.length >= 6 && /^\d+[a-zA-Z]?$/.test(cleanHex)) {
    return onlyDigits;
  }

  // 3. Pastikan hanya karakter heksadesimal valid (0-9, a-f, A-F) sebelum konversi BigInt
  if (!/^[0-9a-fA-F]+$/.test(cleanHex)) {
    // Jika ada karakter non-hex, kembalikan angka jika ada, atau kembalikan string bersih tanpa error
    return onlyDigits || cleanInput;
  }

  try {
    let hexToConvert = cleanHex;

    // 4. Balik byte order (Little Endian) jika panjang hex genap (pasangan 2 digit hex / 1 byte)
    if (reverseBytes && cleanHex.length % 2 === 0) {
      const bytes = cleanHex.match(/.{1,2}/g) || [];
      hexToConvert = bytes.reverse().join("");
    }

    // 5. Konversi string Heksadesimal (0x...) ke Desimal menggunakan BigInt
    return BigInt("0x" + hexToConvert).toString(10);
  } catch {
    return cleanHex;
  }
}

/**
 * Menghasilkan semua variasi representasi UID (Hex murni, Hex dengan colon,
 * Desimal Little-Endian, Desimal Big-Endian, Uppercase/Lowercase)
 * agar pencocokan kartu NFC di database selalu 100% akurat dari HP Android maupun USB Reader.
 */
export function getAllUidCandidates(input: string): string[] {
  if (!input) return [];
  const clean = String(input)
    .replace(/[\r\n\t]/g, "")
    .trim();
  if (!clean) return [];

  const candidates = new Set<string>([clean]);
  candidates.add(clean.toLowerCase());
  candidates.add(clean.toUpperCase());

  const stripped = clean.replace(/[:\s-]/g, "");
  if (stripped) {
    candidates.add(stripped);
    candidates.add(stripped.toLowerCase());
    candidates.add(stripped.toUpperCase());
  }

  // Tambahkan variasi digit jika ada karakter tambahan (misal "2817250273M" -> "2817250273")
  const digitsOnly = stripped.replace(/\D/g, "");
  if (digitsOnly && digitsOnly !== stripped) {
    candidates.add(digitsOnly);
    const unpaddedDigits = digitsOnly.replace(/^0+/, "");
    if (unpaddedDigits) candidates.add(unpaddedDigits);
    if (digitsOnly.length < 10) candidates.add(digitsOnly.padStart(10, "0"));
  }

  // Variasi angka desimal murni & penanganan awalan nol (leading zeros)
  const numericTarget = /^\d+$/.test(stripped) ? stripped : /^\d+$/.test(digitsOnly) ? digitsOnly : null;
  if (numericTarget) {
    // Tambahkan variasi tanpa awalan nol (unpadded)
    const unpadded = numericTarget.replace(/^0+/, "");
    if (unpadded) {
      candidates.add(unpadded);
    }
    // Tambahkan variasi padding standar 10-digit dan 8-digit
    if (numericTarget.length < 10) {
      candidates.add(numericTarget.padStart(10, "0"));
    }
    if (numericTarget.length < 8) {
      candidates.add(numericTarget.padStart(8, "0"));
    }

    try {
      const num = BigInt(numericTarget);
      const numStr = num.toString(10);
      candidates.add(numStr);
      candidates.add(numStr.padStart(10, "0"));

      // Format hex Big-Endian
      const rawHex = num.toString(16);
      const paddedHex = rawHex.padStart(Math.ceil(rawHex.length / 2) * 2, "0");
      candidates.add(rawHex);
      candidates.add(rawHex.toLowerCase());
      candidates.add(rawHex.toUpperCase());
      candidates.add(paddedHex.toLowerCase());
      candidates.add(paddedHex.toUpperCase());

      // Format dengan titik dua (colon)
      const colonBig = paddedHex.match(/.{1,2}/g)?.join(":") || "";
      if (colonBig) {
        candidates.add(colonBig.toLowerCase());
        candidates.add(colonBig.toUpperCase());
      }

      // Format hex Little-Endian (dibalik per byte)
      const bytes = paddedHex.match(/.{1,2}/g) || [];
      const revHex = bytes.slice().reverse().join("");
      if (revHex && /^[0-9a-fA-F]+$/.test(revHex)) {
        candidates.add(revHex.toLowerCase());
        candidates.add(revHex.toUpperCase());
        const colonRev = revHex.match(/.{1,2}/g)?.join(":") || "";
        if (colonRev) {
          candidates.add(colonRev.toLowerCase());
          candidates.add(colonRev.toUpperCase());
        }
        // Desimal dari reversed hex
        try {
          const revDec = BigInt("0x" + revHex).toString(10);
          candidates.add(revDec);
          candidates.add(revDec.padStart(10, "0"));
        } catch {}
      }
    } catch {}
  }

  // Jika berupa string heksadesimal murni (misal "31:79:E8:A7" atau "3179e8a7" dari Android NFC)
  if (/^[0-9a-fA-F]+$/.test(stripped)) {
    try {
      const padded = stripped.padStart(Math.ceil(stripped.length / 2) * 2, "0");
      candidates.add(padded.toLowerCase());
      candidates.add(padded.toUpperCase());

      // Colon format
      const colonDirect = padded.match(/.{1,2}/g)?.join(":") || "";
      if (colonDirect) {
        candidates.add(colonDirect.toLowerCase());
        candidates.add(colonDirect.toUpperCase());
      }

      // 1. Big-Endian Decimal (misal 0x3179E8A7 -> 830070951)
      try {
        const decBig = BigInt("0x" + padded).toString(10);
        candidates.add(decBig);
      } catch {}

      // 2. Little-Endian Decimal & Reversed Hex (misal 31 79 E8 A7 -> A7 E8 79 31 -> 2817030449)
      const bytes = padded.match(/.{1,2}/g) || [];
      const revHex = bytes.slice().reverse().join("");
      if (revHex && /^[0-9a-fA-F]+$/.test(revHex)) {
        candidates.add(revHex.toLowerCase());
        candidates.add(revHex.toUpperCase());
        const colonRev = revHex.match(/.{1,2}/g)?.join(":") || "";
        if (colonRev) {
          candidates.add(colonRev.toLowerCase());
          candidates.add(colonRev.toUpperCase());
        }
        try {
          const decLittle = BigInt("0x" + revHex).toString(10);
          candidates.add(decLittle);
        } catch {}
      }
    } catch {}
  }

  return Array.from(candidates).filter(Boolean);
}

/**
 * Mengambil tanggal lokal (YYYY-MM-DD) sesuai zona waktu lokal pengguna (WIB/WITA/WIT),
 * bukan UTC yang dapat bergeser ke hari kemarin saat absensi pagi (00:00 - 06:59 WIB).
 */
export function getLocalDateString(dateInput?: Date | string | number | null): string {
  if (!dateInput) {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  const d = typeof dateInput === "object" ? dateInput : new Date(dateInput);
  if (isNaN(d.getTime())) {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  }

  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Menormalkan nama sesi absensi untuk perbandingan yang konsisten
 * Contoh: "Sesi Materi 1", "materi 1", "Materi 1 " -> "materi 1"
 */
export function normalizeSessionName(name?: string | null): string {
  if (!name) return "umum";
  return String(name)
    .toLowerCase()
    .trim()
    .replace(/^sesi\s+/i, "")
    .replace(/\s+/g, " ");
}

