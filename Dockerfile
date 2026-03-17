FROM node:22-alpine

WORKDIR /usr/src/app

# Install yt-dlp dependencies and the binary itself
RUN apk add --no-cache curl python3 ffmpeg && \
    curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && \
    chmod a+rx /usr/local/bin/yt-dlp

COPY package*.json ./

RUN npm install

COPY . .

CMD ["sleep", "infinity"]
