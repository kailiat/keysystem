const express = require("express");
const app = express();

app.use(express.json());

// lưu key (tạm thời)
let keys = {};

// trang chính
app.get("/", (req, res) => {
    res.send("Key system is running!");
});

// tạo key
app.get("/getkey", (req, res) => {
    const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;

    const key = Math.random().toString(36).substring(2, 10).toUpperCase();

    keys[key] = {
        ip: ip,
        expire: Date.now() + 24 * 60 * 60 * 1000 // 24h
    };

    res.send(`YOUR KEY: ${key}`);
});

// verify key
app.get("/verify", (req, res) => {
    const { key } = req.query;
    const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;

    if (!key || !keys[key]) {
        return res.json({ success: false, message: "Key không tồn tại" });
    }

    if (keys[key].ip !== ip) {
        return res.json({ success: false, message: "Sai IP" });
    }

    if (Date.now() > keys[key].expire) {
        delete keys[key];
        return res.json({ success: false, message: "Key hết hạn" });
    }

    return res.json({ success: true });
});

// chạy server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log("Server đang chạy tại cổng " + PORT);
});
