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
// 🔥 START PAGE (FIX FULL - KHÔNG DÙNG TARGET)
// =======================
app.get("/start", (req, res) => {

    res.send(`
    <html>
    <head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">

    <style>
    body {
        margin:0;
        background: radial-gradient(circle at top, #0f172a, #020617);
        color: white;
        font-family: Arial;
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
        width:320px;
        box-shadow: 0 0 40px rgba(99,102,241,0.2);
    }
    .logo {
        font-size:18px;
        font-weight:600;
        margin-bottom:10px;
        color:#a5b4fc;
    }
    h2 { margin-bottom:10px; }
    p { color:#94a3b8; font-size:14px; }

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

    button:disabled { background:#374151; cursor:not-allowed; }
    button:hover:not(:disabled){ transform:scale(1.05); }

    .bar {
        height:5px;
        width:0%;
        background:#6366f1;
        border-radius:10px;
        margin-top:15px;
        transition:width 1s linear;
    }

    @media (max-width: 600px) {
        body { padding: 15px; }
        .box {
            width: 100%;
            max-width: 420px;
            padding: 50px;
            border-radius: 22px;
        }
        .logo { font-size: 22px; }
        h2 { font-size: 24px; }
        p { font-size: 17px; }
        button {
            width: 100%;
            padding: 16px;
            font-size: 18px;
        }
    }
    </style>
    </head>

    <body>
        <div class="box">
            <div class="logo">Shiba - Get Key</div>

            <h2>Verification Step</h2>
            <p>Click continue to verify</p>

<button onclick="window.open('https://youtube.com/shorts/ngSGMAI-V6Q?si=t6mlKcBsBT7fBh3w','_blank')" style="
display:block;
width:100%;
margin-top:12px;
padding:12px;
border:none;
border-radius:12px;
background:#ff0000;
color:white;
cursor:pointer;
font-size:15px;
">
▶ Watch Tutorial
</button>

            <button id="btn">Continue</button>
            <div class="bar" id="bar"></div>
        </div>

        <script>
        localStorage.removeItem("shiba_extra");
        localStorage.removeItem("shiba_step");

        let btn = document.getElementById("btn");
        let bar = document.getElementById("bar");

        let started = false;

        btn.onclick = () => {

            if (started) {

                const params = new URLSearchParams(window.location.search);
                const type = params.get("type");

                let step = localStorage.getItem("shiba_step");

                // 👉 LẦN 1 → SMARTLINK (1 LINK DUY NHẤT)
                if (!step) {
                    localStorage.setItem("shiba_step", "1");
                    // 🔐 tạo token + expire 10 phút
let token = Math.random().toString(36).substring(2, 10);

let tokenData = {
    value: token,
    expire: Date.now() + 60 * 60 * 1000
};

localStorage.setItem("shiba_token", JSON.stringify(tokenData));

                    let rand = Math.random();
let link;

if (rand < 0.5) {
    link = "https://www.profitablecpmratenetwork.com/fi1wrgcuw?key=a69f7fb8b7d3e7f2ccc8f01d4278bd2d";
} else {
    link = "https://www.modcraftforge.com/roblox/blox-fruits-script-auto-farm-mastery-2025?pub=3343337";
}

                    let win = window.open(link, "_blank");

                    if (!win) {
                        window.location.href = link;
                    }

                    return;
                }

                // 👉 LẦN 2 → LINKVERTISE / LOOTLABS
                if (step === "1") {
                    localStorage.setItem("shiba_step", "2");

                    let url = null;

                    if (type === "lv") {
                        url = "https://link-target.net/4248703/h4J9AzNpDif7";
                    } else if (type === "ll") {
                        url = "https://lootdest.org/s?KHhWiw31";
                    }

                    if (!url) {
                        alert("Invalid link");
                        return;
                    }

                    window.location.href = url;
                    return;
                }
            }

            started = true;
            btn.disabled = true;

            let t = 3;
            btn.innerText = "Wait " + t + "s";

            let i = setInterval(() => {
                t--;
                bar.style.width = ((3 - t) * 33) + "%";

                if (t > 0) btn.innerText = "Wait " + t + "s";

                if (t <= 0) {
                    clearInterval(i);
                    bar.style.width = "100%";
                    btn.innerText = "Continue";
                    btn.disabled = false;
                }
            }, 1000);
        }
        </script>
    </body>
    </html>
    `);
});

