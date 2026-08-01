"use client";

import dynamic from "next/dynamic";

const NFCAttendanceApp = dynamic(() => import("@/components/NFCAttendanceApp"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center min-h-screen bg-slate-900 text-white">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-500"></div>
    </div>
  ),
});

export default function Home() {
  return <NFCAttendanceApp />;
}


