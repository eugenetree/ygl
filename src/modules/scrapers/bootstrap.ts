import { bootstrap as bootstrapSearchQueries } from "./search-queries/bootstrap.js";
import { bootstrap as bootstrapChannelEntries } from "./channel-entries/bootstrap.js";
import { bootstrap as bootstrapChannels } from "./channels/bootstrap.js";
import { bootstrap as bootstrapVideoEntries } from "./video-entries/bootstrap.js";

export function bootstrap() {
  bootstrapSearchQueries();
  bootstrapChannelEntries();
  bootstrapChannels();
  bootstrapVideoEntries();
}

bootstrap();
