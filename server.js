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

    // මෙතැනදී අපි ප්‍රොක්සි ලින්ක් එක හෝ ඩික්‍රිප්ට් කරන ක්‍රමය පාවිච්චි කරමු
    // හැබැයි පුළුවන් නම් මේ DASH මැච් එක වෙනුවට සාමාන්‍ය .m3u8 (HLS) ලින්ක් එකක් පාවිච්චි කිරීම වැඩේ ගොඩක් ලේසි කරයි.
    
    // උදාහරණයක් ලෙස කලින් පාවිච්චි කළ HLS ලින්ක් එක මෙතැනට දෙමු:
    const normalStreamUrl = "https://d36r8jifhgsk5j.cloudfront.net/Willow_TV1080p.m3u8";
    
    const fbRtmpUrl = `rtmps://live-api-s.facebook.com:443/rtmp/${streamKey}`;

    ffmpeg(normalStreamUrl)
        .inputOptions([
            '-headers', 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36\r\n'
        ])
        .videoCodec('libx264')
        .audioCodec('aac')
        .format('flv')
        .outputOptions([
            '-preset ultrafast',
            '-tune zerolatency',
            '-b:v 1500k',
            '-maxrate 1500k',
            '-bufsize 3000k',
            '-pix_fmt yuv420p',
            '-g 60'
        ])
        .output(fbRtmpUrl)
        .on('start', (commandLine) => {
            console.log('Started streaming to Facebook:', commandLine);
        })
        .on('error', (err) => {
            console.error('Streaming error:', err.message);
        })
        .on('end', () => {
            console.log('Streaming finished.');
        })
        .run();

    res.send('Live stream started from server successfully! You can close this page now.');
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
