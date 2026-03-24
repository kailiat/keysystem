app.get("/getkey", (req, res) => {
    const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;

    // tìm key cũ còn hạn
    for (let k in keys) {
        if (keys[k].ip === ip && Date.now() < keys[k].expire) {
            return sendKeyPage(res, k);
        }
    }

    // tạo key mới
    const key = Math.random().toString(36).substring(2, 10).toUpperCase();

    keys[key] = {
        ip: ip,
        expire: Date.now() + 24 * 60 * 60 * 1000
    };

    return sendKeyPage(res, key);
});

// function UI đẹp
function sendKeyPage(res, key) {
    res.send(`
<!DOCTYPE html>
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
            box-shadow: 0 0 20px rgba(0,0,0,0.5);
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
        button:hover {
            background: #4f46e5;
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
</html>
    `);
}
