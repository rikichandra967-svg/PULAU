-- ============================================================
-- TAMBAH TABEL: proof_photos (foto bukti pickup & delivery)
-- Jalankan ini di SQL Editor Neon
-- ============================================================

CREATE TYPE proof_photo_type AS ENUM ('pickup', 'delivery');

CREATE TABLE proof_photos (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shipment_id  UUID NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
    type         proof_photo_type NOT NULL,
    photo_data   TEXT NOT NULL, -- base64 (data URL), sudah dikompres di sisi kurir sebelum upload
    created_by   UUID REFERENCES users(id),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_proof_photos_shipment ON proof_photos(shipment_id);
