import { injectable } from "inversify";
import { pick } from "lodash-es";

import { CaptionProps } from "../../caption.js";
import { Caption as CaptionDto, Video as VideoDto } from "../../../../../youtube-api/youtube-api.types.js";
import { VideoProps } from "../../video.js";

@injectable()
export class VideoMapper {
  mapDtoToVideoProps({
    videoDto,
  }: {
    videoDto: VideoDto;
  }): Omit<
    VideoProps,
    | "captionsProcessingAlgorithmVersion"
    | "autoCaptionsStatus"
    | "manualCaptionsStatus"
    | "captionsSimilarityScore"
    | "captionsShift"
  > {
    return {
      ...pick(videoDto, [
        "id",
        "title",
        "duration",
        "keywords",
        "channelId",
        "viewCount",
        "thumbnail",
        "languageCode",
        "languageCodeYtdlp",
        "asr",
        "abr",
        "acodec",
        "audioChannels",
        "audioQuality",
        "isDrc",
        "categories",
        "track",
        "artist",
        "album",
        "creator",
        "uploadedAt",
        "description",
        "likeCount",
        "commentCount",
        "availability",
        "playableInEmbed",
        "channelIsVerified",
        "liveStatus",
        "ageLimit",
        "mediaType",
      ]),
    };
  }

  mapDtoToCaptionProps({
    videoId,
    captionsDto,
    type,
  }: {
    videoId: string;
    captionsDto: CaptionDto[];
    type: "auto" | "manual";
  }): CaptionProps[] {
    return captionsDto.map((captionDto) => ({
      ...captionDto,
      videoId,
      type,
    }));
  }
}
