-- ============================================================================
-- RADJAfm 101.8 FM - Supabase Database Schema & Row Level Security (RLS) Setup
-- Jalankan script ini di Supabase Dashboard -> SQL Editor
-- ============================================================================

-- 1. Tabel Pengaturan Stream Global (studio_settings)
CREATE TABLE IF NOT EXISTS public.studio_settings (
  id integer PRIMARY KEY DEFAULT 1,
  stream_url text NOT NULL DEFAULT 'https://ice1.somafm.com/indiepop-128-mp3',
  quality text NOT NULL DEFAULT 'HD 128kbps',
  frequency text NOT NULL DEFAULT '101.8 FM',
  updated_at timestamptz DEFAULT now()
);

-- 2. Tabel Profil Penyiar Global (announcers)
CREATE TABLE IF NOT EXISTS public.announcers (
  id text PRIMARY KEY,
  name text NOT NULL,
  show text NOT NULL,
  time text NOT NULL,
  bio text DEFAULT '',
  tag text DEFAULT 'Host RADJAfm',
  social text DEFAULT '@radjafm',
  online boolean DEFAULT false,
  avatar text DEFAULT '',
  updated_at timestamptz DEFAULT now()
);

-- 3. Pastikan Kolom Status Baca & Metadata Jadwal Tersedia
ALTER TABLE public.requests ADD COLUMN IF NOT EXISTS is_read boolean DEFAULT false;
ALTER TABLE public.schedules ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.schedules ADD COLUMN IF NOT EXISTS genre text;
ALTER TABLE public.schedules ADD COLUMN IF NOT EXISTS time_slot text;

-- 4. Aktifkan Row Level Security (RLS) pada Semua Tabel
ALTER TABLE public.requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.studio_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcers ENABLE ROW LEVEL SECURITY;

-- 5. Kebijakan RLS Tabel `requests`
-- Pendengar publik (anon) dapat mengirim request (INSERT) & melihat feed (SELECT)
DROP POLICY IF EXISTS "Public anon can insert requests" ON public.requests;
CREATE POLICY "Public anon can insert requests"
  ON public.requests FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Public anon can read requests" ON public.requests;
CREATE POLICY "Public anon can read requests"
  ON public.requests FOR SELECT
  TO anon, authenticated
  USING (true);

-- Hanya Admin (authenticated) yang boleh UPDATE (tandai dibaca) & DELETE pesan
DROP POLICY IF EXISTS "Authenticated admin full access requests" ON public.requests;
CREATE POLICY "Authenticated admin full access requests"
  ON public.requests FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- 6. Kebijakan RLS Tabel `schedules`
-- Pendengar publik (anon) hanya bisa melihat jadwal (SELECT)
DROP POLICY IF EXISTS "Public anon can read schedules" ON public.schedules;
CREATE POLICY "Public anon can read schedules"
  ON public.schedules FOR SELECT
  TO anon, authenticated
  USING (true);

-- Hanya Admin (authenticated) yang boleh menambah/mengubah/menghapus jadwal
DROP POLICY IF EXISTS "Authenticated admin full access schedules" ON public.schedules;
CREATE POLICY "Authenticated admin full access schedules"
  ON public.schedules FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- 7. Kebijakan RLS Tabel `studio_settings` & `announcers`
DROP POLICY IF EXISTS "Public anon can read studio_settings" ON public.studio_settings;
CREATE POLICY "Public anon can read studio_settings"
  ON public.studio_settings FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Authenticated admin full access studio_settings" ON public.studio_settings;
CREATE POLICY "Authenticated admin full access studio_settings"
  ON public.studio_settings FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Public anon can read announcers" ON public.announcers;
CREATE POLICY "Public anon can read announcers"
  ON public.announcers FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Authenticated admin full access announcers" ON public.announcers;
CREATE POLICY "Authenticated admin full access announcers"
  ON public.announcers FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

