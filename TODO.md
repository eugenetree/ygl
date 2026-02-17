- [x] update channelVideoDetailsExtractor to return captions in format of
      `{ [languageCode]: { auto: string, manual: string } }`
- [x] update youtubeApiClient.getVideoDetails to return details without captions
- [x] move captions from youtubeApiClient.getVideoDetails to youtubeApiClient.getCaptions
- [?] update getVideoSubtitles to use youtubeApiClient.getCaptions
  https://justlove.ro/checkout/order-received/115294/?key=wc_order_00AGHmu5jKS2X

// check captions here s0GNmddgbVE
https://www.youtube.com/watch?v=s0GNmddgbVE&ab_channel=WWE

every channel
scrape

every channel ->
start scraping channel videos (not only video ids, but videos with captions)
if at some point, at some batch we recieve from channel-videos
scrapper less videos with manual captions as expected - we should
stop scraping this channel and mark this in database
after some time we should scrap it once again starting from the
latest videos to see if anything has changed

why scraping full channel info is bad in scope of search-channels-scrapper?
because periodically we want to go through the whole list of queries again
and if we keep using the flow with scraping full info inside of search-channes-scraper
we'll end up having many useless requests for full channel info because those channels are already in our db

is it okay to have not "id" column as unique one, but something like "query"?
can I use foreign key as a primary key?
do we always need to have created_at & updated_at fields?

video no subs
https://www.youtube.com/watch?v=_XoyAD2tFhM


finalize switch to hasManualCaptions hasAutoCaptions or something like this
filter out music channels, either during sync with elastic or even during initial scrapping
get rid of "x2", "x3", "xN" in video for calculating similariy, but probably keep it in the final captions stored in db