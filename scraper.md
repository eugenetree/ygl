how scraping flow can be started at the moment?

1. User sends /start command to telegram bot.
2. Scraping code gets deployed and once it's built - it checks if scraping flow is not running - starts it.

how scraping flow can be stopped?

1. User sends /stop command to telegram bot. - if scraping flow is running, it should do graceful shutdown.
2. Scraping flow has nothing to scrape. If it meets this condition - it should stop itself.
3. User sends /kill command to telegram bot. - if scraping flow is running, it should stop immediately.

*graceful shutdown means - finish current video/channel scraping and then stop.

Confusion:

1. User sends /start command. Should we wait until scraping flow is started and then send response? Or should we response immediately like "start requested" and then notify when it's started? Same question for /stop and /kill commands.
2. Will it be possible to distinguish between start/stop initiated by telegram-bot, and start/stop/kill initiated by system? (it can be me just stopping container, or auto start after deployment)
