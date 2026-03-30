const express = require("express");
const { MongoClient } = require("mongodb");
const app = express();

app.use(express.json());

// 🔥 MONGODB
const uri = "mongodb+srv://shiba:0939907556a@cluster0.me1iztn.mongodb.net/?retryWrites=true&w=majority";
const client = new MongoClient(uri);

let keysCollection;

// ✅ SAFE GET IP (FIX CRASH)
function getIP(req) {
    try {
        let ip = (req.headers["x-forwarded-for"] || "").split(",")[0] || req.socket.remoteAddress || "unknown";
        if (ip.includes("::ffff:")) ip = ip.replace("::ffff:", "");
        return ip;
    } catch {
        return "unknown";
    }
}

// CONNECT DB
async function connectDB() {
    await client.connect();
    const db = client.db("keysystem");
    keysCollection = db.collection("keys");
    console.log("✅ MongoDB Connected");

    // 🧹 AUTO CLEAN (SAFE)
    setInterval(async () => {
        try {
            if (!keysCollection) return;

            const now = Date.now();

            const result = await keysCollection.deleteMany({
                expire: { $lt: now }
            });

            console.log("🧹 Cleaned:", result.deletedCount);
        } catch (err) {
            console.log("❌ Clean error:", err.message);
        }
    }, 60 * 1000);
}

// RATE LIMIT
let requests = {};

function isRateLimited(ip) {
    try {
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
    } catch {
        return false;
    }
}

// ANTI SLEEP
app.get("/ping", (req, res) => {
    res.send("ok");
});

// HOME
app.get("/", (req, res) => {
    res.send("Key system is running!");
});

// GUI (GIỮ NGUYÊN)
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
    try {
        const session = Math.random().toString(36).substring(2, 10);

        await keysCollection.insertOne({
            key: session,
            session: true,
            expire: Date.now() + 10 * 60 * 1000
        });

        res.redirect(`/getkey?session=${session}&hwid=${req.query.hwid || ""}`);
    } catch {
        res.send("❌ Server error");
    }
});

// GET KEY
app.get("/getkey", async (req, res) => {
    try {
        const ip = getIP(req);

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

        await keysCollection.deleteMany({
            ip: ip,
            session: { $ne: true },
            expire: { $lt: Date.now() }
        });

        const existing = await keysCollection.findOne({
            ip: ip,
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
            hwid: null,
            expire: Date.now() + 24 * 60 * 60 * 1000
        });

        return sendKeyPage(res, key);

    } catch {
        return res.send("❌ Server error");
    }
});

// VERIFY
app.get("/verify", async (req, res) => {
    try {
        const { key, hwid } = req.query;
        const ip = getIP(req);

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

        if (!data.hwid) {
            await keysCollection.updateOne(
                { key },
                { $set: { hwid: hwid, ip: ip } }
            );
        } else if (data.hwid !== hwid) {
            return res.json({ success: false });
        }

        return res.json({ success: true });

    } catch {
        return res.json({ success: false });
    }
});

// 🔥 CHỐNG CRASH TOÀN SERVER
process.on("uncaughtException", (err) => {
    console.error("💥 Uncaught:", err);
});

process.on("unhandledRejection", (err) => {
    console.error("💥 Rejection:", err);
});

// START SERVER
async function startServer() {
    try {
        await connectDB();
        const PORT = process.env.PORT || 3000;
        app.listen(PORT, () => {
            console.log("🚀 Server running");
        });
    } catch (err) {
        console.error("❌ Failed to start:", err);
    }
}

