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
    const decryptionKey = "da58f6323d6388054bd316890f729f72";
    const fbRtmpUrl = `rtmps://live-api-s.facebook.com:443/rtmp/${streamKey}`;

    // FFmpeg එකෙන්ම ඩිරෙක්ට් ලින්ක් එක අරන් ස්ට්‍රීම් කිරීම
    const directCommand = `ffmpeg -headers "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64)" -i "${mpdUrl}" -decryption_key ${decryptionKey} -c:v libx264 -c:a aac -f flv -preset ultrafast -tune zerolatency -b:v 1500k -maxrate 1500k -bufsize 3000k -pix_fmt yuv420p -g 60 "${fbRtmpUrl}"`;

    console.log("Starting Direct FFmpeg Stream...");
    const liveProcess = spawn(directCommand, { shell: true });

    liveProcess.stdout.on('data', (data) => {
        console.log(`stdout: ${data}`);
    });

    liveProcess.stderr.on('data', (data) => {
        console.error(`FFmpeg Log: ${data}`);
    });

    liveProcess.on('close', (code) => {
        console.log(`Process exited with code ${code}`);
    });

    res.send('Direct live stream pipeline started!');
});

එකෙන් රවුට් එක නිවැරදිව අවසාන කර ඇත

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
