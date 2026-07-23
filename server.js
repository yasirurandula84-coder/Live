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

    const mpdUrl = "https://otte.cache.aiv-cdn.net/iad-nitro/live/clients/dash/enc/jpjzsonseg/out/v1/26eeb47cccd24e2d8e1975655a1f04e9/cenc.mpd";
    const keyId = "fe6dc83d53e08c5626b6aec2bb4a3afe";
    const decryptionKey = "da58f6323d6388054bd316890f729f72";
    const fbRtmpUrl = `rtmps://live-api-s.facebook.com:443/rtmp/${streamKey}`;

    // Shaka Packager එකෙන් ලයිව් HLS (m3u8) අවුට්පුට් එකක් හැදීම
        const packagerArgs = [
        `input=${mpdUrl},stream=video,segment_template=video_$Number$.ts,playlist_name=video.m3u8`,
        `input=${mpdUrl},stream=audio,segment_template=audio_$Number$.ts,playlist_name=audio.m3u8`,
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
