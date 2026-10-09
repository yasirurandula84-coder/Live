Const express = require('express');
Const path = require('path');
Const fetch = require('node-fetch');
Const http = require('http');
Const { Server } = require('socket.io');
Const ffmpeg = require('fluent-ffmpeg');

Const app = express();
Const server = http.createServer(app);
Const io = new Server(server);

Const PORT = process.env.PORT || 3000;

App.use(express.static(path.join(__dirname, 'public')));
App.use(express.urlencoded({ extended: true }));
App.use(express.json());

Let activeStreamProcess = null;

// ප්‍රොක්සි රූට් එක
app.get('/proxy', async (req, res) => {
    Let targetUrl = req.query.url;
    If (!targetUrl) return res.status(400).send('Missing url');

    Try {
        Const response = await fetch(targetUrl, {
            Headers: {
                'User-Agent': 'VLC/3.0.20 LibVLC/3.0.20',
                'Icy-MetaData': '1',
                'Accept-Encoding': 'identity',
                'Referer': 'https://www.itcnbd.live/'
            }
        });
        Response.headers.forEach((v, n) => res.setHeader(n, v));
        Res.status(response.status);

        If (targetUrl.endsWith('.m3u8')) {
            Const text = await response.text();
            Const rewritten = text.split('\n').map(line => {
                Line = line.trim();
                If (line && !line.startsWith('#')) {
                    Let absoluteUrl = line;
                    If (!line.startsWith('http')) {
                        Const urlObj = new URL(targetUrl);
                        AbsoluteUrl = `${urlObj.origin}${line.startsWith('/') ? '' : '/'}${line}`;
                    }
                    Return `/proxy?url=${encodeURIComponent(absoluteUrl)}`;
                }
                Return line;
            }).join('\n');
            Return res.send(rewritten);
        }
        Response.body.pipe(res);
    } catch (err) {
        Res.status(500).send('Proxy error');
    }
});

// YouTube Live එක පටන් ගන්න රූට් එක
app.post('/start-live', (req, res) => {
    If (activeStreamProcess) {
        Return res.status(400).send('A stream is already running! Stop it first.');
    }

    // ඔයා දුන් අලුත් Ayna OTT M3U8 ලින්ක් එක
    Const streamUrl = "https://tvsen6.aynaott.com/zv68oqPDu7MZZwmHhRxt/tracks-v1a1/mono.ts.m3u8";
    
    // **මෙතැනට ඔයාගේ YouTube Stream Key එක දාන්න** (උදාහරණයක් ලෙස: abcd-efgh-ijkl-mnop)
    Const youtubeStreamKey = "YOUR_YOUTUBE_STREAM_KEY_HERE"; 
    Const youtubeRtmpUrl = `rtmp://a.rtmp.youtube.com/live2/${youtubeStreamKey}`;

    Console.log('Starting YouTube Live streaming directly from:', streamUrl);

    Function startStream() {
        If (activeStreamProcess) {
            Try { activeStreamProcess.kill('SIGKILL'); } catch(e) {}
            ActiveStreamProcess = null;
        }

        Const command = ffmpeg(streamUrl)
            .inputOptions([
                '-re',
                '-reconnect 1',
                '-reconnect_streamed 1',
                '-reconnect_delay_max 5',
                '-fflags +discardcorrupt+genpts+nobuffer',
                '-probesize 50M',
                '-analyzeduration 20M'
            ])
            .outputOptions([
                '-sws_flags', 'fast_bilinear',
                '-vf', 'setpts=0.998*PTS,crop=in_w-40:in_h-40:20:20,scale=1280:720,eq=saturation=1.1:contrast=1.15,' +
                       'drawbox=x=1140:y=25:w=100:h=65:color=black@0.85:t=fill,' +
                       'drawbox=x=1140:y=25:w=100:h=65:color=yellow@0.9:t=2,' +
                       'drawtext=text=LANKA:fontcolor=white:fontsize=18:x=1165:y=32,' +
                       'drawtext=text=LIVE:fontcolor=yellow:fontsize=20:x=1158:y=55,' +
                       'drawtext=text=SHARE_NOW:fontcolor=white@0.75:fontsize=22:x=(w-text_w)/2:y=h-50',
            
                '-af', 'atempo=1.002,rubberband=pitch=1.08:tempo=1.0',

                '-threads', '4',               
                '-r', '25',                    
                '-c:v', 'libx264',
                '-preset', 'ultrafast',        
                '-tune', 'zerolatency',
                '-b:v', '1000k',               
                '-maxrate', '1400k',
                '-bufsize', '2800k',
                '-pix_fmt', 'yuv420p',
                '-g', '50',                    
                '-c:a', 'aac',
                '-b:a', '128k',
                '-ar', '44100',
                '-max_muxing_queue_size', '9999',
                '-f', 'flv'
            ])
            .output(youtubeRtmpUrl)
            .on('start', (commandLine) => {
                Console.log('FFmpeg Stream spawned to YouTube:', commandLine);
            })
            .on('error', (err) => {
                Console.error('Streaming error encountered:', err.message);
                If (activeStreamProcess) {
                    SetTimeout(() => {
                        Console.log('Attempting to restart stream after error...');
                        StartStream();
                    }, 3000);
                }
            })
            .on('end', () => {
                Console.log('Streaming finished. Restarting automatically...');
                If (activeStreamProcess) {
                    SetTimeout(() => {
                        StartStream();
                    }, 2000);
                }
            });

        Command.run();
        ActiveStreamProcess = command;
    }

    StartStream();

    Res.send('<h2>YouTube Live stream started successfully! 🚀🔥</h2>');
});

// ලයිව් එක නතර කරන්න රූට් එක
app.get('/stop-live', (req, res) => {
    If (activeStreamProcess) {
        ActiveStreamProcess.kill('SIGKILL');
        ActiveStreamProcess = null;
        Res.send('<h2>YouTube Live stream stopped successfully.</h2>');
    } else {
        Res.status(400).send('No active stream running.');
    }
});

Let activeViewers = 0;
Io.on('connection', (socket) => {
    ActiveViewers++;
    Io.emit('updateViewers', activeViewers);
    Socket.on('disconnect', () => {
        ActiveViewers = Math.max(0, activeViewers - 1);
        Io.emit('updateViewers', activeViewers);
    });
});

Server.listen(PORT, () => {
    Console.log(`Server running on port ${PORT}`);
});
