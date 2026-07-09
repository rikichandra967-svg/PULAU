-- ============================================================
-- SKEMA DATABASE: PLATFORM EKSPEDISI (PostgreSQL)
-- Fase 1 - MVP: master wilayah, user multi-role, shipment, tracking, payment
-- ============================================================

-- Bersihkan (hanya untuk development, hapus di production)
-- DROP SCHEMA public CASCADE; CREATE SCHEMA public;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ------------------------------------------------------------
-- 1. MASTER WILAYAH
-- ------------------------------------------------------------

CREATE TABLE provinces (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(100) NOT NULL,
    island_zone VARCHAR(30) NOT NULL
    -- island_zone dipakai sebagai basis kalkulasi ongkir & routing hub:
    -- 'sumatera' | 'jawa' | 'bali_nusa' | 'kalimantan' | 'sulawesi' | 'maluku_papua'
);

CREATE TABLE cities (
    id          SERIAL PRIMARY KEY,
    province_id INTEGER NOT NULL REFERENCES provinces(id),
    name        VARCHAR(100) NOT NULL,
    is_hub      BOOLEAN NOT NULL DEFAULT FALSE, -- true jika kota ini punya hub distribusi
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_cities_province ON cities(province_id);

-- ------------------------------------------------------------
-- 2. USERS & ROLE (customer, courier, agent, admin)
-- ------------------------------------------------------------

CREATE TYPE user_role AS ENUM ('customer', 'courier', 'agent', 'admin');

CREATE TABLE users (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name          VARCHAR(150) NOT NULL,
    email         VARCHAR(150) UNIQUE NOT NULL,
    phone         VARCHAR(20) UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role          user_role NOT NULL DEFAULT 'customer',
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Profil tambahan per role (1-1 dengan users, dipisah agar users tetap ramping)

CREATE TABLE customers (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    default_address TEXT,
    default_city_id INTEGER REFERENCES cities(id)
);

CREATE TABLE couriers (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id       UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    city_id       INTEGER NOT NULL REFERENCES cities(id), -- wilayah operasional kurir
    vehicle_type  VARCHAR(50), -- motor, mobil box, dll
    status        VARCHAR(20) NOT NULL DEFAULT 'offline', -- offline | available | on_delivery
    rating        NUMERIC(2,1) DEFAULT 5.0
);

CREATE TABLE agents (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    city_id         INTEGER NOT NULL REFERENCES cities(id),
    outlet_name     VARCHAR(150) NOT NULL,
    address         TEXT NOT NULL,
    commission_rate NUMERIC(5,2) NOT NULL DEFAULT 5.00 -- persen
);

-- ------------------------------------------------------------
-- 3. HUB / GUDANG & RUTE ANTAR HUB (untuk Fase 3, disiapkan dari awal)
-- ------------------------------------------------------------

CREATE TABLE warehouses (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    city_id     INTEGER NOT NULL REFERENCES cities(id),
    name        VARCHAR(150) NOT NULL,
    capacity    INTEGER NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE routes (
    id              SERIAL PRIMARY KEY,
    origin_city_id      INTEGER NOT NULL REFERENCES cities(id),
    destination_city_id INTEGER NOT NULL REFERENCES cities(id),
    transport_type  VARCHAR(30) NOT NULL, -- truck | air_cargo | ship | ferry
    estimated_hours INTEGER NOT NULL
);

-- ------------------------------------------------------------
-- 4. TARIF (basis kalkulasi ongkir, per kombinasi zona pulau + layanan)
-- ------------------------------------------------------------

CREATE TYPE service_type AS ENUM ('regular', 'express', 'same_day', 'cargo');

CREATE TABLE tariffs (
    id              SERIAL PRIMARY KEY,
    origin_zone      VARCHAR(30) NOT NULL,
    destination_zone VARCHAR(30) NOT NULL,
    service_type     service_type NOT NULL,
    base_price       NUMERIC(12,2) NOT NULL,   -- biaya dasar
    price_per_kg     NUMERIC(12,2) NOT NULL,   -- biaya per kg
    estimated_days_min INTEGER NOT NULL,
    estimated_days_max INTEGER NOT NULL,
    UNIQUE (origin_zone, destination_zone, service_type)
);

-- ------------------------------------------------------------
-- 5. SHIPMENTS (inti sistem)
-- ------------------------------------------------------------

CREATE TYPE shipment_status AS ENUM (
    'created',          -- paket dibuat
    'picked_up',        -- dijemput kurir
    'at_origin_hub',    -- sampai gudang asal
    'in_transit',       -- dalam perjalanan antar hub
    'at_destination_hub', -- sampai kota tujuan
    'out_for_delivery', -- sedang diantar
    'delivered',        -- berhasil diterima
    'cancelled',
    'returned'
);

CREATE TABLE shipments (
    id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    resi_number        VARCHAR(30) UNIQUE NOT NULL,

    customer_id        UUID REFERENCES customers(id),

    sender_name        VARCHAR(150) NOT NULL,
    sender_phone       VARCHAR(20) NOT NULL,
    sender_address     TEXT NOT NULL,
    origin_city_id     INTEGER NOT NULL REFERENCES cities(id),

    receiver_name       VARCHAR(150) NOT NULL,
    receiver_phone       VARCHAR(20) NOT NULL,
    receiver_address     TEXT NOT NULL,
    destination_city_id  INTEGER NOT NULL REFERENCES cities(id),

    weight_kg          NUMERIC(8,2) NOT NULL,
    length_cm          NUMERIC(8,2),
    width_cm           NUMERIC(8,2),
    height_cm          NUMERIC(8,2),

    service_type        service_type NOT NULL,
    price               NUMERIC(12,2) NOT NULL,
    status               shipment_status NOT NULL DEFAULT 'created',

    assigned_courier_id UUID REFERENCES couriers(id),
    origin_agent_id      UUID REFERENCES agents(id), -- jika input via drop point

    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_shipments_resi ON shipments(resi_number);
CREATE INDEX idx_shipments_customer ON shipments(customer_id);
CREATE INDEX idx_shipments_status ON shipments(status);

-- ------------------------------------------------------------
-- 6. TRACKING HISTORY (log setiap perubahan status - sumber tracking realtime)
-- ------------------------------------------------------------

CREATE TABLE tracking_history (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shipment_id   UUID NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
    status        shipment_status NOT NULL,
    location_note VARCHAR(255),          -- contoh: "Hub Jakarta", "Kurir Bali"
    description   TEXT,
    created_by    UUID REFERENCES users(id), -- kurir/admin yang update
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tracking_shipment ON tracking_history(shipment_id);
CREATE INDEX idx_tracking_created_at ON tracking_history(created_at);

-- ------------------------------------------------------------
-- 7. PAYMENTS
-- ------------------------------------------------------------

CREATE TYPE payment_method AS ENUM ('bank_transfer', 'e_wallet', 'virtual_account', 'cod');
CREATE TYPE payment_status AS ENUM ('pending', 'paid', 'failed', 'refunded');

CREATE TABLE payments (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shipment_id   UUID NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
    method        payment_method NOT NULL,
    amount        NUMERIC(12,2) NOT NULL,
    status        payment_status NOT NULL DEFAULT 'pending',
    paid_at       TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_payments_shipment ON payments(shipment_id);

-- ============================================================
-- SEED DATA MINIMAL (contoh zona pulau & tarif dasar)
-- ============================================================

INSERT INTO provinces (name, island_zone) VALUES
    ('Sumatera Utara', 'sumatera'),
    ('DKI Jakarta', 'jawa'),
    ('Bali', 'bali_nusa');

INSERT INTO cities (province_id, name, is_hub) VALUES
    (1, 'Medan', TRUE),
    (2, 'Jakarta', TRUE),
    (3, 'Denpasar', TRUE);

-- Tarif contoh: dalam zona sama vs beda zona, per jenis layanan
INSERT INTO tariffs (origin_zone, destination_zone, service_type, base_price, price_per_kg, estimated_days_min, estimated_days_max) VALUES
    ('jawa', 'jawa', 'regular', 8000, 3000, 1, 2),
    ('jawa', 'jawa', 'express', 15000, 5000, 1, 1),
    ('sumatera', 'jawa', 'regular', 15000, 6000, 3, 5),
    ('sumatera', 'bali_nusa', 'regular', 20000, 7000, 5, 7),
    ('sumatera', 'bali_nusa', 'express', 35000, 10000, 2, 3),
    ('jawa', 'bali_nusa', 'regular', 12000, 4500, 2, 3);
