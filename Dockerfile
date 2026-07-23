FROM node:18-slim

# FFmpeg සහ අවශ්‍ය ලිනක්ස් පැකේජ් ඉන්ස්ටෝල් කරගැනීම
RUN apt-get update && apt-get install -y \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 3000

CMD ["node", "server.js"]
