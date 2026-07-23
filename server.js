const express = require('express');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const { spawn } = require('child_process');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));

app.post('/start-fb-live', (req, res) => {
    const streamKey = req.body.streamKey;
    if (!streamKey) return res.status(400).send('Stream Key required');

    const mpdUrl = "https://otte.cache.aiv-cdn.net/iad-nitro/live/clients/dash/enc/r9ipx2gmey/out/v1/72197084a22d4b8888925caa8b2a5129/cenc.mpd";
    const keyId = "53be1157d919b0313e270d1ed4186d87";
    const decryptionKey = "44f686ac116d42983895204b978fefab";
    const fbRtmpUrl = `rtmps://live-api-s.facebook.com:443/rtmp/${streamKey}`;

    // Shaka Packager එකෙන් ලයිව් HLS (m3u8) අවුට්පුට් එකක් හැදීම
    const packagerArgs = [
        `input=${mpdUrl},stream=video,output=video_%d.ts`,
        `input=${mpdUrl},stream=audio,output=audio_%d.ts`,
        '--enable_raw_key_decryption',
        '--keys', `key_id=${keyId}:key=${decryptionKey}`,
        '--hls_master_playlist_output', 'master.m3u8'
    ];

    console.log("Starting Shaka Packager...");
    const packagerProcess = spawn('packager', packagerArgs);

    packagerProcess.stdout.on('data', (data) => {
        console.log(`Packager stdout: ${data}`);
    });

    packagerProcess.stderr.on('data', (data) => {
        console.error(`Packager Log: ${data}`);
    });

    // තත්පර 8 කින් පසු FFmpeg මඟින් m3u8 ප්ලේලිස්ට් එක ෆේස්බුක් වෙත ස්ට්‍රීම් කිරීම
        // තත්පර 15 කින් පසු FFmpeg මඟින් m3u8 ප්ලේලිස්ට් එක ෆේස්බුක් වෙත ස්ට්‍රීම් කිරීම
    setTimeout(() => {
        const ffmpegArgs = [
            '-i', 'master.m3u8',
            '-c:v', 'libx264',
            '-c:a', 'aac',
            '-f', 'flv',
            '-preset', 'ultrafast',
            '-tune', 'zerolatency',
            '-b:v', '1500k',
            '-maxrate', '1500k',
            '-bufsize', '3000k',
            '-pix_fmt', 'yuv420p',
            '-g', '60',
            fbRtmpUrl
        ];

        console.log("Starting FFmpeg Stream to Facebook...");
        const ffmpegProcess = spawn('ffmpeg', ffmpegArgs);

        ffmpegProcess.stderr.on('data', (data) => {
            console.error(`FFmpeg Log: ${data}`);
        });

        ffmpegProcess.on('close', (code) => {
            console.log(`FFmpeg process exited with code ${code}`);
        });
    }, 15000); // තත්පර 15 ක් දක්වා කාලය වැඩි කර ඇත

    res.send('Live stream HLS pipeline started successfully!');
}); // මෙන්න මේ බ්‍රේස් එකෙන් රවුට් එක නිවැරදිව අවසාන කර ඇත

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
