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

// SAVE FUNCTION
function saveKeys() {
    fs.writeFileSync("keys.json", JSON.stringify(keys, null, 2));
}

// DATA
let requests = {};

// RATE LIMIT
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

// UI
function sendKeyPage(res, key) {
    res.send(`<html><body style="background:#0f172a;color:white;display:flex;justify-content:center;align-items:center;height:100vh;font-family:Arial;">
    <div style="background:#1e293b;padding:30px;border-radius:15px;text-align:center;">
    <h2>Your Key</h2>
    <div style="background:#0f172a;padding:15px;border-radius:10px;font-size:20px;margin-bottom:15px;">${key}</div>
    </div></body></html>`);
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
    const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;

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

    const key = Math.random().toString(36).substring(2, 10).toUpperCase();

    keys[key] = {
        ip: ip,
        expire: Date.now() + 24 * 60 * 60 * 1000
    };

    delete keys[session];
    saveKeys();

    return sendKeyPage(res, key);
});

// VERIFY
app.get("/verify", (req, res) => {
    const { key, hwid } = req.query;

    const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;

    if (isRateLimited(ip)) {
        return res.json({ success: false });
    }

    if (!key || !keys[key]) {
        return res.json({ success: false });
    }

    if (Date.now() > keys[key].expire) {
        delete keys[key];
        saveKeys();
        return res.json({ success: false });
    }

    if (!keys[key].hwid) {
        keys[key].hwid = hwid;
        saveKeys();
    } else if (keys[key].hwid !== hwid) {
        return res.json({ success: false });
    }

    return res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log("Server running");
});
