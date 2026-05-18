// ============================================================
//  HADY — CYBERPUNK DASHBOARD  |  index.js
//  Stack: Node.js + Express + MongoDB Atlas + Vanilla JS
//  Run:   node index.js
//  Env:   MONGO_URI, PORT (optional)
// ============================================================

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const { MongoClient, ObjectId } = require("mongodb");

const app = express();
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || "MONGO_URI=mongodb+srv://hadyVip:hadydbatlas@cluster0.ph1mdzc.mongodb.net/linksDB?retryWrites=true&w=majority";

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const likeLimiter = rateLimit({ windowMs: 60000, max: 3, message: { error: "Too many requests" } });
const commentLimiter = rateLimit({ windowMs: 60000, max: 5, message: { error: "Too many requests" } });
const globalLimiter = rateLimit({ windowMs: 60000, max: 120 });
app.use(globalLimiter);

let db;
async function connectDB() {
  try {
    const client = new MongoClient(MONGO_URI, { serverSelectionTimeoutMS: 8000 });
    await client.connect();
    db = client.db("linksDB");

    const users = db.collection("users");
    const exists = await users.findOne({ username: "hady" });
    if (!exists) {
      await users.insertOne({
        username: "hady",
        bio: "Developer & creator. Building digital experiences that leave a mark.",
        location: "Internet",
        verified: true,
        role: "Full-Stack Developer",
        stack: ["Node.js", "MongoDB", "JavaScript", "Express", "CSS"],
        avatar: "https://cdn.dix.lat/me/ed69b876-ba2f-4a31-a418-707a07f0fc85.jpg",
        createdAt: new Date(),
      });
    }

    const visits = db.collection("visits");
    const vc = await visits.findOne({ _id: "counter" });
    if (!vc) await visits.insertOne({ _id: "counter", count: 0 });

    const shares = db.collection("shares");
    const sc = await shares.findOne({ _id: "counter" });
    if (!sc) await shares.insertOne({ _id: "counter", count: 0 });

    console.log("[DB] MongoDB Atlas connected ✓");
  } catch (err) {
    console.error("[DB] Connection failed:", err.message);
    console.log("[DB] Running in demo mode (no persistence)");
    db = null;
  }
}

const mem = {
  likes: new Set(),
  comments: [],
  shares: 0,
  visits: 0,
  profile: {
    username: "hady",
    bio: "Developer & creator. Building digital experiences that leave a mark.",
    location: "Internet",
    verified: true,
    role: "Full-Stack Developer",
    stack: ["Node.js", "MongoDB", "JavaScript", "Express", "CSS"],
    avatar: "https://cdn.dix.lat/me/ed69b876-ba2f-4a31-a418-707a07f0fc85.jpg",
  },
};

function getIP(req) {
  return req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket.remoteAddress || "unknown";
}

function sanitize(str, max = 200) {
  if (typeof str !== "string") return "";
  return str.replace(/[<>]/g, "").trim().slice(0, max);
}

// ── API Routes ────────────────────────────────────────────────

app.get("/api/profile", async (req, res) => {
  try {
    if (db) {
      const user = await db.collection("users").findOne({ username: "hady" });
      return res.json(user || mem.profile);
    }
    res.json(mem.profile);
  } catch { res.json(mem.profile); }
});

app.get("/api/stats", async (req, res) => {
  try {
    const ip = getIP(req);
    if (db) {
      await db.collection("visits").updateOne({ _id: "counter" }, { $inc: { count: 1 }, $set: { lastIP: ip } }, { upsert: true });
      const [likes, comments, shares, visits] = await Promise.all([
        db.collection("likes").countDocuments(),
        db.collection("comments").countDocuments(),
        db.collection("shares").findOne({ _id: "counter" }).then(d => d?.count || 0),
        db.collection("visits").findOne({ _id: "counter" }).then(d => d?.count || 0),
      ]);
      return res.json({ likes, comments, shares, visits });
    }
    mem.visits++;
    res.json({ likes: mem.likes.size, comments: mem.comments.length, shares: mem.shares, visits: mem.visits });
  } catch { res.json({ likes: 0, comments: 0, shares: 0, visits: 0 }); }
});

app.get("/api/health", async (req, res) => {
  res.json({ db: db ? "connected" : "demo", uptime: process.uptime() });
});

app.post("/api/like", likeLimiter, async (req, res) => {
  const ip = getIP(req);
  try {
    if (db) {
      const exists = await db.collection("likes").findOne({ ip });
      if (exists) return res.json({ success: false, message: "Already liked" });
      await db.collection("likes").insertOne({ ip, createdAt: new Date() });
      const count = await db.collection("likes").countDocuments();
      return res.json({ success: true, count });
    }
    if (mem.likes.has(ip)) return res.json({ success: false, message: "Already liked" });
    mem.likes.add(ip);
    res.json({ success: true, count: mem.likes.size });
  } catch { res.json({ success: false, message: "Error" }); }
});

app.get("/api/comments", async (req, res) => {
  try {
    if (db) {
      const comments = await db.collection("comments").find().sort({ createdAt: -1 }).limit(100).toArray();
      return res.json(comments);
    }
    res.json([...mem.comments].reverse().slice(0, 100));
  } catch { res.json([]); }
});

app.post("/api/comment", commentLimiter, async (req, res) => {
  const name = sanitize(req.body.name, 40);
  const message = sanitize(req.body.message, 400);
  if (!name || !message) return res.status(400).json({ error: "Name and message required" });

  const doc = { name, message, ip: getIP(req), createdAt: new Date() };
  try {
    if (db) {
      await db.collection("comments").insertOne(doc);
      return res.json({ success: true });
    }
    mem.comments.push({ ...doc, _id: Date.now().toString() });
    res.json({ success: true });
  } catch { res.json({ success: false }); }
});

app.post("/api/share", async (req, res) => {
  try {
    if (db) {
      await db.collection("shares").updateOne({ _id: "counter" }, { $inc: { count: 1 } }, { upsert: true });
      const doc = await db.collection("shares").findOne({ _id: "counter" });
      return res.json({ success: true, count: doc?.count || 0 });
    }
    mem.shares++;
    res.json({ success: true, count: mem.shares });
  } catch { res.json({ success: false, count: 0 }); }
});

