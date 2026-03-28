const express = require("express");
const { MongoClient } = require("mongodb");
const app = express();

app.use(express.json());

// 🔥 MONGODB
const uri = "mongodb+srv://shiba:0939907556a@cluster0.me1iztn.mongodb.net/?retryWrites=true&w=majority";
const client = new MongoClient(uri);

let keysCollection = null;

// CONNECT DB + FIX AUTO CLEAN
async function connectDB() {
    try {
        await client.connect();
        const db = client.db("keysystem");
        keysCollection = db.collection("keys");
        console.log("✅ MongoDB Connected");

        // 🧹 AUTO CLEAN
        setInterval(async () => {
            if (!keysCollection) return;

            try {
                const now = Date.now();

                const result = await keysCollection.deleteMany({
                    expire: { $lt: now }
                });

                console.log("🧹 Cleaned:", result.deletedCount);
            } catch (err) {
                console.log("❌ Clean error:", err);
            }
        }, 60 * 1000);

    } catch (err) {
        console.log("❌ MongoDB ERROR:", err);
    }
}

connectDB();

// 🔥 MIDDLEWARE CHỐNG CRASH
function checkDB(req, res, next) {
    if (!keysCollection) {
        return res.send("⚠️ Server warming up, try again...");
    }
    next();
}

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

// GUI (giữ nguyên)
function sendKeyPage(res, key) {
    res.send(`<!DOCTYPE html>
<html>
<head>
<title>Get Key</title>
</head>
<body>
<h2>${key}</h2>
</body>
</html>`);
}

// CHECKPOINT
app.get("/checkpoint", checkDB, async (req, res) => {
    const session = Math.random().toString(36).substring(2, 10);

    await keysCollection.insertOne({
        key: session,
        session: true,
        expire: Date.now() + 10 * 60 * 1000
    });

    res.redirect(`/getkey?session=${session}&hwid=${req.query.hwid || ""}`);
});

// GET KEY
app.get("/getkey", checkDB, async (req, res) => {
    const ip = (req.headers["x-forwarded-for"] || "").split(",")[0] || req.socket.remoteAddress;

    if (isRateLimited(ip)) {
        return res.send("❌ Too many requests");
    }

    const session = req.query.session;

    const sessionData = await keysCollection.findOne({ key: session, session: true });

    if (!sessionData) return res.send("❌ Invalid session");

    if (Date.now() > sessionData.expire) {
        await keysCollection.deleteOne({ key: session });
        return res.send("❌ Session expired");
    }

    const existing = await keysCollection.findOne({
        ip: ip,
        session: { $ne: true }
    });

    if (existing) {
        if (Date.now() > existing.expire) {
            await keysCollection.deleteOne({ key: existing.key });
        } else {
            return sendKeyPage(res, existing.key);
        }
    }

    const key = Math.random().toString(36).substring(2, 10).toUpperCase();

    await keysCollection.insertOne({
        key,
        ip,
        hwid: null,
        expire: Date.now() + 24 * 60 * 60 * 1000
    });

    return sendKeyPage(res, key);
});

// VERIFY
app.get("/verify", checkDB, async (req, res) => {
    const { key, hwid } = req.query;

    const ip = (req.headers["x-forwarded-for"] || "").split(",")[0] || req.socket.remoteAddress;

    if (isRateLimited(ip)) {
        return res.json({ success: false });
    }

    const data = await keysCollection.findOne({ key, session: { $ne: true } });

    if (!data) return res.json({ success: false });

    if (Date.now() > data.expire) {
        await keysCollection.deleteOne({ key });
        return res.json({ success: false });
    }

    if (!data.hwid) {
        await keysCollection.updateOne(
            { key },
            { $set: { hwid, ip } }
        );
    } else if (data.hwid !== hwid) {
        return res.json({ success: false });
    }

    return res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log("🚀 Server running");
});