// =======================
// 🔥 FINISH PAGE (CLICK → 3s → CLICK AGAIN)
// =======================
app.get("/finish", (req, res) => {
    res.send(`
    <html>
    <head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">

    <style>
    body {
        margin:0;
        background: radial-gradient(circle at top, #0f172a, #020617);
        color:white;
        font-family: Arial;
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
        width:320px;
        box-shadow: 0 0 40px rgba(99,102,241,0.2);
    }
    .logo {
        font-size:18px;
        font-weight:600;
        margin-bottom:10px;
        color:#a5b4fc;
    }
    h2 { margin-bottom:10px; }
    p { color:#94a3b8; font-size:14px; }

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

    button:disabled { background:#374151; }

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
            <div class="logo">Shiba - Get Key</div>

            <h2>Generating Key...</h2>
            <p>Click button to finish</p>

            <button id="btn">Get Key</button>
            <div class="bar" id="bar"></div>
        </div>

        <script>

// 🔒 CHẶN BYPASS + TOKEN CHECK (FINAL FIX)
let raw = localStorage.getItem("shiba_token");
let data = null;

if (raw) {
    try {
        data = JSON.parse(raw);
    } catch (e) {
        data = null;
    }
}

if (!data || Date.now() > data.expire) {
    localStorage.removeItem("shiba_token");

    document.body.innerHTML = \`
    <div style="
        display:flex;
        justify-content:center;
        align-items:center;
        height:100vh;
        background: radial-gradient(circle at top, #0f172a, #020617);
        font-family: Arial;
    ">
        <div style="
            background:#1e293b;
            padding:35px;
            border-radius:18px;
            text-align:center;
            width:320px;
            box-shadow: 0 0 40px rgba(99,102,241,0.2);
            color:white;
        ">
            <div style="
                font-size:18px;
                font-weight:600;
                margin-bottom:10px;
                color:#a5b4fc;
            ">
                Shiba - Get Key
            </div>

            <h2 style="margin-bottom:10px;">Session Expired</h2>

            <p style="
                color:#94a3b8;
                font-size:14px;
                margin-bottom:20px;
            ">
                This link is no longer valid.<br>
                Please go back and get a new key.
            </p>
        </div>
    </div>
    \`;

} else {

    let btn = document.getElementById("btn");
    let bar = document.getElementById("bar");

    let started = false;

    btn.onclick = () => {

        if (started) {

            const first = localStorage.getItem("shiba_first");

            if (!first) {
                localStorage.setItem("shiba_first", "1");

                let rand = Math.random();
                let link;

                if (rand < 0.5) {
                    link = "https://www.profitablecpmratenetwork.com/fi1wrgcuw?key=a69f7fb8b7d3e7f2ccc8f01d4278bd2d";
                } else {
                    link = "https://www.modcraftforge.com/roblox/blox-fruits-script-auto-farm-mastery-2025?pub=3343337";
                }

                let win = window.open(link, "_blank");

                if (!win) {
                    window.location.href = link;
                }

                return;
            }

            const done = localStorage.getItem("shiba_extra");

            if (!done) {
                localStorage.setItem("shiba_extra", "1");

                let rand = Math.random();
                let link;

                if (rand < 0.5) {
                    link = "https://www.profitablecpmratenetwork.com/fi1wrgcuw?key=a69f7fb8b7d3e7f2ccc8f01d4278bd2d";
                } else {
                    link = "https://www.modcraftforge.com/roblox/blox-fruits-script-auto-farm-mastery-2025?pub=3343337";
                }

                let win = window.open(link, "_blank");

                if (!win) {
                    window.location.href = link;
                }

                return;
            }

            localStorage.removeItem("shiba_extra");
            localStorage.removeItem("shiba_first");

            window.location.href = "/checkpoint";
            return;
        }

        started = true;
        btn.disabled = true;

        let t = 3;
        btn.innerText = "Wait " + t + "s";

        let i = setInterval(() => {
            t--;
            bar.style.width = ((3 - t) * 33) + "%";

            if (t > 0) btn.innerText = "Wait " + t + "s";

            if (t <= 0) {
                clearInterval(i);
                bar.style.width = "100%";
                btn.innerText = "Get Key";
                btn.disabled = false;
            }
        }, 1000);
    };

}

        </script>
    </body>
    </html>
    `);
});
startServer();
