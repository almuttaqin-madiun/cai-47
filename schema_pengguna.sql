-- ==============================================================================
-- SQL DDL & SEED DATA UNTUK TABEL PENGGUNA & ROLE (SUPABASE POSTGRESQL)
-- ==============================================================================
-- Jalankan kode SQL ini langsung di Supabase SQL Editor:

-- 1. Buat Tabel 'pengguna'
CREATE TABLE IF NOT EXISTS public.pengguna (
    id BIGSERIAL PRIMARY KEY,
    nama_lengkap TEXT NOT NULL UNIQUE,
    role VARCHAR(50) NOT NULL, -- kesekertariatan, acara, operator, steering committee, organizing committee, fasilitator
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Buat Index untuk pencarian nama case-insensitive yang cepat
CREATE INDEX IF NOT EXISTS idx_pengguna_nama_lengkap_lower 
ON public.pengguna (LOWER(nama_lengkap));

-- 3. Aktifkan Row Level Security (RLS)
ALTER TABLE public.pengguna ENABLE ROW LEVEL SECURITY;

-- 4. Kebijakan RLS: Pengguna aplikasi dapat membaca (SELECT) data untuk verifikasi login
CREATE POLICY "Allow public read access to pengguna" 
ON public.pengguna 
FOR SELECT 
USING (true);

-- (Catatan: Input / Insert / Update / Delete hanya bisa dilakukan dari Dashboard/SQL Database langsung)

-- 5. Masukkan Data Pengguna Pertama (Kesekretariatan: Angie Seprisa Pamungkas)
INSERT INTO public.pengguna (nama_lengkap, role)
VALUES 
    ('Angie Seprisa Pamungkas', 'kesekertariatan')
ON CONFLICT (nama_lengkap) 
DO UPDATE SET role = EXCLUDED.role;

-- Contoh data tambahan (opsional):
-- INSERT INTO public.pengguna (nama_lengkap, role) VALUES 
--     ('Ahmad Panitia Acara', 'acara'),
--     ('Budi Operator NFC', 'operator'),
--     ('Citra Steering Committee', 'steering committee'),
--     ('Dedi Organizing Committee', 'organizing committee'),
--     ('Eka Fasilitator Kelompok', 'fasilitator');
