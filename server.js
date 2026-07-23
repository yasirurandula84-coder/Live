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
    const decryptionKey = "da58f6323d6388054bd316890f729f72";
    const fbRtmpUrl = `rtmps://live-api-s.facebook.com:443/rtmp/${streamKey}`;

    // mp4decrypt සහ ffmpeg එකතු කර ස්ට්‍රීම් කිරීම
    const command = `ffmpeg -headers "User-Agent: Mozilla/5.0" -i ${mpdUrl} -c copy -f mp4 pipe:1 | mp4decrypt --key ${decryptionKey} - - | ffmpeg -i pipe:0 -c:v libx264 -c:a aac -f flv -preset ultrafast -tune zerolatency -b:v 1500k -maxrate 1500k -bufsize 3000k -pix_fmt yuv420p -g 60 ${fbRtmpUrl}`;

    const ffmpegProcess = spawn(command, { shell: true });

    ffmpegProcess.stderr.on('data', (data) => {
        console.error(`Log: ${data}`);
    });

    res.send('Live stream started with mp4decrypt!');
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