// =======================
// 🔥 START PAGE
// =======================
app.get("/start", (req, res) => {
    const target = req.query.target;

    res.send(`
    <html>
    <head>
    <style>
    body {
        margin:0;
        background: radial-gradient(circle at top, #0f172a, #020617);
        color: white;
        font-family: 'Segoe UI', sans-serif;
        display:flex;
        justify-content:center;
        align-items:center;
        height:100vh;
    }
    .box {
        background:#1e293b;
        padding:35px;
        border-radius:18px;
        text-align:center;
        width:340px;
        box-shadow: 0 0 50px rgba(99,102,241,0.25);
    }
    .brand {
        font-size:20px;
        font-weight:600;
        margin-bottom:10px;
        color:#818cf8;
    }
    h2 {
        margin-bottom:10px;
    }
    p {
        color:#94a3b8;
        font-size:14px;
    }
    button {
        margin-top:20px;
        padding:12px 25px;
        border:none;
        border-radius:12px;
        background:#6366f1;
        color:white;
        cursor:pointer;
        font-size:15px;
        transition:0.2s;
    }
    button:disabled {
        background:#374151;
        cursor:not-allowed;
    }
    button:hover:not(:disabled){
        transform:scale(1.05);
    }
    .bar {
        height:5px;
        width:0%;
        background:#6366f1;
        border-radius:10px;
        margin-top:15px;
        transition:width 1s linear;
    }
    </style>
    </head>

    <body>
        <div class="box">
            <div class="brand">Shiba - Get Key</div>

            <h2>Verification Step</h2>
            <p>Click continue to verify</p>

            <button id="btn">Continue</button>
            <div class="bar" id="bar"></div>
        </div>

        <script>
        let btn = document.getElementById("btn");
        let bar = document.getElementById("bar");

        btn.onclick = () => {
            btn.disabled = true;

            let t = 5;
            btn.innerText = "Wait " + t + "s";

            let i = setInterval(() => {
                t--;
                bar.style.width = ((5 - t) * 20) + "%";

                if(t > 0){
                    btn.innerText = "Wait " + t + "s";
                }

                if(t <= 0){
                    clearInterval(i);
                    window.location.href = target;
                }
            }, 1000);
        }
        </script>
    </body>
    </html>
    `);
});


// =======================
// 🔥 FINISH PAGE
// =======================
app.get("/finish", (req, res) => {
    res.send(`
    <html>
    <head>
    <style>
    body {
        margin:0;
        background: radial-gradient(circle at top, #0f172a, #020617);
        color:white;
        font-family:'Segoe UI', sans-serif;
        display:flex;
        justify-content:center;
        align-items:center;
        height:100vh;
    }
    .box {
        background:#1e293b;
        padding:35px;
        border-radius:18px;
        text-align:center;
        width:340px;
        box-shadow: 0 0 50px rgba(99,102,241,0.25);
    }
    .brand {
        font-size:20px;
        font-weight:600;
        margin-bottom:10px;
        color:#22c55e;
    }
    button {
        margin-top:20px;
        padding:12px 25px;
        border:none;
        border-radius:12px;
        background:#22c55e;
        color:white;
        cursor:pointer;
        font-size:15px;
    }
    button:disabled {
        background:#374151;
    }
    .bar {
        height:5px;
        width:0%;
        background:#22c55e;
        border-radius:10px;
        margin-top:15px;
        transition:width 1s linear;
    }
    </style>
    </head>

    <body>
        <div class="box">
            <div class="brand">Shiba - Get Key</div>

            <h2>Generate Key</h2>
            <p>Click to finish and receive your key</p>

            <button id="btn">Get Key</button>
            <div class="bar" id="bar"></div>
        </div>

        <script>
        let btn = document.getElementById("btn");
        let bar = document.getElementById("bar");

        btn.onclick = () => {
            btn.disabled = true;

            let t = 3;
            btn.innerText = "Wait " + t + "s";

            let i = setInterval(() => {
                t--;
                bar.style.width = ((3 - t) * 33) + "%";

                if(t > 0){
                    btn.innerText = "Wait " + t + "s";
                }

                if(t <= 0){
                    clearInterval(i);
                    window.location.href = "/checkpoint";
                }
            }, 1000);
        }
        </script>
    </body>
    </html>
    `);
});
startServer();
