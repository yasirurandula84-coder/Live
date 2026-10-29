const express = require('express');
const { spawn } = require('child_process');
const puppeteer = require('puppeteer');
const fs = require('fs');
const https = require('https');

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

let streamingProcess = null;

// Web interface ekata yaddi penena page eka
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <title>Cricket Streamer Control Panel</title>
        <style>
            body { font-family: Arial, sans-serif; background: #121212; color: #fff; text-align: center; padding-top: 50px; }
            .card { background: #1e1e1e; padding: 30px; border-radius: 10px; display: inline-block; box-shadow: 0 4px 10px rgba(0,0,0,0.5); }
            input { width: 300px; padding: 10px; margin: 10px 0; border-radius: 5px; border: none; }
            button { background: #ff4757; color: white; border: none; padding: 10px 20px; font-size: 16px; border-radius: 5px; cursor: pointer; }
            button:hover { background: #ff6b81; }
            .status { margin-top: 15px; font-weight: bold; }
        </style>
    </head>
    <body>
        <div class="card">
            <h2>Facebook Cricket Streamer</h2>
            <form action="/start" method="POST">
                <label>Enter Facebook Stream Key:</label><br>
                <input type="text" name="fb_key" required placeholder="Paste FB Stream Key here"><br>
                <button type="submit">Start Live Stream</button>
            </form>
            <form action="/stop" method="POST" style="margin-top: 15px;">
                <button type="submit" style="background: #2ed573;">Stop Stream</button>
            </form>
            <div class="status">System Status: Ready</div>
        </div>
    </body>
    </html>
  `);
});

// Stream eka start kirima
app.post('/start', async (req, res) => {
  const fbKey = req.body.fb_key;
  if (!fbKey) return res.send('Stream key is required! <a href="/">Go Back</a>');

  if (streamingProcess) {
    return res.send('Stream is already running! <a href="/">Go Back</a>');
  }

  res.send('Stream starting command sent! Check your Facebook page. <a href="/">Go Back</a>');

  // Background music eka download karaganeema if not exists
  if (!fs.existsSync('bgmusic.mp3')) {
    const file = fs.createWriteStream("bgmusic.mp3");
    https.get("https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3", response => {
      response.pipe(file);
    });
  }

  // Puppeteer script eka run karana eka
  const puppeteerScript = `
  const puppeteer = require('puppeteer');
  (async () => {
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--window-size=1280,720', '--autoplay-policy=no-user-gesture-required']
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });
    await page.goto('https://footfytv.pro/watch/4527', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 6000));
    await page.evaluate(async () => {
      const buttons = Array.from(document.querySelectorAll('button, a, div.server-item, span'));
      const tapmadBtn = buttons.find(el => el.textContent && el.textContent.toLowerCase().includes('tapmad'));
      if (tapmadBtn) tapmadBtn.click();
      await new Promise(resolve => setTimeout(resolve, 3000));
      const video = document.querySelector('video');
      if (video) { video.muted = false; video.volume = 1.0; }
    });
  })();
  `;
  fs.writeFileSync('run_puppeteer.js', puppeteerScript);
  spawn('node', ['run_puppeteer.js']);

  setTimeout(() => {
    // FFmpeg Stream Command
    const ffmpegArgs = [
      '-y',
      '-f', 'x11grab', '-framerate', '30', '-video_size', '1280x720', '-i', ':99.0',
      '-f', 'pulse', '-i', 'default',
      '-stream_loop', '-1', '-i', 'bgmusic.mp3',
      '-map_metadata', '-1',
      '-filter_complex', '[0:v]crop=in_w-20:in_h-20:10:10,scale=1280:720,eq=brightness=0.06:contrast=1.90:saturation=1.50:gamma=1.20,hue=h=30:s=1.3,noise=alls=40:allf=t+u,unsharp=13:13:1.5:11:11:0.9,fps=30,setpts=0.995*PTS,drawtext=text=\' SPORT RANUWA \':x=w-tw-25:y=25:fontsize=36:fontcolor=white:box=1:boxcolor=red@0.9:boxborderw=15,drawtext=text=\' LIVE CRICKET STREAM 24/7 \':x=\'mod(t*55, w+200)-100\':y=h-35:fontsize=20:fontcolor=white@0.95:box=1:boxcolor=black@0.8:boxborderw=4[v]; [1:a]asetrate=44100*0.67,aresample=44100,equalizer=f=250:width_type=h:width=800:g=-45,equalizer=f=5000:width_type=h:width=800:g=-40,aecho=0.8:0.85:50:0.35,volume=0.02[main_audio]; [2:a]volume=0.01[bg_audio]; [main_audio][bg_audio]amix=inputs=2:duration=first[a]',
      '-map', '[v]', '-map', '[a]',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-g', '60', '-keyint_min', '60', '-b:v', '1500k', '-maxrate', '1800k', '-bufsize', '3600k',
      '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-ac', '2',
      '-flvflags', 'no_duration_filesize',
      '-f', 'flv', `rtmps://live-api-s.facebook.com:443/rtmp/${fbKey}`
    ];

    streamingProcess = spawn('ffmpeg', ffmpegArgs);

    streamingProcess.on('close', (code) => {
      console.log(`FFmpeg process exited with code ${code}`);
      streamingProcess = null;
    });
  }, 10000);
});

// Stream eka nawatvima
app.post('/stop', (req, res) => {
  if (streamingProcess) {
    streamingProcess.kill('SIGKILL');
    streamingProcess = null;
    res.send('Stream stopped successfully! <a href="/">Go Back</a>');
  } else {
    res.send('No active stream found. <a href="/">Go Back</a>');
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
