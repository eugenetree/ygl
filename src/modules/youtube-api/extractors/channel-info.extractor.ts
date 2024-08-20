import { Failure, Result, Success } from "../../../types";
import { ValidationError } from "../../_common/validation/errors";
import { ChannelInfoExtractorError } from "./channel-info.errors";
import { z } from "zod";

type ChannelInfo = z.infer<typeof channelInfoSchema>;

const channelInfoSchema = z.object({
  externalId: z.string(),
  title: z.string(),
  description: z.string(),
  avatar: z.object({
    thumbnails: z.array(z.object({ url: z.string() })),
  }),
  keywords: z.string(),
  subscriberCountText: z.string(),
  viewCountText: z.string(),
  videoCountText: z.string(),
  country: z.string(),
});

export class ChannelInfoExtractor {
  getChannelInfo(
    youtubeDataObject: any
  ): Result<ChannelInfo, ChannelInfoExtractorError> {
    const metadataRenderer =
      youtubeDataObject?.metadata?.channelMetadataRenderer;

    const aboutChannelViewModel =
      youtubeDataObject?.onResponseReceivedEndpoints?.[0]
        ?.showEngagementPanelEndpoint?.engagementPanel
        ?.engagementPanelSectionListRenderer?.content?.sectionListRenderer
        ?.contents?.[0]?.itemSectionRenderer?.contents?.[0]
        ?.aboutChannelRenderer?.metadata?.aboutChannelViewModel;

    const result = {
      id: metadataRenderer?.externalId,
      name: metadataRenderer?.title,
      description: metadataRenderer?.description,
      thumbnail: metadataRenderer?.avatar?.thumbnails?.[0]?.url,
      keywords: metadataRenderer?.keywords,
      subscriberCount: aboutChannelViewModel?.subscriberCountText,
      viewCount: aboutChannelViewModel?.viewCountText,
      videoCount: aboutChannelViewModel?.videoCountText,
      countryName: aboutChannelViewModel?.country,
    };

    const parseResult = channelInfoSchema.safeParse(result);

    return parseResult.success
      ? Success(parseResult.data)
      : Failure(new ValidationError(parseResult.error));
  }
}

export const channelInfoExtractor = new ChannelInfoExtractor();
