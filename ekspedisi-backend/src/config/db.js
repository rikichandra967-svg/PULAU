const { Pool } = require('pg');

// Pool koneksi tunggal dipakai di seluruh aplikasi.
// DATABASE_URL diambil dari .env, contoh format ada di .env.example
//
// SSL: database hosted (Supabase, Neon, dst) mewajibkan koneksi SSL, sedangkan
// PostgreSQL lokal biasanya tidak. Dideteksi otomatis dari connection string.
const isLocalDb = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL || '');

// Pool size: di lingkungan serverless (Vercel), tiap invocation bisa jadi instance
// baru - pool besar disini gampang menghabiskan connection limit database, apalagi
// tanpa pooler eksternal. Kalau connection string sudah menunjuk ke pooler
// (Supabase Supavisor / PgBouncer, port 6543) ini aman dipakai lebih dari 1.
const isServerless = Boolean(process.env.VERCEL);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isLocalDb ? false : { rejectUnauthorized: false },
  max: isServerless ? 1 : 10,
});

pool.on('error', (err) => {
  // Error di koneksi idle tidak boleh mematikan seluruh proses,
  // cukup dicatat agar mudah didiagnosis.
  console.error('Unexpected error pada idle client PostgreSQL', err);
});

module.exports = pool;
