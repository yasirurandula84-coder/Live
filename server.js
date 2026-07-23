const express = require('express');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const { exec } = require('child_process');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
const { spawn } = require('child_process');


app.post('/start-fb-live', (req, res) => {
    const streamKey = req.body.streamKey;
    if (!streamKey) return res.status(400).send('Stream Key required');

    const mpdUrl = "https://otte.cache.aiv-cdn.net/iad-nitro/live/clients/dash/enc/jpjzsonseg/out/v1/26eeb47cccd24e2d8e1975655a1f04e9/cenc.mpd";
    const keyId = "fe6dc83d53e08c5626b6aec2bb4a3afe";
    const decryptionKey = "da58f6323d6388054bd316890f729f72";
    const fbRtmpUrl = `rtmps://live-api-s.facebook.com:443/rtmp/${streamKey}`;

    // Shaka Packager වෙනම </i> රන් කර, ඊටපස්සේ FFmpeg එකෙන් ස්ට්‍රීම් කිරීම
    const packagerArgs = [
        `input=${mpdUrl},stream=video,output=video.ts`,
        `input=${mpdUrl},stream=audio,output=audio.ts`,
        '--enable_raw_key_decryption',
        `--keys`, `kid=${keyId}:key=${decryptionKey}`
    ];

    console.log("Starting Shaka Packager...");
    const packagerProcess = spawn('packager', packagerArgs);

    packagerProcess.stdout.on('data', (data) => {
        console.log(`Packager stdout: ${data}`);
    });

    packagerProcess.stderr.on('data', (data) => {
        console.error(`Packager Log: ${data}`);
    });

    packagerProcess.on('close', (code) => {
        console.log(`Packager process exited with code ${code}`);
    });

    // තත්පර 5 කින් පසු FFmpeg මඟින් ෆේස්බුක් වෙත ස්ට්‍රීම් කිරීම ආරම්භ කිරීම
    setTimeout(() => {
        const ffmpegArgs = [
            '-i', 'video.ts',
            '-i', 'audio.ts',
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
    }, 5000);

    res.send('Live stream pipeline started successfully!');
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
