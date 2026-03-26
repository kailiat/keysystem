const express = require("express");
const { MongoClient } = require("mongodb");
const app = express();

app.use(express.json());

// 🔥 MONGODB
const uri = "mongodb+srv://shiba:0939907556a@cluster0.me1iztn.mongodb.net/?retryWrites=true&w=majority";
const client = new MongoClient(uri);

let keysCollection;

// CONNECT DB
async function connectDB() {
    await client.connect();
    const db = client.db("keysystem");
    keysCollection = db.collection("keys");
    console.log("✅ MongoDB Connected");
}
connectDB();

// 🧹 AUTO CLEAN
setInterval(async () => {
    const now = Date.now();

    await keysCollection.deleteMany({
        expire: { $lt: now }
    });

    console.log("🧹 Cleaned expired keys");
}, 60 * 1000);

// RATE LIMIT
let requests = {};

function isRateLimited(ip) {
    const now = Date.now();

    if (!requests[ip]) {
        requests[ip] = [];
    }

    requests[ip] = requests[ip].filter(t => now - t < 10000);

    if (requests[ip].length >= 5) {
        return true;
    }

    requests[ip].push(now);
    return false;
}

// ANTI SLEEP
app.get("/ping", (req, res) => {
    res.send("ok");
});

// HOME
app.get("/", (req, res) => {
    res.send("Key system is running!");
});

// GUI
function sendKeyPage(res, key) {
    res.send(`<!DOCTYPE html>
<html>
<head>
<title>Get Key</title>
<style>
body {
    background: #0f172a;
    color: white;
    font-family: Arial;
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100vh;
    margin: 0;
}
.box {
    background: #1e293b;
    padding: 30px;
    border-radius: 15px;
    text-align: center;
}
.key {
    background: #0f172a;
    padding: 15px;
    border-radius: 10px;
    font-size: 20px;
    margin-bottom: 15px;
    letter-spacing: 2px;
}
button {
    padding: 10px 20px;
    border: none;
    border-radius: 10px;
    background: #6366f1;
    color: white;
    cursor: pointer;
}
</style>
</head>
<body>
<div class="box">
    <h2>Your Key</h2>
    <div class="key" id="key">${key}</div>
    <button onclick="copyKey()">Copy</button>
</div>

<script>
function copyKey() {
    const key = document.getElementById("key").innerText;
    navigator.clipboard.writeText(key);
    alert("Copied!");
}
</script>
</body>
</html>`);
}

// CHECKPOINT
app.get("/checkpoint", async (req, res) => {
    const session = Math.random().toString(36).substring(2, 10);

    await keysCollection.insertOne({
        key: session,
        session: true,
        expire: Date.now() + 10 * 60 * 1000
    });

    res.redirect(`/getkey?session=${session}&hwid=${req.query.hwid || ""}`);
});

// GET KEY
app.get("/getkey", async (req, res) => {
    const ip = (req.headers["x-forwarded-for"] || "").split(",")[0] || req.socket.remoteAddress;
    const { hwid } = req.query;

    if (isRateLimited(ip)) {
        return res.send("❌ Too many requests");
    }

    const session = req.query.session;

    const sessionData = await keysCollection.findOne({ key: session, session: true });

    if (!sessionData) {
        return res.send("❌ Invalid session");
    }

    if (Date.now() > sessionData.expire) {
        await keysCollection.deleteOne({ key: session });
        return res.send("❌ Session expired");
    }

    // 🔥 NÂNG CẤP: CHECK THEO HWID (KHÔNG THEO IP)
    const existing = await keysCollection.findOne({
        hwid: hwid,
        session: { $ne: true },
        expire: { $gt: Date.now() }
    });

    if (existing) {
        return sendKeyPage(res, existing.key);
    }

    const key = Math.random().toString(36).substring(2, 10).toUpperCase();

    await keysCollection.insertOne({
        key: key,
        ip: ip,
        hwid: hwid,
        expire: Date.now() + 24 * 60 * 60 * 1000
    });

    await keysCollection.deleteOne({ key: session });

    return sendKeyPage(res, key);
});

// VERIFY
app.get("/verify", async (req, res) => {
    const { key, hwid } = req.query;

    const ip = (req.headers["x-forwarded-for"] || "").split(",")[0] || req.socket.remoteAddress;

    if (isRateLimited(ip)) {
        return res.json({ success: false });
    }

    const data = await keysCollection.findOne({ key, session: { $ne: true } });

    if (!data) {
        return res.json({ success: false });
    }

    if (Date.now() > data.expire) {
        await keysCollection.deleteOne({ key });
        return res.json({ success: false });
    }

    // 🔥 CHỐNG SHARE KEY THEO HWID
    if (data.hwid !== hwid) {
        return res.json({ success: false });
    }

    return res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log("🚀 Server running");
});
