// import { Failure, Result, Success } from "../../types/index.js";
// import { FetchError } from "../_common/http/errors.js";
// import { httpClient } from "../_common/http/index.js";
// import { ParsingError, ValidationError } from "../_common/validation/errors.js";
// import { captionsExtractor } from "./extractors/captions.extractor.js";
// import { channelInfoExtractor } from "./extractors/channel-info.extractor.js";
// import { channelVideoDetailsExtractor } from "./extractors/channel-video.exctractor.js";
// import { channelVideosExtractor } from "./extractors/channel-videos.extractor.js";
// import {
//   Caption,
//   Channel,
//   GetChannelVideosResult,
//   Video,
// } from "./youtube-api.types.js";
// import { YoutubeApiSearchChannels } from "./yt-api-search-channels.js";

// class YoutubeApiClientError extends Error {
//   constructor(message: string) {
//     super(message);
//     this.name = "YoutubeApiClientError";
//   }
// }

// class YoutubeApiClient {
//   public async searchChannels(
//     params: Parameters<
//       typeof YoutubeApiSearchChannels.prototype.searchChannels
//     >[0],
//   ) {
//     return new YoutubeApiSearchChannels().searchChannels(params);
//   }

//   async getVideoDetails(
//     videoId: string,
//   ): Promise<Result<Video, ParsingError | FetchError | ValidationError>> {
//     const url = encodeURI(`https://youtube.com/watch?v=${videoId}`);
//     const videoDetailsHtmlResult = await httpClient.get(url);

//     if (!videoDetailsHtmlResult.ok) {
//       return Failure(videoDetailsHtmlResult.error);
//     }

//     const videoDetailsResult = channelVideoDetailsExtractor.extract(
//       videoDetailsHtmlResult.value,
//     );

//     if (!videoDetailsResult.ok) {
//       return Failure(videoDetailsResult.error);
//     }

//     return Success(videoDetailsResult.value);
//   }

//   public async getCaptions({
//     baseUrl,
//   }: {
//     baseUrl: string;
//   }): Promise<
//     Result<{ captions: Caption[] }, ParsingError | FetchError | ValidationError>
//   > {
//     const captionsResponseResult = await httpClient.get(baseUrl + "&fmt=json3");

//     if (!captionsResponseResult.ok) {
//       return Failure(captionsResponseResult.error);
//     }

//     const captionsResult = captionsExtractor.extractFromJson({
//       jsonResponse: captionsResponseResult.value,
//     });

//     if (!captionsResult.ok) {
//       return Failure(captionsResult.error);
//     }

//     return Success({
//       captions: captionsResult.value,
//     });
//   }

//   public async getChannelVideos(
//     params: { channelId: string } | { token: string },
//   ): Promise<GetChannelVideosResult> {
//     if ("channelId" in params && !("token" in params)) {
//       return this.getChannelVideosInitial(params.channelId);
//     }

//     if ("token" in params) {
//       // TODO: rework
//       // @ts-expect-error TODO: fix type issues with token parameter
//       return this.getChannelVideosContinuation(params.token);
//     }

//     // TODO: rework
//     throw new Error();
//   }

//   private async getChannelVideosInitial(
//     channelId: string,
//   ): Promise<GetChannelVideosResult> {
//     const url = encodeURI(`https://youtube.com/channel/${channelId}/videos`);

//     const responseResult = await httpClient.get(url);
//     if (!responseResult.ok) {
//       return Failure(responseResult.error);
//     }

//     const videosResult = channelVideosExtractor.extractFromHtml(
//       responseResult.value,
//     );

//     if (!videosResult.ok) {
//       return Failure(videosResult.error);
//     }

//     // @ts-expect-error TODO: fix type mismatch between extractor return type and Success type
//     return Success(videosResult.value);
//   }

//   private async getChannelVideosContinuation(token: string) {
//     const url = "https://www.youtube.com/youtubei/v1/browse?prettyPrint=false";

//     console.log("before");

//     const response = await fetch(url, {
//       method: "POST",
//       headers: {
//         "Content-Type": "application/json",
//       },
//       body: JSON.stringify({
//         context: {
//           client: {
//             clientName: "WEB",
//             clientVersion: "2.20240906.01.00",
//           },
//         },
//         continuation: token,
//       }),
//     });

//     console.log("after");

//     const json = await response.json();
//     const lastItem =
//       json.onResponseReceivedActions[0].appendContinuationItemsAction
//         .continuationItems[
//         json.onResponseReceivedActions[0].appendContinuationItemsAction
//           .continuationItems.length - 2
//       ].richItemRenderer.content.videoRenderer;
//     console.log(JSON.stringify(lastItem, null, 2));

//     return Success({
//       videos: [],
//     });
//   }

//   public async getChannelInfo(
//     channelId: string,
//   ): Promise<Result<Channel, YoutubeApiClientError>> {
//     const url = encodeURI(`https://youtube.com/channel/${channelId}/about`);

//     const response = await httpClient.get(url);
//     if (!response.ok) {
//       return Failure(response.error);
//     }

//     const pageResult = youtubePageParser.getInitialDataFromHtml(response);
//     if (!pageResult.ok) {
//       return Failure(new YoutubeApiClientError(`pageResult is not ok`));
//     }

//     const channelInfoResult = channelInfoExtractor.getChannelInfo(
//       pageResult.value,
//     );

//     if (!channelInfoResult.ok) {
//       return Failure(new YoutubeApiClientError(`channelResult is not ok`));
//     }

//     return Success(channelInfoResult.value);
//   }
// }

// export const youtubeApiClient = new YoutubeApiClient();
