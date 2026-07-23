FROM node:18-slim

# අවශ්‍ය ලිනක්ස් පැකේජ් සහ ඩවුන්ලෝඩ් ටූල්ස් ඉන්ස්ටෝල් කරගැනීම
RUN apt-get update && apt-get install -y \
    ffmpeg \
    curl \
    wget \
    unzip \
    && rm -rf /var/lib/apt/lists/*

# Bento4 (mp4decrypt) ඩවුන්ලෝඩ් කර සර්වර් එකට දාගැනීම
RUN wget -O bento4.zip https://www.bok.net/Bento4/binaries/Bento4-SDK-1-6-0-641.x86_64-unknown-linux.zip && \
    unzip bento4.zip && \
    cp Bento4-SDK-1-6-0-641.x86_64-unknown-linux/bin/mp4decrypt /usr/local/bin/ && \
    rm -rf Bento4-SDK-1-6-0-641.x86_64-unknown-linux bento4.zip

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 3000

CMD ["node", "server.js"]
