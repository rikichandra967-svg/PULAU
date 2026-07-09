-- ============================================================
-- TAMBAH WILAYAH: KALIMANTAN BARAT (pusat operasi: Nanga Pinoh/Melawi)
-- Jalankan ini di SQL Editor Neon (bukan lewat Git Bash)
-- ============================================================

-- 1. Tambah provinsi Kalimantan Barat
INSERT INTO provinces (name, island_zone)
VALUES ('Kalimantan Barat', 'kalimantan')
ON CONFLICT DO NOTHING;

-- 2. Tambah kota-kota di Kalimantan Barat
--    Nanga Pinoh   = pusat operasi kamu (hub regional)
--    Pontianak     = hub gerbang keluar-masuk pulau (bandara/pelabuhan utama provinsi)
--    Sintang, Sekadau, Sanggau, Ketapang = daerah sekitar Melawi yang dilayani
INSERT INTO cities (province_id, name, is_hub)
SELECT p.id, c.name, c.is_hub
FROM provinces p,
     (VALUES
        ('Nanga Pinoh', TRUE),
        ('Pontianak',   TRUE),
        ('Sintang',     FALSE),
        ('Sekadau',     FALSE),
        ('Sanggau',     FALSE),
        ('Ketapang',    FALSE)
     ) AS c(name, is_hub)
WHERE p.name = 'Kalimantan Barat'
ON CONFLICT DO NOTHING;

-- 3. Tambah tarif untuk zona Kalimantan (ke sesama Kalimantan & ke zona lain)
--    Sesuaikan angka harga di bawah kalau perlu - ini estimasi awal, bisa diubah
--    lagi lewat Dashboard Admin (tab Tarif) kapan saja.
INSERT INTO tariffs (origin_zone, destination_zone, service_type, base_price, price_per_kg, estimated_days_min, estimated_days_max) VALUES
    -- Dalam Kalimantan (misal Nanga Pinoh <-> Sintang, Pontianak, dst)
    ('kalimantan', 'kalimantan', 'regular',  10000, 3000, 1, 3),
    ('kalimantan', 'kalimantan', 'express',  20000, 5000, 1, 1),
    ('kalimantan', 'kalimantan', 'same_day', 30000, 6000, 0, 1),
    ('kalimantan', 'kalimantan', 'cargo',     8000, 1800, 2, 4),

    -- Kalimantan <-> Jawa
    ('kalimantan', 'jawa', 'regular', 25000, 8000, 4, 6),
    ('jawa', 'kalimantan', 'regular', 25000, 8000, 4, 6),
    ('kalimantan', 'jawa', 'express', 40000, 12000, 2, 3),
    ('jawa', 'kalimantan', 'express', 40000, 12000, 2, 3),

    -- Kalimantan <-> Sumatera
    ('kalimantan', 'sumatera', 'regular', 32000, 9500, 5, 7),
    ('sumatera', 'kalimantan', 'regular', 32000, 9500, 5, 7),

    -- Kalimantan <-> Bali & Nusa Tenggara
    ('kalimantan', 'bali_nusa', 'regular', 28000, 8500, 5, 7),
    ('bali_nusa', 'kalimantan', 'regular', 28000, 8500, 5, 7)
ON CONFLICT (origin_zone, destination_zone, service_type) DO NOTHING;
