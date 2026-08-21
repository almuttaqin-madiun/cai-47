import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-900 text-white p-4 text-center">
      <h2 className="text-2xl font-bold mb-2">Halaman Tidak Ditemukan</h2>
      <p className="text-slate-400 text-sm mb-4">Halaman yang Anda tuju tidak tersedia.</p>
      <Link href="/" className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-white font-medium text-sm transition-colors">
        Kembali ke Beranda
      </Link>
    </div>
  );
}
