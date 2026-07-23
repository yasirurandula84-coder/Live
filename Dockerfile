FROM node:18-slim

# FFmpeg සහ අවශ්‍ය මෙවලම් ඉන්ස්ටෝල් කරගැනීම
RUN apt-get update && apt-get install -y \
    ffmpeg \
    curl \
    wget \
    xz-utils \
    && rm -rf /var/lib/apt/lists/*

# Shaka Packager ඩවුන්로드 කර සර්වර් එකට දාගැනීම
RUN curl -L https://github.com/shaka-project/shaka-packager/releases/download/v2.6.1/packager-linux-x64 -o /usr/local/bin/packager && \
    chmod +x /usr/local/bin/packager

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 3000

CMD ["node", "server.js"]
