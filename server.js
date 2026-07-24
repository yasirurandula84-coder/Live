const express = require('express');
const { spawn } = require('child_process');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

let activeStreamProcess = null;

// Facebook Live පටන් ගන්න API Route එක
app.post('/start-fb-live', (req, res) => {
    const { streamKey, streamUrl } = req.body;

    if (!streamKey || !streamUrl) {
        return res.status(400).send('Stream Key and Stream URL are required!');
    }

    if (activeStreamProcess) {
        return res.status(400).send('A stream is already running! Stop it first.');
    }

    const fbRtmpUrl = `rtmps://live-api-s.facebook.com:443/rtmp/${streamKey}`;

    console.log("Starting FFmpeg stream to Facebook...");
    console.log("Source:", streamUrl);

    // FFmpeg හරහා m3u8 ලින්ක් එක ග්‍රැබ් කර Facebook වෙත යැවීම
    const ffmpegArgs = [
        '-re',
        '-i', streamUrl,
        '-c:v', 'copy', // කොඩිං වෙනස් නොකර වේගයෙන් යැවීමට (သို့မဟုတ် libx264 පාවිච්චි කළ හැක)
        '-c:a', 'aac',
        '-b:a', '128k',
        '-f', 'flv',
        fbRtmpUrl
    ];

    activeStreamProcess = spawn('ffmpeg', ffmpegArgs);

    activeStreamProcess.stdout.on('data', (data) => {
        console.log(`FFmpeg stdout: ${data}`);
    });

    activeStreamProcess.stderr.on('data', (data) => {
        console.error(`FFmpeg log: ${data}`);
    });

    activeStreamProcess.on('close', (code) => {
        console.log(`FFmpeg process exited with code ${code}`);
        activeStreamProcess = null;
    });

    res.send({ status: 'success', message: 'Facebook Live stream started successfully!' });
});

// Stream එක නවත්වන්න API Route එක
app.post('/stop-fb-live', (req, res) => {
    if (activeStreamProcess) {
        activeStreamProcess.kill('SIGKILL');
        activeStreamProcess = null;
        console.log("Stream stopped by user.");
        return res.send({ status: 'success', message: 'Stream stopped successfully.' });
    }
    res.status(400).send({ status: 'error', message: 'No active stream running.' });
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
