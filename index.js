const express = require("express");
const fs = require("fs");
const app = express();

app.use(express.json());

// LOAD FILE
let keys = {};
try {
    keys = JSON.parse(fs.readFileSync("keys.json"));
} catch {
    keys = {};
}

// SAVE
function saveKeys() {
    fs.writeFileSync("keys.json", JSON.stringify(keys, null, 2));
}

// 🧹 AUTO CLEAN (MỖI 60 GIÂY)
setInterval(() => {
    const now = Date.now();
    let changed = false;

    for (let k in keys) {
        if (keys[k].expire && now > keys[k].expire) {
            delete keys[k];
            changed = true;
        }
    }

    if (changed) {
        saveKeys();
        console.log("🧹 Cleaned expired keys");
    }
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
app.get("/checkpoint", (req, res) => {
    const session = Math.random().toString(36).substring(2, 10);

    keys[session] = {
        session: true,
        expire: Date.now() + 10 * 60 * 1000
    };

    saveKeys();

    res.redirect(`/getkey?session=${session}`);
});

// GET KEY
app.get("/getkey", (req, res) => {
    const ip = (req.headers["x-forwarded-for"] || "").split(",")[0] || req.socket.remoteAddress;

    if (isRateLimited(ip)) {
        return res.send("❌ Too many requests");
    }

    const session = req.query.session;

    if (!session || !keys[session]) {
        return res.send("❌ Invalid session");
    }

    if (Date.now() > keys[session].expire) {
        delete keys[session];
        saveKeys();
        return res.send("❌ Session expired");
    }

    // 🔒 Nếu IP đã có key chưa hết hạn → trả lại key cũ
    for (let k in keys) {
        if (keys[k].ip === ip && Date.now() < keys[k].expire) {
            return sendKeyPage(res, k);
        }
    }

    const key = Math.random().toString(36).substring(2, 10).toUpperCase();

    keys[key] = {
        ip: ip,
        hwid: null,
        expire: Date.now() + 24 * 60 * 60 * 1000
    };

    delete keys[session];
    saveKeys();

    return sendKeyPage(res, key);
});

// VERIFY (🔥 FIX RESET + RETRY)
app.get("/verify", (req, res) => {
    const { key, hwid } = req.query;

    const ip = (req.headers["x-forwarded-for"] || "").split(",")[0] || req.socket.remoteAddress;

    if (isRateLimited(ip)) {
        return res.json({ success: false });
    }

    // 🔥 FIX: retry tìm key (tránh render reset)
    let data = null;

    for (let i = 0; i < 5; i++) {
        if (key && keys[key]) {
            data = keys[key];
            break;
        }

        // thử reload file
        try {
            keys = JSON.parse(fs.readFileSync("keys.json"));
        } catch {}

        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100); // sleep 100ms
    }

    if (!data) {
        return res.json({ success: false });
    }

    if (Date.now() > data.expire) {
        delete keys[key];
        saveKeys();
        return res.json({ success: false });
    }

    // 🔒 HWID LOCK
    if (!data.hwid) {
        data.hwid = hwid;
        saveKeys();
    } else if (data.hwid !== hwid) {
        return res.json({ success: false });
    }

    return res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log("Server running");
});
