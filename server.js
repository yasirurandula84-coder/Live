const express = require('express');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const ffmpeg = require('fluent-ffmpeg');

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

    // Shaka Packager සහ FFmpeg එකතු කර ඩික්‍රිප්ට් කර ස්ට්‍රීම් කිරීම
    const command = `packager input=${mpdUrl},stream=video,output=pipe:1 keys:kid=${keyId}:key=${decryptionKey} | ffmpeg -i pipe:0 -i ${mpdUrl} -c:v libx264 -c:a aac -f flv -preset ultrafast -tune zerolatency -b:v 1500k -maxrate 1500k -bufsize 3000k -pix_fmt yuv420p -g 60 ${fbRtmpUrl}`;

    const { exec } = require('child_process');
    const child = exec(command, (error, stdout, stderr) => {
        if (error) {
            console.error(`exec error: ${error}`);
            return;
        }
        console.log(`stdout: ${stdout}`);
        console.error(`stderr: ${stderr}`);
    });

    console.log('Started Shaka Packager & FFmpeg stream to Facebook');
    res.send('Live stream started via Shaka Packager successfully!');
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
