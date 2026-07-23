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

// Proxy endpoint
app.get('/proxy', async (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl) {
        return res.status(400).send('Missing url parameter');
    }

    try {
        const response = await fetch(targetUrl, {
            headers: {
                'User-Agent': 'ReactNativeVideo/9.7.0',
                'Referer': 'https://fancode.com/'
            }
        });

        response.headers.forEach((value, name) => {
            res.setHeader(name, value);
        });

        res.status(response.status);
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
