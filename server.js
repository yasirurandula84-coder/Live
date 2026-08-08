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

// YouTube එකට සර්වර් එකෙන් ලයිව් එක පටන් ගන්න රූට් එක
app.post('/start-yt-live', (req, res) => {
    const streamKey = req.body.streamKey;
    const streamUrl = "https://tvsen6.aynaott.com/zv68oqPDu7MZZwmHhRxt/tracks-v1a1/mono.ts.m3u8?e=1784102512&token=968935df4fd0678de5d7fe392c0610d9&u=ee5437a7-c16b-4700-";

    if (!streamKey) {
        return res.status(400).send('Stream Key required!');
    }

    if (activeStreamProcess) {
        return res.status(400).send('A stream is already running! Stop it first.');
    }

    const ytRtmpUrl = `rtmp://a.rtmp.youtube.com/live2/${streamKey}`;

    console.log('Starting YouTube Anti-Copyright Stream:', streamUrl);

    const command = ffmpeg(streamUrl)
        .inputOptions([
            '-reconnect 1',
            '-reconnect_streamed 1',
            '-reconnect_delay_max 5',
            '-fflags +discardcorrupt+genpts',
            '-probesize 15M',
            '-analyzeduration 5M'
        ])
        .outputOptions([
            // වීඩියෝ ෆිල්ටර්: FPS, Scale, Crop, වර්ණ සහ ගැමා වෙනස් කිරීම, නොයිස් එකතු කිරීම සහ කළු බොක්ස් එක
            '-vf', 'fps=25,scale=1280:720,crop=in_w-20:in_h-20:10:10,eq=saturation=1.2:brightness=0.03:contrast=1.05,noise=alls=10:allf=t+u,drawbox=x=iw-w-20:y=20:w=350:h=150:color=black@0.9:t=fill',
            
            // ශබ්ද ෆිල්ටර්: Pitch සහ Tempo වෙනස් කිරීම (කොපිරයිට් බොට්ස්ලාට අල්ලා ගැනීමට අපහසු වන පරිදි)
            '-af', 'asetrate=44100*1.02,aresample=44100,atempo=0.98,treble=g=5,bass=g=-3',

            // YouTube සඳහා ස්ථාවර සැකසුම්
            '-c:v', 'libx264',
            '-preset', 'veryfast',
            '-tune', 'zerolatency',
            '-g', '50',
            '-b:v', '2500k',
            '-maxrate', '3000k',
            '-bufsize', '5000k',
            '-pix_fmt', 'yuv420p',
            '-c:a', 'aac',
            '-b:a', '128k',
            '-ar', '44100',
            '-ac', '2',
            '-f', 'flv'
        ])
        .output(ytRtmpUrl)
        .on('start', (commandLine) => console.log('FFmpeg started:', commandLine))
        .on('error', (err) => {
            console.error('Streaming error:', err.message);
            activeStreamProcess = null;
        })
        .on('end', () => {
            console.log('Streaming finished.');
            activeStreamProcess = null;
        });

    command.run();
    activeStreamProcess = command;

    res.send('<h2>YouTube Live started successfully! 🚀</h2>');
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

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
