const express = require("express");
const app = express();

app.use(express.json());

// DATA
let keys = {};
let passedUsers = {};
let requests = {}; // anti spam

// ANTI SLEEP
app.get("/ping", (req, res) => {
    res.send("ok");
});

// HOME
app.get("/", (req, res) => {
    res.send("Key system is running!");
});

// 🔥 RATE LIMIT
function isRateLimited(ip) {
    const now = Date.now();

    if (!requests[ip]) {
        requests[ip] = [];
    }

    requests[ip] = requests[ip].filter(t => now - t < 10000);

    if (requests[ip].length > 10) {
        return true;
    }

    requests[ip].push(now);
    return false;
}

// UI KEY
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

// GET KEY
app.get("/getkey", (req, res) => {
    try {
        const token = req.query.token;

        const ip = (req.headers["x-forwarded-for"] || "").split(",")[0] || req.socket.remoteAddress;

        // 🔥 ANTI BYPASS (CHECK REFERER)
        const referer = req.headers["referer"] || "";
        if (!referer.includes("loot-link.com") && !referer.includes("link-center.net")) {
            return res.send("❌ Access Denied");
        }

        // 🔥 ANTI SPAM
        if (isRateLimited(ip)) {
            return res.send("❌ Too many requests");
        }

        if (!token || token !== "abc123") {
            return res.send("❌ Access Denied");
        }

        for (let k in keys) {
            if (keys[k].ip === ip && Date.now() < keys[k].expire) {
                return sendKeyPage(res, k);
            }
        }

        const key = Math.random().toString(36).substring(2, 10).toUpperCase();

        keys[key] = {
            ip: ip,
            expire: Date.now() + 24 * 60 * 60 * 1000
        };

        return sendKeyPage(res, key);

    } catch (err) {
        console.log(err);
        res.send("❌ Server Error");
    }
});

// VERIFY
app.get("/verify", (req, res) => {
    const { key, hwid } = req.query;

    const ip = (req.headers["x-forwarded-for"] || "").split(",")[0] || req.socket.remoteAddress;

    // ANTI SPAM
    if (isRateLimited(ip)) {
        return res.json({ success: false });
    }

    if (!key || !keys[key]) {
        return res.json({ success: false });
    }

    if (keys[key].ip !== ip) {
        return res.json({ success: false });
    }

    // HWID
    if (!keys[key].hwid) {
        keys[key].hwid = hwid;
    } else if (keys[key].hwid !== hwid) {
        return res.json({ success: false });
    }

    if (Date.now() > keys[key].expire) {
        delete keys[key];
        return res.json({ success: false });
    }

    return res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log("Server running");
});
