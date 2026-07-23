const express = require('express');
const path = require('path');
const fetch = require('node-fetch');
const http = require('http');
const { Server } = require('socket.io');
const ffmpeg = require('fluent-ffmpeg');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));

// ප්‍රොක්සි රූට් එක (වෙබ් සයිට් එකේ මැච් එක බලන්න)
app.get('/proxy', async (req, res) => {
    let targetUrl = req.query.url;
    if (!targetUrl) return res.status(400).send('Missing url');

    try {
        if (!targetUrl.startsWith('http')) {
            targetUrl = 'https://d36r8jifhgsk5j.cloudfront.net/' + targetUrl;
        }
        const response = await fetch(targetUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36',
                'Referer': 'https://www.fancode.com/',
                'X-Forwarded-For': '198.51.100.15'
            }
        });
        response.headers.forEach((v, n) => res.setHeader(n, v));
        res.status(response.status);

        if (targetUrl.endsWith('.m3u8')) {
            const text = await response.text();
            const rewritten = text.split('\n').map(line => {
                line = line.trim();
                if (line && !line.startsWith('#')) {
                    return `/proxy?url=${encodeURIComponent(line)}`;
                }
                return line;
            }).join('\n');
            return res.send(rewritten);
        }
        response.body.pipe(res);
    } catch (err) {
        res.status(500).send('Proxy error');
    }
});

// ෆේස්බුක් එකට සර්වර් එකෙන් ලයිව් එක පටන් ගන්න රූට් එක
app.post('/start-fb-live', (req, res) => {
    const streamKey = req.body.streamKey;
    if (!streamKey) return res.status(400).send('Stream Key required');

    if (currentStream) {
        try { currentStream.kill('SIGKILL'); } catch (e) {}
    }

    // අලුත් DASH ලින්ක් එක
    const inputUrl = 'https://otte.cache.aiv-cdn.net/iad-nitro/live/clients/dash/enc/jpjzsonseg/out/v1/26eeb47cccd24e2d8e1975655a1f04e9/cenc.mpd';
    const fbRtmpUrl = `rtmps://live-api-s.facebook.com:443/rtmp/${streamKey}`;

    // ClearKey (Kid සහ Key) හරහා ඩික්‍රිප්ට් කරමින් FFmpeg එක මඟින් ෆේස්බුක් වෙත ස්ට්‍රීම් කිරීම
    currentStream = ffmpeg(inputUrl)
        .inputOptions([
            '-headers', 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36\r\n',
            '-decryption_key', 'da58f6323d6388054bd316890f729f72', // මෙතැනට ඔයාගේ Key එක දී ඇත
            '-re',
            '-fflags +genpts'
        ])
        .outputOptions([
            '-c:v copy',
            '-c:a aac',
            '-f flv',
            '-reconnect 1',
            '-reconnect_streamed 1',
            '-reconnect_delay_max 5'
        ])
        .output(fbRtmpUrl)
        .on('start', () => {
            console.log('DRM Stream started to Facebook successfully!');
        })
        .on('error', (err) => {
            console.error('Streaming error:', err.message);
        })
        .on('end', () => {
            console.log('Streaming finished.');
        });

    currentStream.run();

    res.send('Live stream started successfully from DRM source!');
});


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
