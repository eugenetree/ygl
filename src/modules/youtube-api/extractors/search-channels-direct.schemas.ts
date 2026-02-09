import { z } from "zod";

const channelRenderer = z.object({
  channelRenderer: z.object({
    channelId: z.string(),
    title: z.object({
      simpleText: z.string(),
    }),
    videoCountText: z
      .object({
        simpleText: z.string().optional(),
      })
      .optional(),
  }),
});

const messageRenderer = z.object({
  messageRenderer: z.object({
    text: z.object({
      runs: z.tuple([z.object({ text: z.literal("No more results") })]),
    }),
  }),
});

const itemSectionRenderer = z.object({
  itemSectionRenderer: z.object({
    contents: z.array(z.unknown()),
  }),
});

const itemSectionRendererWithNoResultsOption = z.object({
  itemSectionRenderer: z.object({
    contents: z.union([channelRenderer, messageRenderer]).array(),
  }),
});

const contituationItemRenderer = z.object({
  continuationItemRenderer: z.object({
    continuationEndpoint: z.object({
      continuationCommand: z.object({
        token: z.string(),
      }),
    }),
  }),
});

const initialResponse = z.object({
  contents: z.object({
    twoColumnSearchResultsRenderer: z.object({
      primaryContents: z.object({
        sectionListRenderer: z.object({
          contents: z
            .union([itemSectionRenderer, contituationItemRenderer])
            .array(),
        }),
      }),
    }),
  }),
});

const jsonResponse = z.object({
  onResponseReceivedCommands: z
    .tuple([
      z.object({
        appendContinuationItemsAction: z.object({
          continuationItems: z
            .union([
              itemSectionRendererWithNoResultsOption,
              contituationItemRenderer,
            ])
            .array(),
        }),
      }),
    ])
    .rest(z.unknown()),
});

export const inputSchemas = {
  initialResponse,
  jsonResponse,
  itemSectionRenderer,
  channelRenderer,
  contituationItemRenderer,
};

const result = z.object({
  channels: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      subscriberCount: z.number().optional(),
    }),
  ),
  token: z.string().optional(),
});

export const outputSchemas = {
  result,
};
