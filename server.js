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
    if (!streamKey) {
        return res.status(400).send('Stream Key required!');
    }

    if (activeStreamProcess) {
        return res.status(400).send('A stream is already running! Stop it first.');
    }

    const streamUrl = "https://stream.ottplus.live/live/ten_1_hd_abr/live/ten_1_hd_720/chunks.m3u8";
    const fbRtmpUrl = `rtmps://live-api-s.facebook.com:443/rtmp/${streamKey}`;

    console.log('Starting Auto-Recovery Live streaming to Facebook:', streamUrl);

    function startStream() {
        // Stop any orphan process if exists
        if (activeStreamProcess) {
            try { activeStreamProcess.kill('SIGKILL'); } catch(e) {}
            activeStreamProcess = null;
        }

        const command = ffmpeg(streamUrl)
            .inputOptions([
                '-re',                      // සජීවී වේගයට (Real-time) ඩේටා ලබා ගැනීම
                '-reconnect 1',
                '-reconnect_streamed 1',
                '-reconnect_delay_max 5',
                '-fflags +discardcorrupt+genpts+nobuffer',
                '-probesize 50M',
                '-analyzeduration 20M'
            ])
                          .outputOptions([
            // 1. අත්‍යවශ්‍ය කොපිප්‍රොටෙක්ට් ෆිල්ටර්ස් පමණක් (Noise වැනි බර වැඩි දේ ඉවත් කරන ලදී)
            '-sws_flags', 'fast_bilinear',
            '-vf', 'crop=in_w-20:in_h-20:10:10,scale=1280:720,eq=saturation=1.1:contrast=1.12,' +
                   'drawbox=x=1140:y=25:w=100:h=65:color=black@0.85:t=fill,' +
                   'drawbox=x=1140:y=25:w=100:h=65:color=yellow@0.9:t=2,' +
                   'drawtext=text=LANKA:fontcolor=white:fontsize=18:x=1165:y=32,' +
                   'drawtext=text=LIVE:fontcolor=yellow:fontsize=20:x=1158:y=55',
            
            // 2. ශ්‍රව්‍ය වෙනස්කම් (අත්‍යවශ්‍ය පිච් වෙනස පමණක්)
            '-af', 'rubberband=pitch=1.08',

            // 3. සර්වර් ලෝඩ් එක අවම කරන ultra-fast සෙටිංස්
            '-threads', '0',               // සියලුම CPU cores ස්වයංක්‍රීයව භාවිත කිරීම
            '-r', '25',                    
            '-c:v', 'libx264',
            '-preset', 'ultrafast',        
            '-tune', 'zerolatency',
            '-b:v', '900k',                // සර්වර් බර අඩු කිරීමට බිට්රේට් එක 900k ලෙස තබා ගැනීම
            '-maxrate', '1200k',
            '-bufsize', '2400k',
            '-pix_fmt', 'yuv420p',
            '-g', '50',                    
            '-c:a', 'aac',
            '-b:a', '96k',
            '-ar', '44100',
            '-max_muxing_queue_size', '9999',
            '-f', 'flv'
        ])


            .output(fbRtmpUrl)
            .on('start', (commandLine) => {
                console.log('FFmpeg Auto-Recovery Stream spawned:', commandLine);
            })
            .on('error', (err) => {
                console.error('Streaming error encountered:', err.message);
                // එරෝ එකක් ආවොත් තත්පර 3කින් ස්ට්‍රීම් එක නැවත ආරම්භ කිරීමට උත්සාහ කිරීම
                if (activeStreamProcess) {
                    setTimeout(() => {
                        console.log('Attempting to restart stream after error...');
                        startStream();
                    }, 3000);
                }
            })
            .on('end', () => {
                console.log('Streaming finished. Restarting automatically...');
                // ස්ට්‍රීම් එක අවසන් වුණොත් ස්වයංක්‍රීයව නැවත පටන් ගැනීම
                if (activeStreamProcess) {
                    setTimeout(() => {
                        startStream();
                    }, 2000);
                }
            });

        command.run();
        activeStreamProcess = command;
    }

    startStream();

    res.send('<h2>Auto-Recovery Facebook Live started successfully! 🚀🔥 (Stream will auto-reconnect if dropped)</h2>');
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
