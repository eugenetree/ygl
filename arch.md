channel-scraping:
1. seeding 300_000 search queries into db
2. worker uses "search-videos-with-captions" youtube filter and gets videos with captions
3. worker takes channel from the result and puts into channels table
4. orchestrating of queries is done via status field in search-queries table

channel-videos-scraping:
1. worker takes channel from channels table and scrapes videos from it
2. worker puts videos into videos table
3. orchestrating of channels is done via status field in channels table

video-caption-scraping:
1. worker takes video from videos table and scrapes captions from it
2. worker puts captions into captions table
3. orchestrating of videos is done via status field in videos table