// ── Frontend ──────────────────────────────────────────────────
app.get("/", (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Dashboard • hadyoficials</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;600;700;900&family=Space+Mono:ital,wght@0,400;0,700;1,400&family=Syne:wght@400;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
<style>

/* ─── Theme Variables ─────────────────────────────────────── */
:root {
  --accent:   #7c3aed;
  --accent2:  #a855f7;
  --accentb:  #3b82f6;
  --accentb2: #60a5fa;
  --accentc:  #06b6d4;
  --green:    #10b981;
  --red:      #f43f5e;
  --yellow:   #f59e0b;
  --bg:       #050508;
  --bg2:      #08090f;
  --bg3:      #0c0e18;
  --panel:    rgba(10,11,22,0.85);
  --border:   rgba(120,100,255,0.12);
  --borderh:  rgba(140,90,255,0.45);
  --text:     #e8eaf0;
  --textm:    #8891aa;
  --texts:    #3d4560;
  --glow:     0 0 24px rgba(124,58,237,0.5), 0 0 48px rgba(124,58,237,0.18);
  --glowb:    0 0 20px rgba(59,130,246,0.4);
  --radius:   14px;
  --sidebar-w: 250px;
}

[data-theme="green"] {
  --accent: #059669; --accent2: #10b981; --accentb: #047857;
  --accentb2: #34d399; --borderh: rgba(16,185,129,0.45);
  --glow: 0 0 24px rgba(16,185,129,0.5), 0 0 48px rgba(16,185,129,0.18);
}
[data-theme="red"] {
  --accent: #dc2626; --accent2: #f43f5e; --accentb: #b91c1c;
  --accentb2: #fb7185; --borderh: rgba(244,63,94,0.45);
  --glow: 0 0 24px rgba(244,63,94,0.5), 0 0 48px rgba(244,63,94,0.18);
}
[data-theme="cyan"] {
  --accent: #0891b2; --accent2: #06b6d4; --accentb: #0e7490;
  --accentb2: #22d3ee; --borderh: rgba(6,182,212,0.45);
  --glow: 0 0 24px rgba(6,182,212,0.5), 0 0 48px rgba(6,182,212,0.18);
}
[data-theme="gold"] {
  --accent: #b45309; --accent2: #f59e0b; --accentb: #92400e;
  --accentb2: #fbbf24; --borderh: rgba(245,158,11,0.45);
  --glow: 0 0 24px rgba(245,158,11,0.5), 0 0 48px rgba(245,158,11,0.18);
}
[data-theme="rose"] {
  --accent: #be185d; --accent2: #ec4899; --accentb: #9d174d;
  --accentb2: #f472b6; --borderh: rgba(236,72,153,0.45);
  --glow: 0 0 24px rgba(236,72,153,0.5), 0 0 48px rgba(236,72,153,0.18);
}

/* ─── Reset ─────────────────────────────────────────────────── */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html { scroll-behavior: smooth; }
body {
  background: var(--bg);
  color: var(--text);
  font-family: 'Syne', sans-serif;
  font-size: 14px;
  line-height: 1.6;
  min-height: 100vh;
  overflow-x: hidden;
}
::-webkit-scrollbar { width: 4px; }
::-webkit-scrollbar-track { background: var(--bg2); }
::-webkit-scrollbar-thumb { background: var(--accent); border-radius: 2px; }

/* ─── Loader ─────────────────────────────────────────────────── */
#loader {
  position: fixed; inset: 0; z-index: 9999;
  background: var(--bg);
  display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 20px;
  transition: opacity 0.7s ease;
}
#loader.hide { opacity: 0; pointer-events: none; }
.loader-logo {
  font-family: 'Orbitron', sans-serif; font-size: 32px; font-weight: 900; letter-spacing: 10px;
  background: linear-gradient(135deg, var(--accent2), var(--accentb2));
  -webkit-background-clip: text; -webkit-text-fill-color: transparent;
  animation: pulse-text 1.2s ease-in-out infinite alternate;
}
@keyframes pulse-text { from { opacity: 0.4; filter: blur(1px); } to { opacity: 1; filter: blur(0); } }
.loader-bar-wrap { width: 260px; height: 2px; background: rgba(255,255,255,0.05); border-radius: 2px; overflow: hidden; }
.loader-bar {
  height: 100%; width: 0; border-radius: 2px;
  background: linear-gradient(90deg, var(--accent), var(--accentb), var(--accentc));
  animation: load-fill 2.4s ease forwards; box-shadow: var(--glow);
}
@keyframes load-fill { to { width: 100%; } }
.loader-text {
  font-family: 'Space Mono', monospace; font-size: 10px; color: var(--accent2);
  letter-spacing: 4px; animation: blink 0.7s step-end infinite;
}
@keyframes blink { 50% { opacity: 0; } }

/* ─── Background ─────────────────────────────────────────────── */
.bg-grid {
  position: fixed; inset: 0; z-index: 0; pointer-events: none;
  background-image:
    linear-gradient(rgba(120,58,237,0.035) 1px, transparent 1px),
    linear-gradient(90deg, rgba(120,58,237,0.035) 1px, transparent 1px);
  background-size: 44px 44px;
}
.bg-glow1 {
  position: fixed; top: -250px; left: -250px; z-index: 0; pointer-events: none;
  width: 700px; height: 700px; border-radius: 50%;
  background: radial-gradient(circle, rgba(124,58,237,0.1) 0%, transparent 70%);
  animation: float1 9s ease-in-out infinite alternate;
}
.bg-glow2 {
  position: fixed; bottom: -200px; right: -200px; z-index: 0; pointer-events: none;
  width: 600px; height: 600px; border-radius: 50%;
  background: radial-gradient(circle, rgba(59,130,246,0.08) 0%, transparent 70%);
  animation: float2 11s ease-in-out infinite alternate;
}
@keyframes float1 { from { transform: translate(0,0) scale(1); } to { transform: translate(70px,50px) scale(1.12); } }
@keyframes float2 { from { transform: translate(0,0) scale(1); } to { transform: translate(-50px,-70px) scale(1.18); } }
.scan-overlay {
  position: fixed; inset: 0; z-index: 0; pointer-events: none;
  background: repeating-linear-gradient(0deg, transparent 0px, transparent 2px, rgba(0,0,0,0.025) 2px, rgba(0,0,0,0.025) 3px);
}

/* ─── Layout ─────────────────────────────────────────────────── */
#app { display: flex; min-height: 100vh; position: relative; z-index: 1; }

/* ─── Sidebar ─────────────────────────────────────────────────  */
.sidebar {
  width: var(--sidebar-w);
  min-height: 100vh;
  background: rgba(6,7,16,0.95);
  border-right: 1px solid var(--border);
  backdrop-filter: blur(24px);
  display: flex;
  flex-direction: column;
  position: fixed;
  left: 0;
  top: 0;
  bottom: 0;
  z-index: 9999999;
  transition: transform 0.35s cubic-bezier(0.4,0,0.2,1);
}

.sidebar-logo {
  padding: 24px 20px 20px;
  border-bottom: 1px solid var(--border);
  display: flex; align-items: center; gap: 12px;
}
.sidebar-logo-icon {
  width: 36px; height: 36px; border-radius: 10px;
  background: linear-gradient(135deg, var(--accent), var(--accentb));
  display: flex; align-items: center; justify-content: center;
  font-family: 'Orbitron', sans-serif; font-weight: 900; font-size: 14px; color: #fff;
  box-shadow: var(--glow); flex-shrink: 0;
  animation: spin-logo 8s linear infinite;
}
@keyframes spin-logo { 0%,100%{box-shadow:var(--glow);} 50%{box-shadow:var(--glowb);} }
.sidebar-logo-text {
  font-family: 'Orbitron', sans-serif; font-size: 13px; font-weight: 900; letter-spacing: 3px;
  background: linear-gradient(135deg, var(--accent2), var(--accentb2));
  -webkit-background-clip: text; -webkit-text-fill-color: transparent;
}
.sidebar-logo-sub { font-family: 'Space Mono', monospace; font-size: 8px; color: var(--texts); letter-spacing: 2px; margin-top: 2px; }

.sidebar-nav { padding: 16px 10px; display: flex; flex-direction: column; gap: 2px; overflow-y: auto; }

.nav-section {
  font-family: 'Space Mono', monospace; font-size: 8px; color: var(--texts);
  letter-spacing: 3px; padding: 14px 10px 6px; text-transform: uppercase;
}

.nav-item {
  display: flex; align-items: center; gap: 11px;
  padding: 10px 12px; border-radius: 10px;
  color: var(--textm); font-size: 13px; font-weight: 600;
  cursor: pointer; transition: all 0.22s ease;
  border: 1px solid transparent; text-decoration: none;
  position: relative; overflow: hidden;
}
.nav-item::before {
  content: ''; position: absolute; inset: 0;
  background: linear-gradient(135deg, rgba(124,58,237,0.12), rgba(59,130,246,0.05));
  opacity: 0; transition: opacity 0.22s;
}
.nav-item:hover { color: var(--text); border-color: var(--border); }
.nav-item:hover::before { opacity: 1; }
.nav-item.active {
  color: var(--text);
  background: linear-gradient(135deg, rgba(124,58,237,0.22), rgba(59,130,246,0.1));
  border-color: var(--borderh);
  box-shadow: inset 0 0 20px rgba(124,58,237,0.08);
}
.nav-item .nav-icon { width: 18px; text-align: center; font-size: 13px; flex-shrink: 0; }
.nav-item.active .nav-icon { color: var(--accent2); }
.nav-item .nav-badge {
  margin-left: auto; font-family: 'Space Mono', monospace; font-size: 8px;
  padding: 2px 6px; border-radius: 4px;
  background: rgba(124,58,237,0.15); color: var(--accent2); border: 1px solid rgba(124,58,237,0.3);
}

.sidebar-socials {
  padding: 14px 10px;
  border-top: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
  margin-top: -8px;
}
.sidebar-socials-title { font-family: 'Space Mono', monospace; font-size: 8px; color: var(--texts); letter-spacing: 3px; margin-bottom: 10px; text-transform: uppercase; padding: 0 2px; }
.social-links-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.social-link-btn {
  display: flex; align-items: center; gap: 8px;
  padding: 9px 10px; border-radius: 8px;
  border: 1px solid var(--border);
  background: rgba(255,255,255,0.02);
  color: var(--textm); font-size: 11px; font-weight: 600;
  cursor: pointer; transition: all 0.2s; text-decoration: none;
  font-family: 'Space Mono', monospace;
}
.social-link-btn:hover { color: var(--text); border-color: var(--borderh); background: rgba(124,58,237,0.08); transform: translateY(-1px); }
.social-link-btn i { font-size: 13px; width: 14px; text-align: center; }
.social-link-btn.wa i { color: #25d366; }
.social-link-btn.tg i { color: #2aabee; }
.social-link-btn.gh i { color: #e0e0e0; }
.social-link-btn.yt i { color: #ff0000; }
.social-link-btn.ig i { color: #e1306c; }
.social-link-btn.tw i { color: #1d9bf0; }

.sidebar-footer { padding: 14px 20px; }
.status-dot { display: flex; align-items: center; gap: 8px; font-size: 11px; color: var(--textm); font-family: 'Space Mono', monospace; }
.dot { width: 7px; height: 7px; border-radius: 50%; background: var(--green); box-shadow: 0 0 8px var(--green); animation: dot-pulse 2s ease infinite; }
@keyframes dot-pulse { 0%,100%{opacity:1;transform:scale(1);} 50%{opacity:0.5;transform:scale(0.85);} }

/* ─── Main ─────────────────────────────────────────────────────── */
.main { margin-left: var(--sidebar-w); flex: 1; padding: 24px 28px; display: flex; flex-direction: column; gap: 22px; }

/* ─── Topbar ─────────────────────────────────────────────────── */
.topbar {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 20px; border-radius: var(--radius);
  background: var(--panel); border: 1px solid var(--border);
  backdrop-filter: blur(20px);
  position: relative;
  z-index: 999999;
  overflow: visible;
}
.topbar-left { display: flex; align-items: center; gap: 12px; }
.page-title { font-family: 'Orbitron', sans-serif; font-size: 13px; font-weight: 900; letter-spacing: 4px; color: var(--text); }
.page-badge {
  padding: 3px 10px; border-radius: 5px;
  background: rgba(124,58,237,0.15); border: 1px solid rgba(124,58,237,0.3);
  font-family: 'Space Mono', monospace; font-size: 8px; color: var(--accent2); letter-spacing: 2px;
}
.topbar-right { display: flex; align-items: center; gap: 10px; }
.topbar-time { font-family: 'Space Mono', monospace; font-size: 12px; color: var(--accent2); letter-spacing: 2px; }
.topbar-icon-btn {
  width: 36px; height: 36px; border-radius: 8px; cursor: pointer;
  background: rgba(255,255,255,0.03); border: 1px solid var(--border);
  display: flex; align-items: center; justify-content: center;
  color: var(--textm); font-size: 13px; transition: all 0.2s;
}
.topbar-icon-btn:hover { border-color: var(--borderh); color: var(--accent2); box-shadow: var(--glow); }

/* ─── Theme Picker ──────────────────────────────────────────── */
.theme-picker {
  position: relative;
  z-index: 9999999;
}
.theme-dropdown {
  position: fixed; z-index: 99999;
  background: rgba(6,7,18,0.99); border: 1px solid var(--borderh);
  border-radius: 14px; padding: 8px; display: flex; flex-direction: column; gap: 4px;
  backdrop-filter: blur(32px); min-width: 175px;
  box-shadow: 0 16px 48px rgba(0,0,0,0.7), var(--glow);
  opacity: 0; pointer-events: none; transform: translateY(-6px) scale(0.97);
  transition: opacity 0.18s ease, transform 0.18s ease;
}
.theme-dropdown.open { opacity: 1; pointer-events: all; transform: translateY(0) scale(1); }
.theme-opt {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 12px; border-radius: 8px; cursor: pointer;
  color: var(--textm); font-size: 12px; font-weight: 600;
  transition: all 0.15s; border: 1px solid transparent;
}
.theme-opt:hover { color: var(--text); background: rgba(124,58,237,0.08); border-color: var(--border); }
.theme-dot { width: 12px; height: 12px; border-radius: 50%; flex-shrink: 0; }

/* ─── Grid ─────────────────────────────────────────────────────── */
.grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
.grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
.grid-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; }
.col-span-2 { grid-column: span 2; }

/* ─── Cards ────────────────────────────────────────────────────── */
.card {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  backdrop-filter: blur(24px);
  padding: 16px;
  transition: border-color 0.25s, box-shadow 0.25s, transform 0.25s;
  position: relative;
  overflow: visible;
  z-index: 1;
}
.card::before {
  content: ''; position: absolute; top: 0; left: 0; right: 0; height: 1px;
  background: linear-gradient(90deg, transparent, var(--accent), transparent);
  opacity: 0; transition: opacity 0.3s;
}
.card:hover { border-color: var(--borderh); box-shadow: 0 4px 32px rgba(0,0,0,0.3); }
.card:hover::before { opacity: 0.6; }
.card-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 18px; }
.card-title { font-family: 'Orbitron', sans-serif; font-size: 9px; font-weight: 700; letter-spacing: 2.5px; color: var(--textm); text-transform: uppercase; }
.card-icon { font-size: 14px; color: var(--accent2); }

/* ─── Profile Card ───────────────────────────────────────────── */
.profile-card {
  background: linear-gradient(135deg, rgba(10,11,22,0.95), rgba(15,16,32,0.9));
  border: 1px solid var(--borderh);
}
.profile-top { display: flex; align-items: flex-start; gap: 16px; }

.avatar-wrap { position: relative; flex-shrink: 0; cursor: pointer; }
.avatar-ring {
  position: absolute; inset: -3px; border-radius: 19px;
  background: conic-gradient(var(--accent), var(--accentb), var(--accentc), var(--accent2), var(--accent));
  z-index: 0; animation: spin-ring 5s linear infinite;
}
@keyframes spin-ring { to { transform: rotate(360deg); } }
.avatar {
  width: 76px; height: 76px; border-radius: 16px;
  background: linear-gradient(135deg, var(--accent), var(--accentb));
  display: flex; align-items: center; justify-content: center;
  font-size: 26px; color: #fff; font-weight: 900; font-family: 'Orbitron', sans-serif;
  position: relative; z-index: 1; overflow: hidden;
  box-shadow: 0 0 0 3px var(--bg);
}
.avatar img { width: 100%; height: 100%; object-fit: cover; border-radius: 14px; }
.avatar:hover { transform: scale(1.05); transition: transform 0.3s; }
.online-badge {
  position: absolute; bottom: -2px; right: -2px; z-index: 2;
  width: 15px; height: 15px; border-radius: 50%;
  background: var(--green); border: 2px solid var(--bg);
  box-shadow: 0 0 10px var(--green);
  animation: online-pulse 2s ease infinite;
}
@keyframes online-pulse { 0%,100%{box-shadow:0 0 10px var(--green);} 50%{box-shadow:0 0 18px var(--green);} }

.profile-info { flex: 1; min-width: 0; }
.profile-name-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.profile-name {
  font-family: 'Orbitron', sans-serif; font-size: 22px; font-weight: 900; letter-spacing: 3px;
  background: linear-gradient(135deg, #fff 30%, var(--accent2));
  -webkit-background-clip: text; -webkit-text-fill-color: transparent;
}
.verified-tick {
  color: var(--accentb2); font-size: 16px;
  filter: drop-shadow(0 0 6px var(--accentb));
  animation: tick-glow 2s ease infinite alternate;
}
@keyframes tick-glow { from{filter:drop-shadow(0 0 4px var(--accentb));} to{filter:drop-shadow(0 0 12px var(--accentb2));} }
.profile-role { font-family: 'Space Mono', monospace; font-size: 10px; color: var(--accentb2); letter-spacing: 2px; margin-top: 4px; }
.profile-bio {
  font-size: 12px;
  color: #b7bfd3;
  margin-top: 8px;
  line-height: 1.5;
  background: rgba(255,255,255,0.03);
  border: 1px solid var(--border);
  padding: 10px 12px;
  border-radius: 10px;
}
.profile-location { display: flex; align-items: center; gap: 6px; font-size: 11px; color: var(--texts); margin-top: 8px; }
.profile-mini-info {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 10px;
  color: #9ba6c7;
}

.mini-info-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-family: 'Space Mono', monospace;
  letter-spacing: 0.3px;
}

.mini-info-item i {
  font-size: 11px;
  color: var(--accent2);
}

.mini-divider {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: rgba(255,255,255,0.18);
}

.hidden-inspiration {
  margin-top: 10px;
  font-size: 9px;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  opacity: 0.38;
  color: #94a0c0;
  text-align: center;
  font-family: 'Space Mono', monospace;
}
.cinematic-player-card {
  overflow: hidden;
}

.cinematic-player-wrap {
  position: relative;
  margin-top: 14px;
  border-radius: 18px;
  overflow: hidden;
  border: 1px solid var(--border);
  background: rgba(255,255,255,0.03);
  box-shadow:
    0 10px 40px rgba(0,0,0,0.45),
    0 0 30px rgba(124,58,237,0.08);
}

.cinematic-video {
  width: 100%;
  height: 260px;
  object-fit: cover;
  display: block;
  background: #000;
}

.video-overlay {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(to top,
      rgba(0,0,0,0.75),
      rgba(0,0,0,0.05),
      rgba(0,0,0,0.35));
  pointer-events: none;
}

.video-controls {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;

  display: flex;
  align-items: center;
  gap: 12px;

  padding: 14px;
  z-index: 5;
}

.video-btn {
  width: 42px;
  height: 42px;
  border-radius: 14px;

  border: 1px solid var(--borderh);

  background: rgba(8,10,22,0.72);
  backdrop-filter: blur(16px);

  color: var(--text);

  display: flex;
  align-items: center;
  justify-content: center;

  cursor: pointer;

  transition: all .25s ease;
}

.video-btn:hover {
  transform: translateY(-2px) scale(1.04);
  border-color: var(--accent2);
  box-shadow: var(--glow);
}

.video-progress-wrap {
  flex: 1;
}

.video-progress-bar {
  width: 100%;
  height: 6px;
  border-radius: 999px;
  overflow: hidden;
  background: rgba(255,255,255,0.12);
}

.video-progress {
  width: 35%;
  height: 100%;
  border-radius: inherit;

  background:
    linear-gradient(90deg,
      var(--accent),
      var(--accent2),
      var(--accentb));
}
.profile-stack { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 14px; }
.stack-tag {
  padding: 4px 11px; border-radius: 6px;
  background: rgba(255,255,255,0.03); border: 1px solid var(--border);
  font-family: 'Space Mono', monospace; font-size: 9px; color: var(--textm);
  transition: all 0.2s; cursor: default;
}
.stack-tag:hover { border-color: var(--accent2); color: var(--accent2); background: rgba(124,58,237,0.08); box-shadow: var(--glow); transform: translateY(-1px); }

/* ─── Social row in profile card ──────────────────────────── */
.profile-social-row {
  display: flex; gap: 10px; margin-top: 20px; padding-top: 18px;
  border-top: 1px solid var(--border);
}
.profile-social-btn {
  flex: 1; display: flex; align-items: center; justify-content: center; gap: 7px;
  padding: 10px; border-radius: 10px;
  border: 1px solid var(--border); background: rgba(255,255,255,0.03);
  color: var(--textm); font-family: 'Space Mono', monospace; font-size: 10px; letter-spacing: 1px;
  cursor: pointer; transition: all 0.25s ease;
}
.profile-social-btn:hover { transform: translateY(-2px); }
.profile-social-btn.like-btn:hover, .profile-social-btn.like-btn.active {
  background: rgba(244,63,94,0.12); border-color: rgba(244,63,94,0.45);
  color: var(--red); box-shadow: 0 0 20px rgba(244,63,94,0.2);
}
.profile-social-btn.comment-btn:hover {
  background: rgba(59,130,246,0.1); border-color: rgba(59,130,246,0.4);
  color: var(--accentb2); box-shadow: var(--glowb);
}
.profile-social-btn.share-btn:hover {
  background: rgba(16,185,129,0.1); border-color: rgba(16,185,129,0.4);
  color: var(--green); box-shadow: 0 0 20px rgba(16,185,129,0.2);
}
.profile-social-btn i { font-size: 14px; }

/* ─── Stat Cards ─────────────────────────────────────────────── */
.stat-card { padding: 18px; text-align: center; display: flex; flex-direction: column; gap: 8px; }
.stat-icon {
  width: 44px; height: 44px; border-radius: 12px; margin: 0 auto;
  display: flex; align-items: center; justify-content: center; font-size: 17px;
  transition: transform 0.3s, box-shadow 0.3s;
}
.stat-card:hover .stat-icon { transform: scale(1.12); }
.stat-icon.purple { background: rgba(124,58,237,0.15); color: var(--accent2); }
.stat-icon.blue   { background: rgba(59,130,246,0.15); color: var(--accentb2); }
.stat-icon.cyan   { background: rgba(6,182,212,0.15); color: var(--accentc); }
.stat-icon.green  { background: rgba(16,185,129,0.15); color: var(--green); }
.stat-value {
  font-family: 'Orbitron', sans-serif; font-size: 30px; font-weight: 900;
  background: linear-gradient(135deg, var(--text), var(--textm));
  -webkit-background-clip: text; -webkit-text-fill-color: transparent; line-height: 1;
}
.stat-label { font-size: 9px; color: var(--texts); letter-spacing: 2px; font-family: 'Space Mono', monospace; }

/* ─── Badge ──────────────────────────────────────────────────── */
.badge {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 3px 9px; border-radius: 5px;
  font-family: 'Space Mono', monospace; font-size: 8px; letter-spacing: 1.5px;
}
.badge-purple { background: rgba(124,58,237,0.15); border: 1px solid rgba(124,58,237,0.3); color: var(--accent2); }
.badge-blue   { background: rgba(59,130,246,0.15); border: 1px solid rgba(59,130,246,0.3); color: var(--accentb2); }
.badge-green  { background: rgba(16,185,129,0.15); border: 1px solid rgba(16,185,129,0.3); color: var(--green); }
.badge-red    { background: rgba(244,63,94,0.15); border: 1px solid rgba(244,63,94,0.3); color: var(--red); }

/* ─── Comments ───────────────────────────────────────────────── */
.comment-form { display: flex; flex-direction: column; gap: 10px; margin-bottom: 16px; }
.form-row { display: flex; gap: 10px; }
.input-field {
  flex: 1; padding: 10px 14px; border-radius: 9px;
  background: rgba(255,255,255,0.035); border: 1px solid var(--border);
  color: var(--text); font-size: 13px; font-family: 'Syne', sans-serif;
  outline: none; transition: border-color 0.2s, box-shadow 0.2s;
}
.input-field::placeholder { color: var(--texts); }
.input-field:focus { border-color: var(--borderh); box-shadow: 0 0 0 3px rgba(124,58,237,0.1); }
textarea.input-field { resize: none; height: 80px; }
.submit-btn {
  padding: 10px 20px; border-radius: 9px;
  background: linear-gradient(135deg, var(--accent), var(--accentb));
  border: none; color: #fff; font-size: 11px; font-weight: 700;
  font-family: 'Space Mono', monospace; letter-spacing: 1.5px;
  cursor: pointer; transition: all 0.2s; white-space: nowrap;
}
.submit-btn:hover { transform: translateY(-1px); box-shadow: var(--glow); }
.submit-btn:active { transform: translateY(0); }

.comments-list { display: flex; flex-direction: column; gap: 10px; max-height: 400px; overflow-y: auto; }

.comment-item {
  display: flex; gap: 12px; padding: 14px;
  background: rgba(255,255,255,0.02); border-radius: 12px;
  border: 1px solid var(--border);
  animation: slide-in 0.35s cubic-bezier(0.34,1.56,0.64,1);
  transition: border-color 0.2s, background 0.2s;
}
.comment-item:hover { border-color: var(--borderh); background: rgba(124,58,237,0.04); }
@keyframes slide-in { from { opacity: 0; transform: translateY(10px) scale(0.97); } to { opacity: 1; transform: translateY(0) scale(1); } }

.comment-avatar {
  width: 38px; height: 38px; border-radius: 10px; flex-shrink: 0;
  background: linear-gradient(135deg, var(--accent), var(--accentb));
  display: flex; align-items: center; justify-content: center;
  font-size: 14px; font-weight: 700; color: #fff; font-family: 'Orbitron', sans-serif;
  position: relative; overflow: hidden;
}
.comment-avatar-img { width: 100%; height: 100%; object-fit: cover; }

.comment-body { flex: 1; min-width: 0; }
.comment-meta { display: flex; align-items: center; gap: 8px; margin-bottom: 5px; flex-wrap: wrap; }
.comment-name { font-size: 12px; font-weight: 700; color: var(--text); }
.comment-time { font-size: 9px; color: var(--texts); font-family: 'Space Mono', monospace; }
.comment-msg { font-size: 12px; color: var(--textm); line-height: 1.55; word-break: break-word; }
.comment-actions {
  display: flex; gap: 8px; margin-top: 8px;
}
.comment-action-btn {
  display: flex; align-items: center; gap: 5px;
  padding: 3px 8px; border-radius: 5px; cursor: pointer;
  background: rgba(255,255,255,0.03); border: 1px solid var(--border);
  color: var(--texts); font-size: 9px; font-family: 'Space Mono', monospace;
  transition: all 0.15s;
}
.comment-action-btn:hover { border-color: var(--borderh); color: var(--accent2); }
.no-comments { text-align: center; color: var(--texts); font-size: 11px; padding: 24px; font-family: 'Space Mono', monospace; }

/* ─── Info Panel ─────────────────────────────────────────────── */
.info-grid { display: flex; flex-direction: column; gap: 6px; }
.info-row {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 12px; border-radius: 8px;
  background: rgba(255,255,255,0.025); border: 1px solid transparent;
  transition: border-color 0.2s, background 0.2s;
}
.info-row:hover { border-color: var(--border); background: rgba(124,58,237,0.04); }
.info-label { display: flex; align-items: center; gap: 9px; font-size: 11px; color: var(--textm); }
.info-label i { width: 14px; color: var(--accent2); font-size: 11px; }
.info-value { font-family: 'Space Mono', monospace; font-size: 9px; color: var(--accentc); text-align: right; max-width: 160px; word-break: break-all; }

/* ─── Battery ─────────────────────────────────────────────────── */
.battery-bar-wrap { display: flex; align-items: center; gap: 8px; }
.battery-outer { width: 50px; height: 10px; border: 1px solid var(--texts); border-radius: 2px; position: relative; }
.battery-tip { position: absolute; right: -4px; top: 2px; width: 3px; height: 6px; background: var(--texts); border-radius: 0 1px 1px 0; }
.battery-inner { height: 100%; border-radius: 2px; transition: width 0.6s ease; }

/* ─── Mini Chart ─────────────────────────────────────────────── */
.mini-chart-row { display: flex; align-items: flex-end; gap: 4px; height: 54px; padding-top: 8px; }
.mini-bar {
  flex: 1; border-radius: 4px 4px 0 0;
  background: linear-gradient(180deg, var(--accent2), rgba(124,58,237,0.25));
  animation: bar-grow 1.2s cubic-bezier(0.34,1.56,0.64,1) both;
  transform-origin: bottom; cursor: pointer; transition: opacity 0.2s;
}
.mini-bar:hover { opacity: 0.7; }
@keyframes bar-grow { from { transform: scaleY(0); } to { transform: scaleY(1); } }

/* ─── Progress bar ──────────────────────────────────────────── */
.progress-bar-wrap { height: 4px; background: rgba(255,255,255,0.06); border-radius: 2px; overflow: hidden; margin-top: 6px; }
.progress-bar { height: 100%; border-radius: 2px; background: linear-gradient(90deg, var(--accent), var(--accentb)); transition: width 1.2s ease; }

/* ─── Toast ──────────────────────────────────────────────────── */
#toast { position: fixed; bottom: 24px; right: 24px; z-index: 9000; display: flex; flex-direction: column; gap: 8px; }
.toast-item {
  padding: 11px 18px; border-radius: 12px;
  background: rgba(8,9,20,0.95); border: 1px solid var(--border);
  backdrop-filter: blur(24px); font-size: 12px; color: var(--text);
  display: flex; align-items: center; gap: 10px;
  animation: toast-in 0.3s cubic-bezier(0.34,1.56,0.64,1);
  box-shadow: 0 8px 32px rgba(0,0,0,0.5);
  font-family: 'Syne', sans-serif;
}
@keyframes toast-in { from { opacity: 0; transform: translateX(24px) scale(0.95); } to { opacity: 1; transform: translateX(0) scale(1); } }
.toast-item i { color: var(--accent2); font-size: 14px; }

/* ─── Notification banner ────────────────────────────────────── */
#welcome-notif {
  position: fixed; top: 20px; left: 50%; transform: translateX(-50%) translateY(-500px);
  z-index: 9100; transition: transform 0.5s cubic-bezier(0.34,1.56,0.64,1);
  background: rgba(8,9,20,0.97); border: 1px solid var(--borderh);
  border-radius: 16px; padding: 14px 20px;
  display: flex; align-items: center; gap: 14px;
  backdrop-filter: blur(32px); box-shadow: 0 8px 40px rgba(0,0,0,0.5), var(--glow);
  min-width: 280px; max-width: 380px;
}
#welcome-notif.show { transform: translateX(-50%) translateY(0); }
.notif-icon {
  width: 40px; height: 40px; border-radius: 12px; flex-shrink: 0;
  background: linear-gradient(135deg, var(--accent), var(--accentb));
  display: flex; align-items: center; justify-content: center; font-size: 18px; color: #fff;
  animation: notif-bounce 0.6s ease 0.5s both;
}
@keyframes notif-bounce { 0%{transform:scale(0);} 60%{transform:scale(1.2);} 100%{transform:scale(1);} }
.notif-content { flex: 1; min-width: 0; }
.notif-title { font-weight: 700; font-size: 13px; color: var(--text); }
.notif-sub { font-size: 11px; color: var(--textm); margin-top: 2px; font-family: 'Space Mono', monospace; }
.notif-close { color: var(--texts); cursor: pointer; font-size: 12px; flex-shrink: 0; padding: 4px; transition: color 0.2s; }
.notif-close:hover { color: var(--text); }

/* ─── Sections (section pages) ────────────────────────────── */
.section-page { display: none; }
.section-page.active { display: flex; flex-direction: column; gap: 22px; animation: fade-page 0.35s ease; }
@keyframes fade-page { from{opacity:0;transform:translateY(10px);} to{opacity:1;transform:translateY(0);} }

/* ─── Terms card ─────────────────────────────────────────────── */
.terms-content { font-size: 13px; color: var(--textm); line-height: 1.8; }
.terms-content h3 { font-size: 12px; font-family: 'Orbitron', sans-serif; color: var(--text); letter-spacing: 1px; margin: 18px 0 8px; }
.terms-content p { margin-bottom: 10px; }

/* ─── Hamburger ─────────────────────────────────────────────── */
.hamburger {
  display: none; position: fixed; top: 16px; left: 16px; z-index: 200;
  width: 40px; height: 40px; border-radius: 8px;
  background: var(--panel); border: 1px solid var(--border);
  align-items: center; justify-content: center;
  cursor: pointer; color: var(--text); font-size: 16px;
  backdrop-filter: blur(20px);
}

/* ─── Responsive ─────────────────────────────────────────────── */
@media (max-width: 1100px) {
  .grid-4 { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 900px) {
  .grid-2 { grid-template-columns: 1fr; }
  .grid-3 { grid-template-columns: 1fr 1fr; }
  .col-span-2 { grid-column: span 1; }
}
@media (max-width: 700px) {
  .sidebar { transform: translateX(-100%); }
  .sidebar.open { transform: translateX(0); box-shadow: 12px 0 40px rgba(0,0,0,0.5); }
  .main { margin-left: 0; padding: 16px 14px; }
  .hamburger { display: flex; }
  .grid-3 { grid-template-columns: 1fr; }
  .grid-4 { grid-template-columns: 1fr 1fr; }
  .profile-top { flex-direction: column; align-items: center; text-align: center; }
  .profile-name-row { justify-content: center; }
  .profile-stack { justify-content: center; }
}
@media (max-width: 420px) {
  .grid-4 { grid-template-columns: 1fr; }
  .form-row { flex-direction: column; }
  .social-links-grid { grid-template-columns: 1fr; }
}
</style>
</head>
<body>

<!-- Loader -->
<div id="loader">
  <div class="loader-logo">HADY</div>
  <div class="loader-bar-wrap"><div class="loader-bar"></div></div>
  <div class="loader-text">INITIALIZING...</div>
</div>

<!-- BG -->
<div class="bg-grid"></div>
<div class="bg-glow1"></div>
<div class="bg-glow2"></div>
<div class="scan-overlay"></div>

<!-- Toast -->
<div id="toast"></div>

<!-- Welcome Notification -->
<div id="welcome-notif">
  <div class="notif-icon"><i class="fa fa-bolt"></i></div>
  <div class="notif-content">
    <div class="notif-title">Bienvenido al perfil de hady</div>
    <div class="notif-sub">Sistema activo · Conexión segura</div>
  </div>
  <div class="notif-close" onclick="closeNotif()"><i class="fa fa-xmark"></i></div>
</div>

<!-- Hamburger -->
<button class="hamburger" id="hamburger"><i class="fa fa-bars"></i></button>

<div id="app">
  <!-- Sidebar -->
  <aside class="sidebar" id="sidebar">
    <div class="sidebar-logo">
      <div class="sidebar-logo-icon">H</div>
      <div>
        <div class="sidebar-logo-text">HADY</div>
        <div class="sidebar-logo-sub">DASHBOARD v3.0</div>
      </div>
    </div>

    <nav class="sidebar-nav">
      <span class="nav-section">Principal</span>
      <a class="nav-item active" href="#" data-section="overview">
        <i class="nav-icon fa fa-house"></i> Overview
      </a>
      <a class="nav-item" href="#" data-section="profile">
        <i class="nav-icon fa fa-user"></i> Perfil
      </a>
      <a class="nav-item" href="#" data-section="analytics">
        <i class="nav-icon fa fa-chart-bar"></i> Analíticas
      </a>

      <span class="nav-section">Comunidad</span>
      <a class="nav-item" href="#" data-section="comments">
        <i class="nav-icon fa fa-comments"></i> Comentarios
        <span class="nav-badge" id="nav-comment-badge">0</span>
      </a>
      <a class="nav-item" href="#" data-section="overview">
        <i class="nav-icon fa fa-share-nodes"></i> Compartir
      </a>

      <span class="nav-section">Sistema</span>
      <a class="nav-item" href="#" data-section="device">
        <i class="nav-icon fa fa-microchip"></i> Dispositivo
      </a>
      <a class="nav-item" href="#" data-section="settings">
        <i class="nav-icon fa fa-gear"></i> Configuración
      </a>
      <a class="nav-item" href="#" data-section="terms">
        <i class="nav-icon fa fa-file-contract"></i> Términos
      </a>
    </nav>

    <!-- Social links -->
    <div class="sidebar-socials">
      <div class="sidebar-socials-title">Mis Redes</div>
      <div class="social-links-grid">
        <a class="social-link-btn wa" href="https://wa.me/51910201997" target="_blank">
          <i class="fab fa-whatsapp"></i> WhatsApp
        </a>
        <a class="social-link-btn tg" href="https://t.me/Hadyoficials" target="_blank">
          <i class="fab fa-telegram"></i> Telegram
        </a>
        <a class="social-link-btn gh" href="https://github.com/devhades02" target="_blank">
          <i class="fab fa-github"></i> GitHub
        </a>
        <a class="social-link-btn ig" href="https://instagram.com/" target="_blank">
          <i class="fab fa-instagram"></i> Instagram
        </a>
        <a class="social-link-btn yt" href="https://youtube.com/" target="_blank">
          <i class="fab fa-youtube"></i> YouTube
        </a>
        <a class="social-link-btn tw" href="https://twitter.com/" target="_blank">
          <i class="fab fa-x-twitter"></i> Twitter
        </a>
      </div>
    </div>

    <div class="sidebar-footer">
      <div class="status-dot">
        <div class="dot"></div>
        <span id="db-status-sidebar">Conectando...</span>
      </div>
    </div>
  </aside>

  <!-- Main Content -->
  <main class="main">
    <!-- Topbar -->
    <div class="topbar">
      <div class="topbar-left">
        <div class="page-title" id="page-title">OVERVIEW</div>
        <div class="page-badge" id="page-badge">DASHBOARD</div>
      </div>
      <div class="topbar-right">
        <div class="topbar-time" id="clock">--:--:--</div>
        <div class="topbar-icon-btn" title="Refrescar" onclick="loadAll()">
          <i class="fa fa-rotate-right"></i>
        </div>
        <div class="topbar-icon-btn theme-picker" id="theme-picker-btn" title="Cambiar tema">
          <i class="fa fa-palette"></i>
          <div class="theme-dropdown" id="theme-dropdown">
            <div class="theme-opt" onclick="setTheme('')">
              <div class="theme-dot" style="background:linear-gradient(135deg,#7c3aed,#3b82f6)"></div> Purple (default)
            </div>
            <div class="theme-opt" onclick="setTheme('green')">
              <div class="theme-dot" style="background:linear-gradient(135deg,#059669,#10b981)"></div> Green
            </div>
            <div class="theme-opt" onclick="setTheme('red')">
              <div class="theme-dot" style="background:linear-gradient(135deg,#dc2626,#f43f5e)"></div> Red
            </div>
            <div class="theme-opt" onclick="setTheme('cyan')">
              <div class="theme-dot" style="background:linear-gradient(135deg,#0891b2,#06b6d4)"></div> Cyan
            </div>
            <div class="theme-opt" onclick="setTheme('gold')">
              <div class="theme-dot" style="background:linear-gradient(135deg,#b45309,#f59e0b)"></div> Gold
            </div>
            <div class="theme-opt" onclick="setTheme('rose')">
              <div class="theme-dot" style="background:linear-gradient(135deg,#be185d,#ec4899)"></div> Rose
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- SECTION: Overview -->
    <div class="section-page active" id="section-overview">

      <!-- Hidden stat elements kept for JS compatibility -->
      <span id="stat-likes" style="display:none">0</span>
      <span id="stat-comments" style="display:none">0</span>
      <span id="stat-shares" style="display:none">0</span>
      <span id="stat-visits" style="display:none">0</span>

      <!-- Profile + Device -->
      <div class="grid-2">
        <!-- Profile Card -->
        <div class="card profile-card">
          <div class="card-header">
            <div class="card-title"><i class="fa fa-id-card"></i> &nbsp;Perfil</div>
            <div class="badge badge-green"><i class="fa fa-circle"></i> &nbsp;ONLINE</div>
          </div>
          <div class="profile-top">
            <div class="avatar-wrap">
              <div class="avatar-ring"></div>
              <div class="avatar" id="profile-avatar">H</div>
              <div class="online-badge"></div>
            </div>
            <div class="profile-info">
              <div class="profile-name-row">
                <div class="profile-name" id="profile-name">hady</div>
                <i class="fa fa-circle-check verified-tick" id="verified-tick" style="display:none" title="Verificado"></i>
              </div>
              <div class="profile-role" id="profile-role">Full-Stack Developer</div>
              <div class="profile-bio" id="profile-bio">Cargando perfil...</div>
             <div class="profile-mini-info">

  <div class="mini-info-item">
    <i class="fa fa-location-dot"></i>
    <span>Lima, Perú</span>
  </div>

  <div class="mini-divider"></div>

  <div class="mini-info-item">
    <i class="fa fa-code"></i>
    <span>DevHady</span>
  </div>

  <div class="mini-divider"></div>

  <div class="mini-info-item">
    <i class="fa fa-bolt"></i>
    <span>Node.js</span>
  </div>

</div>

<div class="hidden-inspiration">
  built with inspiration from briseyda
</div>
<div class="profile-stack" id="profile-stack"></div>
            </div>
          </div>
          <!-- Likes, Comentarios, Compartir en fila horizontal -->
          <div class="profile-social-row">
            <button class="profile-social-btn like-btn" id="like-btn" onclick="handleLike()">
              <i class="fa fa-heart"></i> <span id="like-count">0</span>
            </button>
            <button class="profile-social-btn comment-btn" onclick="goSection('comments')">
              <i class="fa fa-comment"></i> <span id="comment-count-btn">0</span>
            </button>
            <button class="profile-social-btn share-btn" onclick="handleShare()">
              <i class="fa fa-share-nodes"></i> <span id="share-count">0</span>
            </button>
          </div>
        </div>
        <!-- Cinematic Video -->
<div class="card cinematic-player-card">

  <div class="card-header">
    <div class="card-title">
      <i class="fa fa-film"></i> &nbsp; Showcase
    </div>

    <div class="badge badge-green">
      <i class="fa fa-wave-square"></i> &nbsp; LIVE
    </div>
  </div>

  <div class="cinematic-player-wrap">

    <video
      id="cinematic-video"
      class="cinematic-video"
      autoplay
      muted
      loop
      playsinline
      preload="auto"
    >
      <source src="https://cdn.dix.lat/me/94ea2515-069c-4283-b092-49701dda4d73.mp4" type="video/mp4">
    </video>

    <div class="video-overlay"></div>

    <div class="video-controls">

      <button class="video-btn" id="play-btn">
        <i class="fa fa-pause"></i>
      </button>

      <div class="video-progress-wrap">
        <div class="video-progress-bar">
          <div class="video-progress" id="video-progress"></div>
        </div>
      </div>

      <button class="video-btn" id="mute-btn">
        <i class="fa fa-volume-xmark"></i>
      </button>

    </div>

  </div>

</div>

        <!-- Device -->
        <div class="card">
          <div class="card-header">
            <div class="card-title"><i class="fa fa-microchip"></i> &nbsp;Visitor Scan</div>
            <div class="badge badge-blue"><i class="fa fa-wifi"></i> &nbsp;LIVE</div>
          </div>
          <div class="info-grid" id="device-info"></div>
        </div>
      </div>

      <!-- Activity + Security -->
      <div class="grid-2">
        <div class="card">
          <div class="card-header">
            <div class="card-title"><i class="fa fa-chart-line"></i> &nbsp;Activity Signal</div>
            <div class="badge badge-purple">LIVE</div>
          </div>
          <div class="mini-chart-row" id="mini-chart"></div>
          <div style="display:flex;gap:14px;margin-top:14px">
            <div class="badge badge-purple"><i class="fa fa-circle"></i> Likes</div>
            <div class="badge badge-blue"><i class="fa fa-circle"></i> Comentarios</div>
            <div class="badge badge-green"><i class="fa fa-circle"></i> Visitas</div>
          </div>
        </div>
        <div class="card">
          <div class="card-header">
            <div class="card-title"><i class="fa fa-shield"></i> &nbsp;Security Log</div>
          </div>
          <div class="info-grid">
            <div class="info-row"><span class="info-label"><i class="fa fa-database"></i> MongoDB Atlas</span><span class="info-value" id="db-status">VERIFICANDO...</span></div>
            <div class="info-row"><span class="info-label"><i class="fa fa-shield-halved"></i> Rate Limiting</span><span class="info-value" style="color:var(--green)">ACTIVO</span></div>
            <div class="info-row"><span class="info-label"><i class="fa fa-lock"></i> CORS Policy</span><span class="info-value" style="color:var(--green)">ACTIVO</span></div>
            <div class="info-row"><span class="info-label"><i class="fa fa-filter"></i> Spam Guard</span><span class="info-value" style="color:var(--green)">ACTIVO</span></div>
            <div class="info-row"><span class="info-label"><i class="fa fa-clock"></i> Uptime</span><span class="info-value" id="uptime-val">—</span></div>
          </div>
        </div>
      </div>
    </div>

    <!-- SECTION: Profile -->
    <div class="section-page" id="section-profile">
      <div class="card profile-card">
        <div class="card-header">
          <div class="card-title"><i class="fa fa-user"></i> &nbsp;Perfil Detallado</div>
          <div class="badge badge-green"><i class="fa fa-circle"></i> &nbsp;ONLINE</div>
        </div>
        <div class="profile-top">
          <div class="avatar-wrap">
            <div class="avatar-ring"></div>
            <div class="avatar" id="profile-avatar2">H</div>
            <div class="online-badge"></div>
          </div>
          <div class="profile-info">
            <div class="profile-name-row">
              <div class="profile-name" id="profile-name2">hady</div>
              <i class="fa fa-circle-check verified-tick" id="verified-tick2" style="display:none"></i>
            </div>
            <div class="profile-role" id="profile-role2">Full-Stack Developer</div>
            <div class="profile-bio" id="profile-bio2">Cargando...</div>
            <div class="profile-location" id="profile-location2"><i class="fa fa-location-dot"></i><span>Cargando...</span></div>
            <div class="profile-stack" id="profile-stack2"></div>
          </div>
        </div>
      </div>
    </div>

    <!-- SECTION: Comments -->
    <div class="section-page" id="section-comments">
      <div class="card">
        <div class="card-header">
          <div class="card-title"><i class="fa fa-comments"></i> &nbsp;Canal de Mensajes</div>
          <div class="badge badge-purple" id="comment-count-badge">0 MSGS</div>
        </div>
        <div class="comment-form">
          <div class="form-row">
            <input class="input-field" id="comment-name" placeholder="Tu nombre / ID..." maxlength="40">
            <button class="submit-btn" onclick="postComment()"><i class="fa fa-paper-plane"></i> ENVIAR</button>
          </div>
          <textarea class="input-field" id="comment-msg" placeholder="Escribe tu mensaje... (Ctrl+Enter para enviar)" maxlength="400"></textarea>
        </div>
        <div class="comments-list" id="comments-list">
          <div class="no-comments"><i class="fa fa-satellite-dish"></i> Sin transmisiones aún</div>
        </div>
      </div>
    </div>

    <!-- SECTION: Analytics -->
    <div class="section-page" id="section-analytics">
      <div class="grid-4">
        <div class="card stat-card">
          <div class="stat-icon purple"><i class="fa fa-heart"></i></div>
          <div class="stat-value" id="a-likes">—</div>
          <div class="stat-label">LIKES</div>
        </div>
        <div class="card stat-card">
          <div class="stat-icon blue"><i class="fa fa-comment"></i></div>
          <div class="stat-value" id="a-comments">—</div>
          <div class="stat-label">COMENTARIOS</div>
        </div>
        <div class="card stat-card">
          <div class="stat-icon cyan"><i class="fa fa-share-nodes"></i></div>
          <div class="stat-value" id="a-shares">—</div>
          <div class="stat-label">COMPARTIDOS</div>
        </div>
        <div class="card stat-card">
          <div class="stat-icon green"><i class="fa fa-eye"></i></div>
          <div class="stat-value" id="a-visits">—</div>
          <div class="stat-label">VISITAS</div>
        </div>
      </div>
      <div class="card">
        <div class="card-header">
          <div class="card-title"><i class="fa fa-chart-line"></i> &nbsp;Gráfica de Actividad</div>
        </div>
        <div class="mini-chart-row" id="mini-chart2" style="height:80px"></div>
      </div>
    </div>

    <!-- SECTION: Device -->
    <div class="section-page" id="section-device">
      <div class="card">
        <div class="card-header">
          <div class="card-title"><i class="fa fa-microchip"></i> &nbsp;Información del Dispositivo</div>
          <div class="badge badge-blue"><i class="fa fa-wifi"></i> &nbsp;LIVE</div>
        </div>
        <div class="info-grid" id="device-info2"></div>
      </div>
    </div>

    <!-- SECTION: Settings -->
    <div class="section-page" id="section-settings">
      <div class="card">
        <div class="card-header">
          <div class="card-title"><i class="fa fa-gear"></i> &nbsp;Configuración</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:10px">
          <div style="font-size:12px;color:var(--textm);margin-bottom:6px;font-family:'Space Mono',monospace">TEMA DE COLOR</div>
          <div style="display:flex;flex-wrap:wrap;gap:8px">
            <button class="submit-btn" onclick="setTheme('')" style="background:linear-gradient(135deg,#7c3aed,#3b82f6)">Purple</button>
            <button class="submit-btn" onclick="setTheme('green')" style="background:linear-gradient(135deg,#059669,#10b981)">Green</button>
            <button class="submit-btn" onclick="setTheme('red')" style="background:linear-gradient(135deg,#dc2626,#f43f5e)">Red</button>
            <button class="submit-btn" onclick="setTheme('cyan')" style="background:linear-gradient(135deg,#0891b2,#06b6d4)">Cyan</button>
            <button class="submit-btn" onclick="setTheme('gold')" style="background:linear-gradient(135deg,#b45309,#f59e0b)">Gold</button>
            <button class="submit-btn" onclick="setTheme('rose')" style="background:linear-gradient(135deg,#be185d,#ec4899)">Rose</button>
          </div>
          <div style="margin-top:20px;padding-top:16px;border-top:1px solid var(--border)">
            <div style="font-size:12px;color:var(--textm);margin-bottom:10px;font-family:'Space Mono',monospace">BASE DE DATOS</div>
            <div class="info-row"><span class="info-label"><i class="fa fa-database"></i> Estado</span><span class="info-value" id="db-status2">VERIFICANDO</span></div>
          </div>
        </div>
      </div>
    </div>

    <!-- SECTION: Terms -->
    <div class="section-page" id="section-terms">
      <div class="card">
        <div class="card-header">
          <div class="card-title"><i class="fa fa-file-contract"></i> &nbsp;Términos y Condiciones</div>
          <div class="badge badge-purple">LEGAL</div>
        </div>
        <div class="terms-content">
          <p>Al acceder y utilizar este sitio web, aceptas los siguientes términos y condiciones de uso.</p>
          <h3>1. USO DEL SITIO</h3>
          <p>Este sitio es de uso personal y está destinado para la presentación del perfil de hady. No se permite el uso del contenido con fines comerciales sin autorización expresa.</p>
          <h3>2. COMENTARIOS</h3>
          <p>Los comentarios publicados son responsabilidad de sus autores. Se prohíbe contenido ofensivo, spam o lenguaje inapropiado. Nos reservamos el derecho de eliminar cualquier comentario sin previo aviso.</p>
          <h3>3. PRIVACIDAD</h3>
          <p>Este sitio registra datos básicos de visita (dirección IP anonimizada) únicamente para estadísticas internas. No se comparte información con terceros.</p>
          <h3>4. PROPIEDAD INTELECTUAL</h3>
          <p>Todo el contenido de este sitio, incluyendo código, diseño y textos, es propiedad de hady salvo que se indique lo contrario.</p>
          <h3>5. LIMITACIÓN DE RESPONSABILIDAD</h3>
          <p>El sitio se proporciona "tal cual", sin garantías de ningún tipo. No nos hacemos responsables de daños derivados del uso del sitio.</p>
          <h3>6. CONTACTO</h3>
          <p>Para cualquier duda sobre estos términos, puedes contactarme a través de las redes sociales listadas en la barra lateral.</p>
        </div>
      </div>
    </div>

  </main>
</div>

<script>
'use strict';
// ─── State ─────────────────────────────────────────────────────
const S = { liked: false, stats: null, currentSection: 'overview' };

// ─── Theme ─────────────────────────────────────────────────────
function setTheme(name) {
  document.documentElement.setAttribute('data-theme', name);
  localStorage.setItem('hady-theme', name);
  closeThemePicker();
  showToast('fa-palette', 'Tema actualizado');
}
(function initTheme() {
  const saved = localStorage.getItem('hady-theme') || '';
  document.documentElement.setAttribute('data-theme', saved);
})();

// ─── Clock ────────────────────────────────────────────────────
function tickClock() {
  document.getElementById('clock').textContent =
    new Date().toLocaleTimeString('es-ES', { hour12: false });
}
setInterval(tickClock, 1000); tickClock();

// ------ NOTIFICATIONSS🌐
async function sendSystemNotification() {
  if (!("Notification" in window)) return;

  if (Notification.permission === "default") {
    await Notification.requestPermission();
  }

  if (Notification.permission === "granted") {
    new Notification("HADY Dashboard", {
      body: "Bienvenido al sistema de hady ⚡",
      icon: "https://cdn-icons-png.flaticon.com/512/5968/5968705.png",
      badge: "https://cdn-icons-png.flaticon.com/512/5968/5968705.png",
      tag: "hady-notification"
    });
  }
}

// ─── Loader ──────────────────────────────────────────────────
window.addEventListener('load', () => {
sendSystemNotification();
  const msgs = ['AUTENTICANDO...', 'CONECTANDO DB...', 'CARGANDO MÓDULOS...', 'SISTEMA LISTO'];
  let i = 0;
  const el = document.querySelector('.loader-text');
  const iv = setInterval(() => { if (i < msgs.length) el.textContent = msgs[i++]; else clearInterval(iv); }, 580);
  setTimeout(() => {
    const loader = document.getElementById('loader');
    loader.classList.add('hide');
    setTimeout(() => loader.remove(), 700);
    // Welcome notification
    setTimeout(() => {
      const notif = document.getElementById('welcome-notif');
      notif.classList.add('show');
      setTimeout(() => notif.classList.remove('show'), 5000);
    }, 800);
  }, 2500);
  loadAll();
});
//5000
// ─── Close notification ─────────────────────────────────────
function closeNotif() {
  document.getElementById('welcome-notif').classList.remove('show');
}

// ─── Sections Navigation ─────────────────────────────────────
const sectionTitles = {
  overview: ['OVERVIEW', 'DASHBOARD'],
  profile: ['PERFIL', 'IDENTIDAD'],
  comments: ['COMENTARIOS', 'CANAL'],
  analytics: ['ANALÍTICAS', 'STATS'],
  device: ['DISPOSITIVO', 'SCAN'],
  settings: ['AJUSTES', 'CONFIG'],
  terms: ['TÉRMINOS', 'LEGAL'],
};

function goSection(name) {
  document.querySelectorAll('.section-page').forEach(p => p.classList.remove('active'));
  const page = document.getElementById('section-' + name);
  if (page) page.classList.add('active');
  S.currentSection = name;

  const [title, badge] = sectionTitles[name] || [name.toUpperCase(), ''];
  document.getElementById('page-title').textContent = title;
  document.getElementById('page-badge').textContent = badge;

  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const nav = document.querySelector('.nav-item[data-section="' + name + '"]');
  if (nav) nav.classList.add('active');

  // Render section-specific content
  if (name === 'device') renderDeviceInfo('device-info2');
  if (name === 'analytics') { renderMiniChart('mini-chart2'); syncAnalytics(); }

  // Close sidebar on mobile
  if (window.innerWidth <= 700) document.getElementById('sidebar').classList.remove('open');
}

document.querySelectorAll('.nav-item[data-section]').forEach(item => {
  item.addEventListener('click', e => {
    e.preventDefault();
    goSection(item.dataset.section);
  });
});

function syncAnalytics() {
  if (!S.stats) return;
  ['likes','comments','shares','visits'].forEach(k => {
    const el = document.getElementById('a-' + k);
    if (el) el.textContent = S.stats[k] ?? '—';
  });
}

// ─── API ─────────────────────────────────────────────────────
async function api(path, method = 'GET', body = null) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(path, opts);
  return r.json();
}

async function loadAll() {
  await Promise.all([loadProfile(), loadStats(), loadComments(), loadHealth()]);
  renderDeviceInfo('device-info');
  renderMiniChart('mini-chart');
}

// ─── Health ───────────────────────────────────────────────────
async function loadHealth() {
  try {
    const h = await api('/api/health');
    const connected = h.db === 'connected';
    const statusEls = ['db-status', 'db-status-sidebar', 'db-status2'];
    statusEls.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.textContent = connected ? 'CONECTADO' : 'DEMO MODE';
      el.style.color = connected ? 'var(--green)' : 'var(--yellow)';
    });
    const uptimeEl = document.getElementById('uptime-val');
    if (uptimeEl && h.uptime) {
      const mins = Math.floor(h.uptime / 60);
      uptimeEl.textContent = mins + 'm ' + Math.floor(h.uptime % 60) + 's';
    }
  } catch {}
}

// ─── Profile ─────────────────────────────────────────────────
async function loadProfile() {
  try {
    const p = await api('/api/profile');
    // Main profile card
    ['', '2'].forEach(suffix => {
      const nameEl = document.getElementById('profile-name' + suffix);
      if (nameEl) nameEl.textContent = p.username || 'hady';
      const roleEl = document.getElementById('profile-role' + suffix);
      if (roleEl) roleEl.textContent = p.role || '';
      const bioEl = document.getElementById('profile-bio' + suffix);
      if (bioEl) bioEl.textContent = p.bio || '';
      const locEl = document.querySelector('#profile-location' + (suffix ? suffix : '') + ' span');
      if (locEl) locEl.textContent = p.location || 'Internet';

      if (p.verified) {
        ['verified-tick', 'verified-tick2'].forEach(id => {
          const el = document.getElementById(id);
          if (el) el.style.display = 'inline';
        });
      }

      const stackEl = document.getElementById('profile-stack' + suffix);
      if (stackEl) {
        stackEl.innerHTML = '';
        (p.stack || []).forEach(t => {
          const span = document.createElement('span');
          span.className = 'stack-tag'; span.textContent = t;
          stackEl.appendChild(span);
        });
      }

      // Avatar
      const avatarEl = document.getElementById('profile-avatar' + (suffix === '2' ? '2' : ''));
      if (avatarEl) {
        if (p.avatar) {
          avatarEl.innerHTML = '<img src="' + p.avatar + '" alt="hady">';
        } else {
          avatarEl.textContent = (p.username || 'H')[0].toUpperCase();
        }
      }
    });
  } catch {}
}

// ─── Stats ───────────────────────────────────────────────────
async function loadStats() {
  try {
    const s = await api('/api/stats');
    S.stats = s;
    // Update hidden stat spans (kept for analytics section)
    ['likes','comments','shares','visits'].forEach(k => {
      const el = document.getElementById('stat-' + k);
      if (el) el.textContent = s[k] ?? 0;
    });
    // Profile card counts
    const setTxt = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    setTxt('like-count', s.likes);
    setTxt('share-count', s.shares);
    setTxt('comment-count-btn', s.comments);
    setTxt('comment-count-badge', s.comments + ' MSGS');
    setTxt('nav-comment-badge', s.comments);
  } catch {}
}

function animCount(id, target) {
  const el = document.getElementById(id);
  if (!el) return;
  const dur = 900; const t0 = performance.now();
  function step(now) {
    const p = Math.min((now - t0) / dur, 1);
    el.textContent = Math.round(easeOut(p) * target);
    if (p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

// ─── Like ─────────────────────────────────────────────────────
async function handleLike() {
  if (S.liked) { showToast('fa-heart', 'Ya diste like en esta sesión'); return; }
  try {
    const r = await api('/api/like', 'POST');
    if (r.success) {
      S.liked = true;
      document.getElementById('like-btn').classList.add('active');
      document.getElementById('like-count').textContent = r.count;
      document.getElementById('stat-likes').textContent = r.count;
      showToast('fa-heart', '¡Like registrado! Gracias');
    } else {
      showToast('fa-triangle-exclamation', r.message || 'Ya diste like');
    }
  } catch { showToast('fa-circle-xmark', 'Error de conexión'); }
}

// ─── Share ────────────────────────────────────────────────────
async function handleShare() {
  try {
    const url = window.location.href;
    if (navigator.share) {
      await navigator.share({ title: 'hady — Dashboard', url });
    } else {
      await navigator.clipboard.writeText(url);
      showToast('fa-copy', 'URL copiada al portapapeles');
    }
    const r = await api('/api/share', 'POST');
    document.getElementById('share-count').textContent = r.count;
    document.getElementById('stat-shares').textContent = r.count;
  } catch {}
}

// ─── Comments ─────────────────────────────────────────────────
async function postComment() {
  const name = document.getElementById('comment-name').value.trim();
  const message = document.getElementById('comment-msg').value.trim();
  if (!name || !message) { showToast('fa-triangle-exclamation', 'Nombre y mensaje requeridos'); return; }
  try {
    const r = await api('/api/comment', 'POST', { name, message });
    if (r.success) {
      document.getElementById('comment-name').value = '';
      document.getElementById('comment-msg').value = '';
      showToast('fa-check', 'Mensaje enviado ✓');
      await loadComments();
      await loadStats();
    } else { showToast('fa-circle-xmark', r.error || 'Error'); }
  } catch { showToast('fa-circle-xmark', 'Error de conexión'); }
}

async function loadComments() {
  try {
    const comments = await api('/api/comments');
    const list = document.getElementById('comments-list');
    if (!comments.length) {
      list.innerHTML = '<div class="no-comments"><i class="fa fa-satellite-dish"></i> Sin transmisiones aún</div>';
      return;
    }
    list.innerHTML = comments.map(c => {
      const initial = (c.name || '?')[0].toUpperCase();
      const dateObj = new Date(c.createdAt);
      const dateStr = dateObj.toLocaleDateString('es-ES', { day:'2-digit', month:'short', year:'numeric' });
      const timeStr = dateObj.toLocaleTimeString('es-ES', { hour:'2-digit', minute:'2-digit' });
      const fullDate = dateStr + ' · ' + timeStr;
      // Anonymous avatar colors based on name
      const colors = ['#7c3aed','#3b82f6','#06b6d4','#10b981','#f59e0b','#f43f5e','#ec4899'];
      const colorIdx = c.name.charCodeAt(0) % colors.length;
      const bgColor = colors[colorIdx];

      return \`
        <div class="comment-item">
          <div class="comment-avatar" style="background:\${bgColor}">\${initial}</div>
          <div class="comment-body">
            <div class="comment-meta">
              <span class="comment-name">\${esc(c.name)}</span>
              <span class="comment-time" title="\${fullDate}">\${dateStr} \${timeStr}</span>
            </div>
            <div class="comment-msg">\${esc(c.message)}</div>
            <div class="comment-actions">
              <div class="comment-action-btn" onclick="copyComment('\${esc(c.message)}')">
                <i class="fa fa-copy"></i> Copiar
              </div>
              <div class="comment-action-btn" title="Fecha completa: \${fullDate}">
                <i class="fa fa-clock"></i> \${fullDate}
              </div>
            </div>
          </div>
        </div>
      \`;
    }).join('');
    document.getElementById('comment-count-badge').textContent = comments.length + ' MSGS';
    document.getElementById('comment-count-btn').textContent = comments.length;
    document.getElementById('nav-comment-badge').textContent = comments.length;
  } catch {}
}

function copyComment(text) {
  navigator.clipboard.writeText(text).then(() => {
    showToast('fa-copy', 'Comentario copiado');
  }).catch(() => showToast('fa-circle-xmark', 'No se pudo copiar'));
}

function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── Device Info ─────────────────────────────────────────────
async function renderDeviceInfo(containerId) {
  const ua = navigator.userAgent;
  function getBrowser() {
    if (ua.includes('Firefox')) return 'Firefox';
    if (ua.includes('Edg')) return 'Edge';
    if (ua.includes('OPR') || ua.includes('Opera')) return 'Opera';
    if (ua.includes('Chrome')) return 'Chrome';
    if (ua.includes('Safari')) return 'Safari';
    return 'Desconocido';
  }
  function getOS() {
    if (ua.includes('Windows')) return 'Windows';
    if (ua.includes('Mac')) return 'macOS';
    if (ua.includes('Android')) return 'Android';
    if (ua.includes('iPhone') || ua.includes('iPad')) return 'iOS';
    if (ua.includes('Linux')) return 'Linux';
    return navigator.platform || 'Desconocido';
  }

  const rows = [
    { icon:'fa-desktop',   label:'Sistema Operativo', value: getOS() },
    { icon:'fa-globe',     label:'Navegador',          value: getBrowser() },
    { icon:'fa-expand',    label:'Resolución',         value: screen.width+'×'+screen.height },
    { icon:'fa-language',  label:'Idioma',             value: navigator.language },
    { icon:'fa-microchip', label:'Núcleos CPU',        value: (navigator.hardwareConcurrency||'N/A')+' cores' },
    { icon:'fa-memory',    label:'RAM',                value: navigator.deviceMemory ? navigator.deviceMemory+' GB' : 'N/A' },
    { icon:'fa-clock',     label:'Zona Horaria',       value: Intl.DateTimeFormat().resolvedOptions().timeZone },
    { icon:'fa-bolt',      label:'Batería',            value: 'Detectando...' },
  ];

  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = rows.map((r, i) => \`
    <div class="info-row">
      <span class="info-label"><i class="fa \${r.icon}"></i> \${r.label}</span>
      <span class="info-value" id="\${containerId}-dv-\${i}">\${r.value}</span>
    </div>
  \`).join('');

  if ('getBattery' in navigator) {
    try {
      const bat = await navigator.getBattery();
      const pct = Math.round(bat.level * 100);
      const el = document.getElementById(containerId + '-dv-7');
      if (el) el.innerHTML = \`
        <div class="battery-bar-wrap">
          <div class="battery-outer">
            <div class="battery-tip"></div>
            <div class="battery-inner" style="width:\${pct}%;background:\${pct>30?'var(--green)':'var(--red)'}"></div>
          </div>
          <span>\${pct}%\${bat.charging?' <i class=\\"fa fa-bolt\\" style=\\"font-size:9px\\"></i>':''}</span>
        </div>\`;
    } catch {}
  }
}

// ─── Mini Chart ───────────────────────────────────────────────
function renderMiniChart(containerId) {
  const heights = Array.from({length:16}, () => 15 + Math.random()*85);
  const container = document.getElementById(containerId || 'mini-chart');
  if (!container) return;
  container.innerHTML = heights.map((h, i) => \`
    <div class="mini-bar" style="height:\${h}%;animation-delay:\${i*50}ms" title="Actividad"></div>
  \`).join('');
}

// ─── Toast ────────────────────────────────────────────────────
function showToast(icon, msg) {
  const container = document.getElementById('toast');
  const el = document.createElement('div');
  el.className = 'toast-item';
  el.innerHTML = \`<i class="fa \${icon}"></i> \${msg}\`;
  container.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateX(20px)'; el.style.transition = '0.3s'; }, 2500);
  setTimeout(() => el.remove(), 2800);
}

// ─── Mobile Sidebar ───────────────────────────────────────────
(function() {
  const hamburger = document.getElementById('hamburger');
  const sidebar = document.getElementById('sidebar');
  let sidebarClickPending = false;

  hamburger.addEventListener('click', (e) => {
    e.stopPropagation();
    sidebarClickPending = true;
    sidebar.classList.toggle('open');
    setTimeout(() => { sidebarClickPending = false; }, 10);
  });

  document.addEventListener('click', (e) => {
    if (sidebarClickPending) return;
    if (sidebar.classList.contains('open') && !sidebar.contains(e.target)) {
      sidebar.classList.remove('open');
    }
  });
})();

// ─── Theme picker — fixed position near button ────────────────
(function() {
  const btn = document.getElementById('theme-picker-btn');
  const dd = document.getElementById('theme-dropdown');
  let ddOpen = false;

  function openDD() {
    const rect = btn.getBoundingClientRect();
    dd.style.top = (rect.bottom + 8) + 'px';
    dd.style.right = (window.innerWidth - rect.right) + 'px';
    dd.classList.add('open');
    ddOpen = true;
  }
  function closeDD() { dd.classList.remove('open'); ddOpen = false; }

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (ddOpen) closeDD(); else openDD();
  });

  dd.addEventListener('click', (e) => { e.stopPropagation(); });

  document.addEventListener('click', () => { if (ddOpen) closeDD(); });
  window.addEventListener('resize', () => { if (ddOpen) closeDD(); });
})();

// ─── Keyboard shortcuts ───────────────────────────────────────
document.getElementById('comment-name')?.addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('comment-msg')?.focus();
});
document.getElementById('comment-msg')?.addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.ctrlKey) postComment();
});
const video = document.getElementById('cinematic-video');
const playBtn = document.getElementById('play-btn');
const muteBtn = document.getElementById('mute-btn');
const progress = document.getElementById('video-progress');

if (video) {

  playBtn.onclick = () => {
    if (video.paused) {
      video.play();
      playBtn.innerHTML = '<i class="fa fa-pause"></i>';
    } else {
      video.pause();
      playBtn.innerHTML = '<i class="fa fa-play"></i>';
    }
  };

  muteBtn.onclick = () => {
    video.muted = !video.muted;

    muteBtn.innerHTML = video.muted
      ? '<i class="fa fa-volume-xmark"></i>'
      : '<i class="fa fa-volume-high"></i>';
  };

  video.addEventListener('timeupdate', () => {
    const percent = (video.currentTime / video.duration) * 100;
    progress.style.width = percent + '%';
  });

}
</script>
</body>
</html>`);
});

// ── Start ─────────────────────────────────────────────────────
async function start() {
  await connectDB();
  app.listen(PORT, () => {
    console.log(`[SYS] hady Dashboard running`);
    console.log(`[SYS] http://localhost:\${PORT}`);
  });
}

start();
