20 feb - trying to understand how to get category of video, and maybe limit videos to some categories that are more likely to product good content

22 feb - check if during search-channels via videos I can check if video is music
22 feb - probably I have to update system to store record per every video during scraping
22 feb - needed to understand how to cover the case with channels with many only-manual-captions videos
22 feb - understand which captions I want skip and which to keep, should I store failed auto captions in db or not

22 feb - understand how to detec like https://www.youtube.com/watch?v=k5UmYDkN6Dk
CC1 DTVCC1 and skip them

understand why manual captions now fetched for https://www.youtube.com/watch?v=6EfrNmX0RCA

!!
Optimization Tip: Almost 75% of your bandwidth (~600 MB) is spent just downloading the full watch?v={id} HTML page simply to extract the INNERTUBE_API_KEY. The INNERTUBE_API_KEY is completely static for the YouTube API (it almost never changes and is universally shared across clients). If you simply hardcode this known string, or fetch it just once at the start of the script and reuse it for all 1000 inner tube requests, you can cut your data usage from ~800 MB down to just ~150-200 MB!

24 feb - the reason why approach with scraping & storing video entries separatly is beneficial as we can easily rescrape same queries over time as results may change, and we don't have to make additiona request-per-channel