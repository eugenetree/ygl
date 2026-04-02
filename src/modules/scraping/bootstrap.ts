import { bootstrap as bootstrapSearchQueries } from "./scrapers/channel-discovery/bootstrap.js";
import { bootstrap as bootstrapChannelEntries } from "./scrapers/channel/bootstrap.js";
import { bootstrap as bootstrapChannels } from "./scrapers/video-discovery/bootstrap.js";
import { bootstrap as bootstrapVideoEntries } from "./scrapers/video/bootstrap.js";

export function bootstrap() {
  bootstrapSearchQueries();
  bootstrapChannelEntries();
  bootstrapChannels();
  bootstrapVideoEntries();
}

// bootstrap();
