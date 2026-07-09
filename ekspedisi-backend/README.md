# Ekspedisi Backend — Fase 1 (MVP Inti)

Backend API inti untuk platform ekspedisi: autentikasi multi-role, kalkulator ongkir,
pembuatan pengiriman + nomor resi otomatis, dan tracking real-time.

Ini adalah **fondasi**, bukan produk jadi. Belum termasuk: dashboard admin/agen,
aplikasi kurir, payment gateway, WebSocket notifikasi, dan sistem hub & routing otomatis
(disiapkan strukturnya di database, tapi logic-nya menyusul di fase berikutnya).

## Struktur folder

```
ekspedisi-backend/
├── db/
│   └── schema.sql          # DDL PostgreSQL: users, shipments, tracking_history, dst
├── src/
│   ├── config/db.js         # koneksi pool PostgreSQL
│   ├── middleware/auth.js   # verifikasi JWT + role guard
│   ├── utils/
│   │   ├── generateResi.js     # generate nomor resi unik
│   │   └── calculateOngkir.js  # kalkulator ongkir berbasis zona pulau
│   ├── controllers/         # logic auth, shipment, tracking
│   ├── routes/               # definisi endpoint Express
│   └── server.js             # entry point
├── package.json
└── .env.example
```

## Cara menjalankan

1. **Siapkan PostgreSQL** (lokal atau cloud, mis. Supabase/Neon/RDS).
2. **Install dependencies**
   ```bash
   npm install
   ```
3. **Konfigurasi environment**
   ```bash
   cp .env.example .env
   # lalu isi DATABASE_URL dan JWT_SECRET di file .env
   ```
4. **Buat schema database**
   ```bash
   psql "$DATABASE_URL" -f db/schema.sql
   # atau: npm run db:init
   ```
5. **Jalankan server**
   ```bash
   npm run dev
   # server jalan di http://localhost:4000
   ```

## Contoh pemakaian API

### 1. Registrasi customer
```bash
curl -X POST http://localhost:4000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Budi Santoso","email":"budi@example.com","password":"rahasia123","phone":"08123456789"}'
```
Response berisi `token` (JWT) — pakai di header `Authorization: Bearer <token>` untuk endpoint yang butuh login.

### 2. Cek ongkir (tanpa login)
```bash
curl -X POST http://localhost:4000/api/shipments/calculate \
  -H "Content-Type: application/json" \
  -d '{"originCityId":1,"destinationCityId":3,"weightKg":2,"serviceType":"regular"}'
```
Response:
```json
{
  "price": 34000,
  "billedWeightKg": 2,
  "estimatedDaysMin": 5,
  "estimatedDaysMax": 7,
  "originZone": "sumatera",
  "destinationZone": "bali_nusa"
}
```

### 3. Buat pengiriman (butuh login)
```bash
curl -X POST http://localhost:4000/api/shipments \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "senderName":"Budi","senderPhone":"08123456789","senderAddress":"Jl. Medan Baru No.1","originCityId":1,
    "receiverName":"Ani","receiverPhone":"08987654321","receiverAddress":"Jl. Denpasar No.2","destinationCityId":3,
    "weightKg":2,"serviceType":"regular"
  }'
```
Response berisi `shipment` lengkap dengan `resi_number` yang digenerate otomatis, contoh: `EKS175201234567890ID`.

### 4. Lacak paket (publik, tanpa login)
```bash
curl http://localhost:4000/api/tracking/EKS175201234567890ID
```

### 5. Update status paket (hanya courier/admin)
```bash
curl -X POST http://localhost:4000/api/tracking/EKS175201234567890ID/update \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token_courier_atau_admin>" \
  -d '{"status":"picked_up","locationNote":"Medan","description":"Paket diambil kurir"}'
```

### 6. Registrasi kurir (butuh cityId)
```bash
curl -X POST http://localhost:4000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Andi","email":"andi@example.com","password":"rahasia123","role":"courier","cityId":1,"vehicleType":"motor"}'
```

### 7. Daftar tugas tersedia untuk kurir (butuh login sebagai courier)
```bash
curl http://localhost:4000/api/shipments/tasks/available \
  -H "Authorization: Bearer <token_courier>"
```

### 8. Klaim tugas & lihat tugas milik sendiri
```bash
curl -X POST http://localhost:4000/api/shipments/EKS175201234567890ID/claim \
  -H "Authorization: Bearer <token_courier>"

curl http://localhost:4000/api/shipments/tasks/mine \
  -H "Authorization: Bearer <token_courier>"
```

### 9. Daftar kota (untuk dropdown)
```bash
curl http://localhost:4000/api/cities
```

### 10. Membuat akun admin pertama (WAJIB lewat SQL, bukan lewat halaman daftar)

Demi keamanan, role `admin` **tidak bisa** didaftarkan lewat endpoint `/api/auth/register` publik.
Cara buat admin pertama:

1. Daftar dulu sebagai customer biasa lewat `customer-website.html` (atau endpoint register dengan role `customer`)
2. Buka SQL Editor di Neon/Supabase, jalankan:
   ```sql
   UPDATE users SET role = 'admin' WHERE email = 'email_kamu@contoh.com';
   ```
3. Login lagi lewat `admin-dashboard.html` dengan email & password yang sama - sekarang sudah jadi admin

### 11. Endpoint admin (butuh login sebagai admin)

```bash
# Statistik dashboard
curl https://pulau.onrender.com/api/admin/stats -H "Authorization: Bearer <token_admin>"

# Semua paket (bisa difilter)
curl "https://pulau.onrender.com/api/admin/shipments?status=in_transit" -H "Authorization: Bearer <token_admin>"

# Tambah/update tarif
curl -X POST https://pulau.onrender.com/api/admin/tariffs \
  -H "Authorization: Bearer <token_admin>" -H "Content-Type: application/json" \
  -d '{"originZone":"jawa","destinationZone":"jawa","serviceType":"cargo","basePrice":20000,"pricePerKg":2000,"estimatedDaysMin":3,"estimatedDaysMax":5}'

# Tambah provinsi & kota
curl -X POST https://pulau.onrender.com/api/admin/provinces \
  -H "Authorization: Bearer <token_admin>" -H "Content-Type: application/json" \
  -d '{"name":"Jawa Barat","islandZone":"jawa"}'
```

## Catatan keamanan (sudah diterapkan di fase ini)
- Password di-hash dengan bcrypt, tidak pernah disimpan plain text.
- Autentikasi pakai JWT dengan masa berlaku (`JWT_EXPIRES_IN`).
- Role guard (`requireRole`) membatasi siapa yang boleh update status paket.
- Harga ongkir selalu dihitung ulang di server saat membuat shipment (client tidak bisa mengirim harga sendiri).
- Insert shipment + tracking history dibungkus transaksi (`BEGIN`/`COMMIT`/`ROLLBACK`) agar konsisten.

## Yang belum ada (untuk fase berikutnya)
- Rate limiting & audit log
- Endpoint admin untuk kelola tarif, wilayah, dan assign kurir ke shipment
- WebSocket untuk push notifikasi status real-time ke customer
- Endpoint upload foto bukti pickup/delivery & signature digital
- Integrasi payment gateway (saat ini tabel `payments` sudah ada di schema tapi belum ada endpoint)
