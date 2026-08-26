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

// ෆේස්බුක් එකට සර්වර් එකෙන් ලයිව් එක පටන් ගන්න රූට් එක
app.post('/start-fb-live', (req, res) => {
    const streamKey = req.body.streamKey;
    
    const streamUrl = "https://stream.ottplus.live/live/ten_1_hd_abr/live/ten_1_hd_720/chunks.m3u8";
    if (!streamKey) {
        return res.status(400).send('Stream Key required!');
    }

    if (activeStreamProcess) {
        return res.status(400).send('A stream is already running! Stop it first.');
    }

    const fbRtmpUrl = `rtmps://live-api-s.facebook.com:443/rtmp/${streamKey}`;

    console.log('Starting Optimized Anti-Copyright streaming to Facebook:', streamUrl);

    const command = ffmpeg(streamUrl)
        .inputOptions([
            '-re',                      // සෝස් එක රියල්-ටයිම් ස්ට්‍රීම් එකක් ලෙස ස්ථාවරව ලබා ගැනීමට
            '-reconnect 1',
            '-reconnect_streamed 1',
            '-reconnect_delay_max 5',
            '-fflags +discardcorrupt+genpts+nobuffer',
            '-flags low_delay',
            '-probesize 32M',
            '-analyzeduration 10M'
        ])
        .outputOptions([
            // 1. VIDEO TRANSFORMATIONS & WATERMARK BOX
            '-vf', 'setpts=0.998*PTS,crop=in_w-40:in_h-40:20:20,scale=1280:720,eq=saturation=1.12:brightness=0.01:contrast=1.25,noise=alls=3:allf=t,' +
                   'drawbox=x=1140:y=25:w=100:h=65:color=black@0.85:t=fill,' +
                   'drawbox=x=1140:y=25:w=100:h=65:color=yellow@0.9:t=2,' +
                   'drawtext=text=LANKA:fontcolor=white:fontsize=18:x=1165:y=32,' +
                   'drawtext=text=LIVE:fontcolor=yellow:fontsize=20:x=1158:y=55,' +
                   'drawtext=text=SHARE_NOW:fontcolor=white@0.75:fontsize=22:x=(w-text_w)/2:y=h-50',
            
            // 2. AUDIO TRANSFORMATIONS
            '-af', 'atempo=1.002,rubberband=pitch=1.09:tempo=1.0',

            // 3. STABLE STREAM & ENCODING SETTINGS (බිට්රේට් එක ප්‍රශස්ත කර ලැග් වීම වළක්වන ලදී)
            '-r', '25',                    
            '-c:v', 'libx264',
            '-preset', 'veryfast',         // ultrafast වෙනුවට veryfast දීමෙන් ස්ට්‍රීම් එකේ ස්ථාවරත්වය වැඩි වේ
            '-tune', 'zerolatency',
            '-b:v', '900k',                // බිට්රේට් එක 900k දක්වා අඩු කර සර්වර් බර සැහැල්ලු කරන ලදී
            '-maxrate', '1200k',
            '-bufsize', '2500k',
            '-pix_fmt', 'yuv420p',
            '-g', '50',                    // Keyframe interval (2 seconds for 25fps)
            '-c:a', 'aac',
            '-b:a', '96k',
            '-ar', '44100',
            '-max_muxing_queue_size', '9999',
            '-f', 'flv'
        ])
        .output(fbRtmpUrl)
        .on('start', (commandLine) => {
            console.log('Optimized FFmpeg spawned:', commandLine);
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

    res.send('<h2>Optimized Facebook Live started successfully! 🚀🔥</h2>');
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
