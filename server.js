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
                'Referer': 'https://www.itcnbd.live/'
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

// YouTube Live එක Copyright වලින් ආරක්ෂා කරමින් පටන් ගන්න රූට් එක
app.post('/start-live', (req, res) => {
    if (activeStreamProcess) {
        return res.status(400).send('A stream is already running! Stop it first.');
    }

    const streamUrl = "https://tvsen6.aynaott.com/zv68oqPDu7MZZwmHhRxt/tracks-v1a1/mono.ts.m3u8";
    
    // **මෙතැනට ඔයාගේ YouTube Stream Key එක දාන්න**
    const youtubeStreamKey = "YOUR_YOUTUBE_STREAM_KEY_HERE"; 
    const youtubeRtmpUrl = `rtmp://a.rtmp.youtube.com/live2/${youtubeStreamKey}`;

    console.log('Starting Anti-Copyright YouTube Live streaming from:', streamUrl);

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
                
                // **Anti-Copyright Video Filters:**
                // 1. setpts: වීඩියෝ වේගය සුළු වශයෙන් වෙනස් කරයි (PTS වෙනස් කිරීමෙන් AI අල්ලාගැනීම අපහසු වේ)
                // 2. crop: දාරවලින් ටිකක් කපා දමයි (Original Frame එක වෙනස් කරයි)
                // 3. scale: 1280x720 ට සකස් කරයි
                // 4. eq: වර්ණ සහ සැචුරේෂන් (Saturation & Contrast) මඳක් වෙනස් කරයි
                // 5. drawbox / drawtext: උඩින් අමතර box සහ watermarks එක් කරයි
                '-vf', 'setpts=0.998*PTS,crop=in_w-60:in_h-60:30:30,scale=1280:720,eq=saturation=1.12:contrast=1.18,' +
                       'drawbox=x=20:y=20:w=150:h=45:color=black@0.8:t=fill,' +
                       'drawtext=text=LIVE_STREAM:fontcolor=white:fontsize=18:x=35:y=32,' +
                       'drawtext=text=SUPPORT:fontcolor=yellow:fontsize=20:x=(w-text_w)/2:y=h-40',
            
                // **Anti-Copyright Audio Filters:**
                // ශබ්දයේ පිට් (Pitch) සහ ටෙම්පෝ (Tempo) වෙනස් කිරීම මඟින් Audio Content ID මඟහරවා ගත හැක.
                '-af', 'atempo=1.01,rubberband=pitch=1.05:tempo=1.0',

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
            .output(youtubeRtmpUrl)
            .on('start', (commandLine) => {
                console.log('Protected FFmpeg Stream spawned to YouTube:', commandLine);
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

    res.send('<h2>Protected YouTube Live stream started successfully! 🚀🔥</h2>');
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
