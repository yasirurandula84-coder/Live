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
app.use(express.json());

let activeStreamProcess = null;

// ප්‍රොක්සි රූට් එක
app.get('/proxy', async (req, res) => {
    let targetUrl = req.query.url;
    if (!targetUrl) return res.status(400).send('Missing url');

    try {
        const response = await fetch(targetUrl, {
            headers: {
                'User-Agent': 'VLC/3.0.20 LibVLC/3.0.20',
                'Icy-MetaData': '1',
                'Accept-Encoding': 'identity',
                'Referer': 'https://www.sonyliv.com/'
            }
        });
        response.headers.forEach((v, n) => res.setHeader(n, v));
        res.status(response.status);

        if (targetUrl.endsWith('.m3u8')) {
            const text = await response.text();
            const rewritten = text.split('\n').map(line => {
                line = line.trim();
                if (line && !line.startsWith('#')) {
                    let absoluteUrl = line;
                    if (!line.startsWith('http')) {
                        const urlObj = new URL(targetUrl);
                        absoluteUrl = `${urlObj.origin}${line.startsWith('/') ? '' : '/'}${line}`;
                    }
                    return `/proxy?url=${encodeURIComponent(absoluteUrl)}`;
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

// YouTube එකට සර්වර් එකෙන් ලයිව් එක පටන් ගන්න රූට් එක
app.post('/start-yt-live', (req, res) => {
    const streamKey = req.body.streamKey;
    
    // ඔයා දුන් අලුත්ම .m3u8 ලින්ක් එක
    const streamUrl = "https://dai.google.com/ssai/event/DgeLzKxsSMuwfRa8znq4RQ/master.m3u8";

    if (!streamKey) {
        return res.status(400).send('Stream Key required!');
    }

    if (activeStreamProcess) {
        return res.status(400).send('A stream is already running! Stop it first.');
    }

    const ytRtmpUrl = `rtmp://a.rtmp.youtube.com/live2/${streamKey}`;

    console.log('Starting Anti-Copyright Stream to YouTube with new Link:', streamUrl);
    console.log('Target RTMP URL:', ytRtmpUrl);

    const command = ffmpeg(streamUrl)
        .inputOptions([
            '-reconnect 1',
            '-reconnect_streamed 1',
            '-reconnect_delay_max 5',
            '-fflags +discardcorrupt+genpts',
            '-probesize 15M',
            '-analyzeduration 5M'
        ])
        .outputOptions([
            // 1. වීඩියෝ ෆිල්ටර්: FPS, Scale, Crop, වර්ණ වෙනස් කිරීම සහ කොපිරයිට් බොට් මඟහරින කළු බොක්ස් එක
            '-vf', 'fps=25,scale=1280:720,crop=in_w-20:in_h-20:10:10,eq=saturation=1.2:brightness=0.03:contrast=1.05,noise=alls=10:allf=t+u,drawbox=x=iw-w-20:y=20:w=350:h=150:color=black@0.9:t=fill',
            
            // 2. ශබ්ද ෆිල්ටර්: Pitch සහ Tempo වෙනස් කිරීම (Audio Fingerprint වෙනස් කිරීමට)
            '-af', 'asetrate=44100*1.02,aresample=44100,atempo=0.98,treble=g=5,bass=g=-3',

            // 3. YouTube සඳහා අවශ්‍ය ස්ථාවර කෝඩින්ග් සැකසුම්
            '-c:v', 'libx264',
            '-preset', 'veryfast',
            '-tune', 'zerolatency',
            '-g', '50',
            '-b:v', '2500k',
            '-maxrate', '3000k',
            '-bufsize', '5000k',
            '-pix_fmt', 'yuv420p',
            '-c:a', 'aac',
            '-b:a', '128k',
            '-ar', '44100',
            '-ac', '2',
            '-f', 'flv'
        ])
        .output(ytRtmpUrl)
        .on('start', (commandLine) => {
            console.log('FFmpeg spawned:', commandLine);
        })
        .on('error', (err) => {
            console.error('Streaming error:', err.message);
            activeStreamProcess = null;
        })
        .on('end', () => {
            console.log('Streaming finished.');
            activeStreamProcess = null;
        });

    command.run();
    activeStreamProcess = command;

    res.send('<h2>YouTube Live started successfully with new Link! 🚀</h2>');
});

// ලයිව් එක නතර කරන්න රූට් එක
app.get('/stop-live', (req, res) => {
    if (activeStreamProcess) {
        activeStreamProcess.kill('SIGKILL');
        activeStreamProcess = null;
        res.send('<h2>Live stream stopped successfully.</h2>');
    } else {
        res.status(400).send('No active stream running.');
    }
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
