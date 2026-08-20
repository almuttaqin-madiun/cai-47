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

