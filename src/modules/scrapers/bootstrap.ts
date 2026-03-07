import { bootstrap as bootstrapSearchQueries } from "./channel-discovery/bootstrap.js";
import { bootstrap as bootstrapChannelEntries } from "./channel/bootstrap.js";
import { bootstrap as bootstrapChannels } from "./video-discovery/bootstrap.js";
import { bootstrap as bootstrapVideoEntries } from "./video/bootstrap.js";

export function bootstrap() {
  bootstrapSearchQueries();
  bootstrapChannelEntries();
  bootstrapChannels();
  bootstrapVideoEntries();
}

bootstrap();
