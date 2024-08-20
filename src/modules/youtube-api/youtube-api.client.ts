import fs from "fs";
import { youtubePageParser } from "./youtube-parse.service";
import { ChannelInfo, VideoInfo } from "./youtube-api.types";
import { CountryCode, CountryName, countryNameToCodeMap } from "../i18n";
import { Failure, Result, Success } from "../../types";
import { YoutubeApiClientError } from "./youtube-api.errors";
import { channelInfoExtractor } from "./extractors/channel-info.extractor";
import { channelVideosExtractor } from "./extractors/channel-videos.extractor";

class YoutubeApiClient {
  // async searchVideos(query: string) {
  //   const url = encodeURI(
  //     `https://www.youtube.com/results?search_query=${query}&sp=EgIQAQ%253D%253D`
  //   );

  //   const response = await fetch(url).then((res) => res.text());
  //   const data = youtubePageParser.getDataObjectFromHtml(response);

  //   if (data == null) {
  //     return;
  //   }

  //   const videos =
  //     data.contents.twoColumnSearchResultsRenderer.primaryContents.sectionListRenderer.contents[0]
  //       .itemSectionRenderer.contents;

  //   return;
  // }

  public async getChannelVideos(
    channelId: string
    // @ts-ignore
  ): Promise<Result<VideoInfo[], YoutubeApiClientError>> {
    const url = encodeURI(`https://youtube.com/channel/${channelId}/videos`);

    const response = await fetch(url).then((res) => res.text());

    const pageResult = youtubePageParser.getDataObjectFromHtml(response);
    if (!pageResult.ok) {
      return Failure(new YoutubeApiClientError(`pageResult is not ok`));
    }

    const videosResult = channelVideosExtractor.getChannelVideos(
      pageResult.value
    );
    if (!videosResult.ok) {
      return Failure(videosResult.error);
    }

    // @ts-ignore
    return Success(videosResult.value);
    // return Success(videosResult.value);
  }

  private getVideosTabRenderer(pageData: any): any {
    const tabsList = pageData?.contents?.twoColumnBrowseResultsRenderer;
    tabsList?.find((tab: any) => tab.tabRenderer.title === "Videos");
  }

  public async getChannelInfo(
    channelId: string
  ): Promise<Result<ChannelInfo, YoutubeApiClientError>> {
    const url = encodeURI(`https://youtube.com/channel/${channelId}/about`);

    const response = await fetch(url).then((res) => res.text());
    const pageResult = youtubePageParser.getDataObjectFromHtml(response);

    if (!pageResult.ok) {
      return Failure(new YoutubeApiClientError(`pageResult is not ok`));
    }

    const pageData = pageResult.value;

    const channelResult = channelInfoExtractor.getChannelInfo(pageData);

    if (!channelResult.ok) {
      return Failure(new YoutubeApiClientError(`channelResult is not ok`));
    }

    const rawChannelInfo = channelResult.value;

    const result = {
      id: rawChannelInfo.id,
      name: rawChannelInfo.name,
      description: rawChannelInfo.description,
      thumbnail: rawChannelInfo.thumbnail,
      keywords: rawChannelInfo.keywords?.split(" ") || [],
      subscriberCount: this.processSubscriberCount(
        rawChannelInfo.subscriberCount
      ),
      videoCount: this.processVideoCount(rawChannelInfo.videoCount),
      viewCount: this.processViewCount(rawChannelInfo.viewCount),
      countryCode: rawChannelInfo.countryName
        ? this.processCountryCode(rawChannelInfo.countryName)
        : undefined,
    };

    if (!this.isChannelResultValid(result)) {
      return Failure(
        new YoutubeApiClientError(
          `Error while processing channel info, some of the values are missing. ${JSON.stringify(
            result
          )}`
        )
      );
    }

    return Success(result);
  }

  private processSubscriberCount(subscriberCount: string): number | null {
    return 0;
  }

  private processViewCount(viewCount: string): number | null {
    const parsedValue = parseInt(viewCount.replace(/,/g, ""));
    return isNaN(parsedValue) ? null : parsedValue;
  }

  private processVideoCount(videoCount: string): number | null {
    const parsedValue = parseInt(videoCount.replace(/,/g, ""));
    return isNaN(parsedValue) ? null : parsedValue;
  }

  private processCountryCode(countryName: string): CountryCode | null {
    return this.isValidCountryName(countryName)
      ? countryNameToCodeMap[countryName]
      : null;
  }

  private isValidCountryName(countryName: string): countryName is CountryName {
    return countryName in countryNameToCodeMap;
  }

  private isChannelResultValid(
    result: Record<string, unknown>
  ): result is ChannelInfo {
    const valuesToCheck = [
      result.id,
      result.name,
      result.keywords,
      result.subscriberCount,
      result.viewCount,
      result.videoCount,
      result.countryCode,
    ];

    return valuesToCheck.every(
      (value) => value !== null && value !== undefined
    );
  }
}

export const youtubeApiClient = new YoutubeApiClient();
