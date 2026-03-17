// import { omit } from "lodash-es";

// import { Failure, Result, Success } from "../../types/index.js";
// import { FetchError } from "../_common/http/errors.js";
// import { httpClient } from "../_common/http/index.js";
// import { Logger } from "../_common/logger/logger.js";
// import { ParsingError, ValidationError } from "../_common/validation/errors.js";
// import { LanguageCode, isValidLanguageCode } from "../i18n/index.js";
// import { captionsExtractor } from "./extractors/captions.extractor.js";
// import {
//   OutputVideo,
//   channelVideoDetailsExtractor,
// } from "./extractors/channel-video.exctractor.js";
// import { Caption, Video } from "./youtube-api.types.js";

// /**
//  * This is not used anymore after migration to yt-dlp.
//  */
// class YoutubeApiGetVideo {
//   private logger = new Logger({ context: YoutubeApiGetVideo.name });

//   public async getVideo(
//     videoId: string,
//   ): Promise<Result<Video, FetchError | ParsingError | ValidationError>> {
//     const url = encodeURI(`https://youtube.com/watch?v=${videoId}`);
//     const watchPageResponseResult = await httpClient.get(url);

//     if (!watchPageResponseResult.ok) {
//       return Failure(watchPageResponseResult.error);
//     }

//     const innerTubeApiKeyResult =
//       channelVideoDetailsExtractor.extractInnerTubeApiKey(
//         watchPageResponseResult.value,
//       );

//     if (!innerTubeApiKeyResult.ok) {
//       return Failure(innerTubeApiKeyResult.error);
//     }

//     const innerTubeApiKey = innerTubeApiKeyResult.value;

//     const innerTubeResult = await httpClient.post(
//       `https://www.youtube.com/youtubei/v1/player?key=${innerTubeApiKey}`,
//       {
//         body: {
//           context: {
//             client: { clientName: "ANDROID", clientVersion: "20.10.38" },
//           },
//           videoId: videoId,
//         },
//       },
//     );

//     if (!innerTubeResult.ok) {
//       return Failure(innerTubeResult.error);
//     }

//     const videoDetailsResult =
//       channelVideoDetailsExtractor.extractFromInnerTubeJson(
//         innerTubeResult.value,
//       );

//     if (!videoDetailsResult.ok) {
//       return Failure(videoDetailsResult.error);
//     }

//     const videoDetails = videoDetailsResult.value as any;
//     const tracks = videoDetails.captionTracksUrls;
//     const videoBase = omit(videoDetails, ["captionTracksUrls"]) as Omit<any, "captionTracksUrls">;

//     const language = this.detectLanguage(tracks);

//     if (!language) {
//       const hasManual = Object.values(tracks).some((t: any) => Boolean(t?.manual));
//       if (hasManual) this.logger.info(`Video ${videoDetails.id} has only manual captions.`);
//       return Success({
//         ...videoBase,
//         captionStatus: hasManual ? "MANUAL_ONLY" : "NONE",
//         languageCode: null,
//         autoCaptions: null,
//         manualCaptions: null,
//       } as unknown as Video);
//     }

//     const autoUrl = tracks[language]?.auto;
//     if (!autoUrl) {
//       return Failure({
//         type: "PARSING_ERROR",
//         message: "No auto captions track URL found",
//         context: { language, tracks },
//       });
//     }

//     const autoCaptionsResult = await this.getCaptions({ baseUrl: autoUrl });
//     if (!autoCaptionsResult.ok) {
//       return Failure(autoCaptionsResult.error);
//     }

//     let manualUrl = tracks[language]?.manual;

//     if (!manualUrl) {
//       // Manual captions might be uploaded with a specific dialect (e.g., 'en-us')
//       // while auto captions are grouped under the base language ('en').
//       // If an exact language match isn't found, fallback to checking if any manual
//       // track shares the same base language.
//       const baseLang = language.split("-")[0];
//       const fallbackLangContent = Object.entries(tracks).find(
//         ([langCode, track]: [string, any]) => langCode.split("-")[0] === baseLang && track?.manual
//       );

//       if (fallbackLangContent) {
//         this.logger.info(`Manual captions not found for lang ${language}, using fallback lang ${fallbackLangContent[0]}`);
//         manualUrl = (fallbackLangContent[1] as any)?.manual;
//       }
//     }

//     if (!manualUrl) {
//       return Success({
//         ...videoBase,
//         captionStatus: "AUTO_ONLY",
//         languageCode: language,
//         autoCaptions: autoCaptionsResult.value.captions,
//         manualCaptions: null,
//       } as unknown as Video);
//     }

//     const manualCaptionsResult = await this.getCaptions({ baseUrl: manualUrl });
//     if (!manualCaptionsResult.ok) {
//       return Failure(manualCaptionsResult.error);
//     }

//     return Success({
//       ...videoBase,
//       captionStatus: "BOTH",
//       languageCode: language,
//       autoCaptions: autoCaptionsResult.value.captions,
//       manualCaptions: manualCaptionsResult.value.captions,
//     } as unknown as Video);
//   }

//   private detectLanguage(
//     captionTracksUrls: OutputVideo["captionTracksUrls"],
//   ): LanguageCode | null {
//     const languagesWithAutoCaptions = Object.keys(captionTracksUrls).filter(
//       (language) => captionTracksUrls[language as LanguageCode]?.auto,
//     );

//     if (languagesWithAutoCaptions.length === 0) {
//       return null;
//     }

//     if (languagesWithAutoCaptions.length > 1) {
//       this.logger.warn(
//         "More than one language with auto captions, choosing the first one. " +
//         "captionTracksUrls: " + JSON.stringify(captionTracksUrls),
//       );

//       return null;
//     }

//     const languageCode = languagesWithAutoCaptions[0];

//     if (!isValidLanguageCode(languageCode)) {
//       return null;
//     }

//     return languageCode;
//   }


//   private async getCaptions({
//     baseUrl,
//   }: {
//     baseUrl: string;
//   }): Promise<
//     Result<{ captions: Caption[] }, ParsingError | FetchError | ValidationError>
//   > {
//     const captionsResponseResult = await httpClient.get(
//       baseUrl.replace("fmt=srv3", "fmt=json3"),
//     );

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
//       captions: captionsResult.value.map((caption) => {
//         const { textSegments, ...rest } = caption;
//         return {
//           ...rest,
//           text: textSegments.map((segment) => segment.utf8).join(""),
//         };
//       }),
//     });
//   }
// }