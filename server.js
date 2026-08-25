const express = require('express');
const path = require('path');
const fetch = require('node-fetch');
const http = require('http');
const { Server } = require('socket.io');
const ffmpeg = require('fluent-ffmpeg');
const { execSync, spawn } = require('child_process');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// සර්වර් එක ඔන් වෙනකොට yt-dlp නැත්නම් එය ස්වයංක්‍රීයව ඩවුන්ලෝඩ් කරගැනීම
const ytDlpPath = path.join(__dirname, 'yt-dlp');
if (!fs.existsSync(ytDlpPath)) {
    console.log('Downloading yt-dlp binary for the server...');
    try {
        execSync('curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o yt-dlp && chmod a+rx yt-dlp');
        console.log('yt-dlp downloaded successfully!');
    } catch (err) {
        console.error('Failed to download yt-dlp:', err.message);
    }
}

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
                'Referer': 'https://www.fancode.com/'
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

// ෆේස්බුක් ලින්ක් එක දීලා ලයිව් එක පටන් ගන්න රූට් එක
app.post('/start-fb-live', (req, res) => {
    const streamKey = req.body.streamKey;
    const rawUrl = req.body.sourceUrl || "https://www.facebook.com/share/v/19HgW4nBRn/";
    
    if (!streamKey) {
        return res.status(400).send('Stream Key required!');
    }

    if (activeStreamProcess) {
        return res.status(400).send('A stream is already running! Stop it first.');
    }

    // Facebook ලින්ක් එකෙන් Video ID එක වෙන් කරගෙන Embed ලින්ක් එකක් බවට හැරවීම
    let fbVideoUrl = rawUrl;
    const match = rawUrl.match(/\/videos\/(\d+)/) || rawUrl.match(/v=(\d+)/);
    if (match && match[1]) {
        fbVideoUrl = `https://www.facebook.com/plugins/video.php?href=https://www.facebook.com/video.php?v=${match[1]}`;
    }

    res.send('<h2>Connecting to Facebook Live & Starting Restream... 🚀</h2>');

    console.log('Fetching direct stream link using Embed URL:', fbVideoUrl);

    const ytdlpProcess = spawn(ytDlpPath, ['-g', fbVideoUrl]);

    let directStreamUrl = '';

    ytdlpProcess.stdout.on('data', (data) => {
        directStreamUrl += data.toString();
    });

    ytdlpProcess.stderr.on('data', (data) => {
        console.error(`yt-dlp stderr: ${data}`);
    });

    ytdlpProcess.on('close', (code) => {
        if (code !== 0 || !directStreamUrl.trim()) {
            console.error('Failed to extract direct stream URL from Facebook link.');
            return;
        }

        const streamUrlToUse = directStreamUrl.trim().split('\n')[0];
        console.log('Successfully got Direct URL. Starting FFmpeg...');

        const fbRtmpUrl = `rtmps://live-api-s.facebook.com:443/rtmp/${streamKey}`;

        const command = ffmpeg(streamUrlToUse)
            .inputOptions([
                '-reconnect 1',
                '-reconnect_streamed 1',
                '-reconnect_delay_max 5',
                '-fflags +discardcorrupt+genpts',
                '-probesize 50M',
                '-analyzeduration 20M'
            ])
            .outputOptions([
                '-vf', 'scale=1280:720,setpts=0.998*PTS,eq=saturation=1.2:brightness=0.02:contrast=1.3,' +
                       'drawbox=x=1050:y=10:w=200:h=60:color=black@0.85:t=fill,' +
                       'drawbox=x=1050:y=10:w=200:h=60:color=yellow@0.8:t=2,' +
                       'drawtext=text=LIVE:fontcolor=white:fontsize=24:x=1075:y=24,' +
                       'drawtext=text=SL:fontcolor=yellow:fontsize=24:x=1145:y=24,' +
                       'drawtext=text=SHARE_NOW:fontcolor=white@0.75:fontsize=22:x=(w-text_w)/2:y=h-50',
                '-af', 'atempo=1.002,rubberband=pitch=1.09:tempo=1.0',
                '-r', '25',                    
                '-c:v', 'libx264',
                '-preset', 'veryfast',         
                '-tune', 'zerolatency',
                '-b:v', '1000k',               
                '-maxrate', '1500k',
                '-bufsize', '3000k',
                '-pix_fmt', 'yuv420p',
                '-g', '50',                    
                '-c:a', 'aac',
                '-b:a', '128k',
                '-ar', '44100',
                '-max_muxing_queue_size', '9999',
                '-f', 'flv'
            ])
            .output(fbRtmpUrl)
            .on('start', (commandLine) => {
                console.log('Restream FFmpeg spawned:', commandLine);
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
    });
});

// ලයිව් එක නතර කරන්න රූට් එක
app.get('/stop-live', (logReq, res) => {
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
