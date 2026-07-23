const express = require('express');
const path = require('path');
const fetch = require('node-fetch');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

// Geo-block එක බයිපාස් කිරීමට ප්‍රොක්සි රූට් එක
app.get('/proxy', async (req, res) => {
    let targetUrl = req.query.url;
    if (!targetUrl) {
        return res.status(400).send('Missing url parameter');
    }

    try {
        // ලින්ක් එක සාපේක්ෂව (Relative) ආවොත් ප්‍රධාන ඩොමේන් එක සමඟ සම්බන්ධ කිරීම
        if (!targetUrl.startsWith('http')) {
            targetUrl = 'https://d36r8jifhgsk5j.cloudfront.net/' + targetUrl;
        }

        const response = await fetch(targetUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': 'https://www.fancode.com/',
                'Origin': 'https://www.fancode.com/',
                // US IP එකකින් රෙක්වෙස්ට් එක යන බව පෙන්වීමට ව්‍යාජ IP හැඩයක් ලබා දීම
                'X-Forwarded-For': '198.51.100.15'
            }
        });

        // හෙඩර්ස් ස්වීප් කිරීම
        response.headers.forEach((value, name) => {
            res.setHeader(name, value);
        });

        res.status(response.status);

        // m3u8 ෆයිල් එකක් නම්, ඇතුළේ තියෙන ලින්ක්ස් ප්‍රොක්සි හරහා යන්න මඟපෙන්වීම (Rewrite)
        if (targetUrl.endsWith('.m3u8')) {
            const text = await response.text();
            const rewrittenText = text.split('\n').map(line => {
                line = line.trim();
                if (line && !line.startsWith('#')) {
                    // සෙග්මන්ට් ලින්ක්ස් ප්‍රොක්සි ලින්ක් එකට හරවා යැවීම
                    return `/proxy?url=${encodeURIComponent(line)}`;
                }
                return line;
            }).join('\n');
            return res.send(rewrittenText);
        }

        response.body.pipe(res);
    } catch (err) {
        console.error('Proxy error:', err);
        res.status(500).send('Proxy error: ' + err.message);
    }
});

// සැබෑ ඔන්ලයින් නරඹන්නන් ගණන ට්‍රැක් කිරීම
let activeViewers = 0;

io.on('connection', (socket) => {
    activeViewers++;
    io.emit('updateViewers', activeViewers);

    socket.on('disconnect', () => {
        activeViewers = Math.max(0, activeViewers - 1);
        io.emit('updateViewers', activeViewers);
    });
});

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
