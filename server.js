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

let currentStream = null;

// ෆේස්බුක් එකට සර්වර් එකෙන් ලයිව් එක පටන් ගන්න රූට් එක
app.post('/start-fb-live', (req, res) => {
    const streamKey = req.body.streamKey;
    if (!streamKey) return res.status(400).send('Stream Key required');

    // දැනටමත් ස්ට්‍රීම් එකක් දුවනවා නම් එය නවතා අලුතින් පටන් ගනී
    if (currentStream) {
        try { currentStream.kill('SIGKILL'); } catch (e) {}
    }

    const inputUrl = "https://d36r8jifhgsk5j.cloudfront.net/Willow_TV1080p.m3u8";
    const fbRtmpUrl = `rtmps://live-api-s.facebook.com:443/rtmp/${streamKey}`;

    // Zero-CPU Load සහ Auto-reconnect පහසුකම් සහිත FFmpeg සෙටප් එක
    currentStream = ffmpeg(inputUrl)
        .inputOptions([
            '-re',                    // රියල්-ටයිම් ස්පීඩ් එකට රීඩ් කිරීම
            '-fflags +genpts'         // පීටීඑස් (PTS) එරර් මඟහරවා ගැනීමට
        ])
        .outputOptions([
            '-c:v copy',              // වීඩියෝ එක කන්වර්ට් නොකර ඩිරෙක්ට් කොපි කරයි (සර්වර් එකට බරක් නැත)
            '-c:a aac',               // ඕඩියෝ එක AAC ෆෝමැට් එකට තබා ගනී
            '-f flv',
            '-reconnect 1',           // ලින්ක් එකේ සිග්නල් අවුලක් ගියොත් ඔටෝ කනෙක්ෂන් ලබා දෙයි
            '-reconnect_streamed 1',
            '-reconnect_delay_max 5',
            '-timeout 10000000'
        ])
        .output(fbRtmpUrl)
        .on('start', (commandLine) => {
            console.log('Server started streaming to Facebook successfully!');
        })
        .on('error', (err) => {
            console.error('Streaming error / Reconnecting:', err.message);
        })
        .on('end', () => {
            console.log('Streaming finished.');
        });

    currentStream.run();

    res.send('Live stream started successfully with high stability! You can close this page.');
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
