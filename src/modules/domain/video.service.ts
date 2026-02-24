import { injectable } from "inversify";

import { Logger } from "../_common/logger/logger.js";
import { Video } from "./video.js";

@injectable()
export class VideoService {
  constructor(private readonly logger: Logger) { }

  create(params: Omit<Video, "createdAt" | "updatedAt">): Video {
    const currentDate = new Date();

    return {
      createdAt: currentDate,
      updatedAt: currentDate,
      ...params,
    }
  }
}