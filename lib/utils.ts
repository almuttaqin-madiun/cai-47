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

  // 1. Bersihkan titik dua (:), strip (-), dan spasi dari string hex
  const cleanHex = hexInput.replace(/[:\s-]/g, "").trim();

  // 2. Jika input sudah berupa string desimal murni, kembalikan langsung
  if (/^\d+$/.test(cleanHex) && !hexInput.includes(":")) {
    return cleanHex;
  }

  try {
    let hexToConvert = cleanHex;

    // 3. Balik byte order (Little Endian) jika panjang hex genap (pasangan 2 digit hex / 1 byte)
    if (reverseBytes && cleanHex.length % 2 === 0) {
      const bytes = cleanHex.match(/.{1,2}/g) || [];
      hexToConvert = bytes.reverse().join("");
    }

    // 4. Konversi string Heksadesimal (0x...) ke Desimal menggunakan BigInt
    return BigInt("0x" + hexToConvert).toString();
  } catch (error) {
    console.error("Gagal mengonversi Hex ke Desimal:", error);
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
  const clean = input.trim();
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

  // Jika berupa string desimal murni (misal "2817030449" dari USB reader)
  if (/^\d+$/.test(stripped)) {
    try {
      const num = BigInt(stripped);
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
      if (revHex) {
        candidates.add(revHex.toLowerCase());
        candidates.add(revHex.toUpperCase());
        const colonRev = revHex.match(/.{1,2}/g)?.join(":") || "";
        if (colonRev) {
          candidates.add(colonRev.toLowerCase());
          candidates.add(colonRev.toUpperCase());
        }
        // Desimal dari reversed hex
        try {
          const revDec = BigInt("0x" + revHex).toString();
          candidates.add(revDec);
        } catch (e) {}
      }
    } catch (e) {}
  }

  // Jika berupa string heksadesimal (misal "31:79:E8:A7" atau "3179e8a7" dari Android NFC)
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
      const decBig = BigInt("0x" + padded).toString(10);
      candidates.add(decBig);

      // 2. Little-Endian Decimal & Reversed Hex (misal 31 79 E8 A7 -> A7 E8 79 31 -> 2817030449)
      const bytes = padded.match(/.{1,2}/g) || [];
      const revHex = bytes.slice().reverse().join("");
      if (revHex) {
        candidates.add(revHex.toLowerCase());
        candidates.add(revHex.toUpperCase());
        const colonRev = revHex.match(/.{1,2}/g)?.join(":") || "";
        if (colonRev) {
          candidates.add(colonRev.toLowerCase());
          candidates.add(colonRev.toUpperCase());
        }
        const decLittle = BigInt("0x" + revHex).toString(10);
        candidates.add(decLittle);
      }
    } catch (e) {}
  }

  return Array.from(candidates).filter(Boolean);
}

