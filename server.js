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

// යූටියුබ් එකට සර්වර් එකෙන් ලයිව් එක පටන් ගන්න රූට් එක
app.post('/start-yt-live', (req, res) => {
    const streamKey = req.body.streamKey;
    if (!streamKey) {
        return res.status(400).send('YouTube Stream Key required!');
    }

    if (activeStreamProcess) {
        return res.status(400).send('A stream is already running! Stop it first.');
    }

    const rawStreamUrl = "https://playztv-apps.pages.dev/willow/index.m3u8";
    
    const PORT_NUM = process.env.PORT || 3000;
    const streamUrl = `http://127.0.0.1:${PORT_NUM}/proxy?url=` + encodeURIComponent(rawStreamUrl);
    
    // යූටියුබ් හි නිල RTMP URL එක සහ Stream Key එක එකතු කිරීම
    const ytRtmpUrl = `rtmp://a.rtmp.youtube.com/live2/${streamKey}`;

    console.log('Starting Auto-Recovery YouTube Live streaming via Proxy:', streamUrl);

    function startStream() {
        if (activeStreamProcess) {
            try { activeStreamProcess.kill('SIGKILL'); } catch(e) {}
            activeStreamProcess = null;
        }

        const command = ffmpeg(streamUrl)
            .inputOptions([
                '-re',
                '-reconnect 1',
                '-reconnect_streamed 1',
                '-reconnect_delay_max 5',
                '-fflags +discardcorrupt+genpts+nobuffer',
                '-probesize 50M',
                '-analyzeduration 20M'
            ])
            .outputOptions([
                '-sws_flags', 'fast_bilinear',
                '-vf', 'crop=in_w-40:in_h-40:20:20,scale=1280:720,eq=saturation=1.12:brightness=0.01:contrast=1.25,' +
                   // 1. උඩ දකුණු කෙළවරේ 'LIVE SL' ලෝගෝ කොටුව
                   'drawbox=x=1050:y=10:w=200:h=60:color=black@0.85:t=fill,' +
                   'drawbox=x=1050:y=10:w=200:h=60:color=red@0.8:t=2,' +
                   'drawtext=text=LIVE:fontcolor=white:fontsize=24:x=1075:y=24,' +
                   'drawtext=text=SL:fontcolor=red:fontsize=24:x=1145:y=24,' +
                   'drawbox=x=1190:y=34:w=12:h=12:color=red@0.9:t=fill,' +
                   
                   // 2. යටින් පෙන්වන 'SHARE_NOW' Watermark එක
                   'drawtext=text=SHARE_NOW:fontcolor=white@0.35:fontsize=22:x=(w-text_w)/2:y=h-50',
                
                '-af', 'atempo=1.002,rubberband=pitch=1.08:tempo=1.0',

                '-threads', '4',               
                '-r', '25',                    
                '-c:v', 'libx264',
                '-preset', 'ultrafast',        
                '-tune', 'zerolatency',
                '-b:v', '1000k',               
                '-maxrate', '1400k',
                '-bufsize', '2800k',
                '-pix_fmt', 'yuv420p',
                '-g', '50',                    
                '-c:a', 'aac',
                '-b:a', '128k',
                '-ar', '44100',
                '-max_muxing_queue_size', '9999',
                '-f', 'flv'
            ])
            .output(ytRtmpUrl)
            .on('start', (commandLine) => {
                console.log('FFmpeg Auto-Recovery YouTube Stream spawned:', commandLine);
            })
            .on('error', (err) => {
                console.error('Streaming error encountered:', err.message);
                if (activeStreamProcess) {
                    setTimeout(() => {
                        console.log('Attempting to restart stream after error...');
                        startStream();
                    }, 3000);
                }
            })
            .on('end', () => {
                console.log('Streaming finished. Restarting automatically...');
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

    res.send('<h2>Auto-Recovery YouTube Live started successfully! 🚀🔥</h2>');
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
                
