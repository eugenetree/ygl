import { z } from "zod";

const channelVideoSchema = z.object({
  id: z.string(),
  thumbnail: z.string().optional(),
  title: z.string(),
  duration: z.string(),
  viewCount: z.string(),
});

const tokenSchema = z.string().min(1);

const initialResponse = z.object({
  contents: z.object({
    twoColumnBrowseResultsRenderer: z.object({
      tabs: z.array(z.unknown()),
    }),
  }),
});

// const videoTab = z.object({
//   tabRenderer: z.object({
//     title: z.literal("Videos"),
//     content: z.object({
//       richGridRenderer: z.object({
//         contents: z.array(z.unknown()),
//       }),
//     }),
//   }),
// });

const videoContentSchema = z.object({
  richItemRenderer: z.object({
    content: z.array(z.unknown()),
  }),
});

const videoRendererSchema = z.object({
  videoRenderer: z.object({
    videoId: z.string(),
    thumbnail: z.object({
      thumbnails: z.tuple([
        z.object({
          url: z.string(),
        }),
      ]),
    }),
    title: z.object({
      runs: z.tuple([
        z.object({
          text: z.string(),
        }),
      ]),
    }),
    viewCountText: z.object({
      simpleText: z.string(),
    }),
    lengthText: z.object({
      simpleText: z.string(),
    }),
  }),
});

const continuationItemRendererSchema = z.object({
  continuationItemRenderer: z.object({
    continuationEndpoint: z.object({
      continuationCommand: z.object({
        token: z.string(),
      }),
    }),
  }),
});

const richItemRenderer = z.object({
  richItemRenderer: z.object({
    content: z.object({
      videoRenderer: z.object({
        videoId: z.string(),
        thumbnail: z.object({
          thumbnails: z.array(
            z.object({
              url: z.string(),
            }),
          ),
        }),
        title: z.object({
          runs: z.tuple([
            z.object({
              text: z.string(),
            }),
          ]),
        }),
        viewCountText: z
          .object({
            simpleText: z.string(),
          })
          .optional(),
        lengthText: z.object({
          simpleText: z.string(),
        }),
      }),
    }),
  }),
});

const continuationItemRenderer = z.object({
  continuationItemRenderer: z.object({
    continuationEndpoint: z.object({
      continuationCommand: z.object({
        token: z.string(),
      }),
    }),
  }),
});

const videoTab = z.object({
  tabRenderer: z.object({
    title: z.literal("Videos"),
    content: z.object({
      richGridRenderer: z.object({
        contents: z.union([richItemRenderer, continuationItemRenderer]).array(),
      }),
    }),
  }),
});

const jsonResponse = z.object({
  onResponseReceivedActions: z.tuple([
    z.object({
      appendContinuationItemsAction: z.object({
        continuationItems: z
          .union([richItemRenderer, continuationItemRenderer])
          .array(),
      }),
    }),
  ]),
});

export const inputSchemas = {
  initialResponse,
  videoTab,
  jsonResponse,
};

// TODO: check why for html and json different schemas are used
const result = z.object({
  videos: z.array(
    z.object({
      id: z.string(),
      thumbnail: z.string().optional(),
      title: z.string(),
      duration: z.number(),
      viewCount: z.number(),
    }),
  ),
  token: z.string().optional(),
});

export const outputSchemas = {
  result,
};
