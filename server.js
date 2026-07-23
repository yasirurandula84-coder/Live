const express = require('express');
const path = require('path');
const fetch = require('node-fetch');
const app = express();

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

// Proxy endpoint to handle custom User-Agent and headers for the M3U8 stream
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

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
