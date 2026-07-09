// Entry point untuk hosting tradisional (Render, VPS, Railway, dst) yang butuh
// proses server menyala terus. Untuk Vercel (serverless), lihat api/index.js
// di root project - itu memakai src/app.js yang sama tanpa app.listen().
const app = require('./app');

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Ekspedisi backend jalan di http://localhost:${PORT}`);
});
