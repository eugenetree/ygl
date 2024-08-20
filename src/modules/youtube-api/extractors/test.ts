// import { Failure, Result, Success } from "../../../types";
// import { z, ZodError } from "zod";
// import { ValidationError } from "../../_common/validation/errors";

// type ChannelVideo = z.infer<typeof channelVideoSchema>;
// type Token = z.infer<typeof tokenSchema>;

// const channelVideoSchema = z.object({
//   id: z.string(),
//   thumbnail: z.string().optional(),
//   title: z.string(),
//   duration: z.string(),
//   viewCount: z.string(),
// });

// const tokenSchema = z.string().min(1);

// const youtubeDataObjectSchema = z.object({
//   contents: z.object({
//     twoColumnBrowseResultsRenderer: z.object({
//       tabs: z.array(z.unknown()),
//     }),
//   }),
// });

// const videoTabSchema = z.object({
//   tabRenderer: z.object({
//     title: z.literal("Title"),
//     content: z.object({
//       richGridRenderer: z.object({
//         contents: z.array(z.unknown()),
//       }),
//     }),
//   }),
// });

// const videoContentSchema = z.object({
//   richItemRenderer: z.object({
//     content: z.array(z.unknown()),
//   }),
// });

// const videoRendererSchema = z.object({
//   videoRenderer: z.object({
//     videoId: z.string(),
//     thumbnail: z.object({
//       thumbnails: z.tuple([
//         z.object({
//           url: z.string(),
//         }),
//       ]),
//     }),
//     title: z.object({
//       runs: z.tuple([
//         z.object({
//           text: z.string(),
//         }),
//       ]),
//     }),
//     viewCountText: z.object({
//       simpleText: z.string(),
//     }),
//     lengthText: z.object({
//       simpleText: z.string(),
//     }),
//   }),
// });

// const continuationItemRendererSchema = z.object({
//   continuationItemRenderer: z.object({
//     continuationEndpoint: z.object({
//       continuationCommand: z.object({
//         token: z.string(),
//       }),
//     }),
//   }),
// });

// export class ChannelVideosExtractor {
//   getChannelVideos(
//     youtubeDataObject: unknown
//   ): Result<{ videos: ChannelVideo[]; token: Token }, ValidationError> {
//     const resultVideos: ChannelVideo[] = [];
//     let resultToken: Token = "";

//     const youtubeDataObjectParseResult =
//       youtubeDataObjectSchema.safeParse(youtubeDataObject);

//     if (!youtubeDataObjectParseResult.success) {
//       return Failure(new ValidationError(youtubeDataObjectParseResult.error));
//     }

//     const tabs =
//       youtubeDataObjectParseResult.data.contents.twoColumnBrowseResultsRenderer
//         .tabs;

//     let videoTab: z.infer<typeof videoTabSchema> | undefined;

//     for (const tab of tabs) {
//       const tabParseResult = videoTabSchema.safeParse(tab);
//       if (tabParseResult.success) {
//         videoTab = tabParseResult.data;
//         break;
//       }
//     }

//     if (!videoTab) {
//       return Failure(new ValidationError("Could not find the video tab"));
//     }

//     const videoContents =
//       videoTab.tabRenderer.content.richGridRenderer.contents;

//     for (const videoContent of videoContents) {
//       const videoContentParseResult =
//         videoContentSchema.safeParse(videoContent);

//       if (videoContentParseResult.error) {
//         return Failure(new ValidationError(videoContentParseResult.error));
//       }

//       const videoContentValue = videoContentParseResult.data.richItemRenderer;

//       const videoRendererParseResult = videoRendererSchema.safeParse(
//         videoContentValue.content
//       );

//       if (videoRendererParseResult.success) {
//         const videoRenderer = videoRendererParseResult.data.videoRenderer;

//         resultVideos.push({
//           id: videoRenderer.videoId,
//           thumbnail: videoRenderer.thumbnail.thumbnails[0].url,
//           title: videoRenderer.title.runs[0].text,
//           viewCount: videoRenderer.viewCountText.simpleText,
//           duration: videoRenderer.lengthText.simpleText,
//         });

//         continue;
//       }

//       const tokenRendererParseResult = continuationItemRendererSchema.safeParse(
//         videoContentValue.content
//       );

//       if (tokenRendererParseResult.success) {
//         const tokenRenderer =
//           tokenRendererParseResult.data.continuationItemRenderer;

//         resultToken =
//           tokenRenderer.continuationEndpoint.continuationCommand.token;

//         continue;
//       }

//       return Failure(
//         new ValidationError({
//           message: "Error while iterating over 'videoContents'",
//           error: videoRendererParseResult.error,
//         })
//       );
//     }

//     return Success({ videos: resultVideos, token: resultToken });
//   }
// }

// export const channelVideosExtractor = new ChannelVideosExtractor();
