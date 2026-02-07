import { bootstrap as bootstrapChannels } from "./channels/runtime/bootstrap.js";
import { bootstrap as bootstrapChannelVideos } from "./channel-videos/runtime/bootstrap.js";

export function bootstrap() {
  bootstrapChannels();
  bootstrapChannelVideos();
}

bootstrap();
