// 1️⃣ Imports and setup
import express from "express";
import mysql from "mysql2/promise";
import fs from "fs";
import dotenv from "dotenv";
import cors from "cors";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 4000;

// 2️⃣ Connect to TiDB
const caCert = fs.readFileSync(process.env.CA_PATH);

const db = await mysql.createConnection({
  uri: process.env.DATABASE_URL,
  ssl: { ca: caCert, minVersion: "TLSv1.2" },
  decimalNumbers: true, // force DECIMAL -> Number
});

console.log("Connected to TiDB Cloud");

// 3️⃣ Root route
app.get("/", (req, res) => {
  res.send("Manna Map API connected to TiDB Cloud");
});

// 4️⃣ Fetch all wards + their complexes + average rating
app.get("/api/wards", async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT 
        w.ward_id,
        w.name AS ward_name,
        GROUP_CONCAT(DISTINCT c.name ORDER BY c.name SEPARATOR ', ') AS complexes,
        COALESCE(ROUND(AVG(r.rating), 2), 0) AS avg_rating
      FROM Ward w
      LEFT JOIN Ward_has_Complex whc ON w.ward_id = whc.ward_id
      LEFT JOIN Complex c ON c.complex_id = whc.complex_id
      LEFT JOIN Review r ON r.ward_id = w.ward_id
      GROUP BY w.ward_id, w.name
      ORDER BY w.ward_id;
    `);
    res.json(rows);
  } catch (err) {
    console.error("❌ Error fetching wards:", err);
    res.status(500).json({ error: "Error fetching wards" });
  }
});

// 5️⃣ Fetch reviews for a ward
app.get("/api/reviews/:wardId", async (req, res) => {
  const { wardId } = req.params;
  try {
    const [rows] = await db.query(
      "SELECT * FROM Review WHERE ward_id = ? ORDER BY date DESC",
      [wardId]
    );
    res.json(rows);
  } catch (err) {
    console.error("❌ Error fetching reviews:", err);
    res.status(500).json({ error: "Error fetching reviews" });
  }
});

// 6️⃣ Add a review
app.post("/api/reviews", async (req, res) => {
  const { reviewer, rating, comment, ward_id } = req.body;
  console.log("📦 Received review body:", req.body);

  try {
    if (!ward_id || !rating) {
      throw new Error("ward_id and rating are required");
    }

    const [result] = await db.query(
      "INSERT INTO Review (reviewer, rating, comment, date, ward_id) VALUES (?, ?, ?, CURDATE(), ?)",
      [reviewer || "Anonymous", rating, comment || "", ward_id]
    );

    console.log("✅ Review inserted:", result);
    res.json({ success: true, review_id: result.insertId });
  } catch (err) {
    console.error("❌ Error adding review:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 7️⃣ Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
