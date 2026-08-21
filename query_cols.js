const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env.local', 'utf8');
const supabaseUrl = envFile.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const supabaseKey = envFile.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/)[1].trim();

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data: d1, error: e1 } = await supabase.from('riwayat_absen').select('*').limit(1);
  if (e1) console.log("riwayat_absen error:", e1);
  else console.log("riwayat_absen cols:", Object.keys(d1[0] || {}));

  const { data: d2, error: e2 } = await supabase.from('kehadiran').select('*').limit(1);
  if (e2) console.log("kehadiran error:", e2);
  else console.log("kehadiran cols:", Object.keys(d2[0] || {}));
}
check();
