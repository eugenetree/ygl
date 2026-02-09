import { z } from "zod";

// Schema for collaborative video channels
const collaboratorChannel = z.object({
  listItemViewModel: z.object({
    title: z.object({
      content: z.string(),
    }),
    rendererContext: z.object({
      commandContext: z.object({
        onTap: z.object({
          innertubeCommand: z.object({
            browseEndpoint: z.object({
              browseId: z.string(),
            }),
          }),
        }),
      }),
    }),
  }),
});

// Navigation endpoint can be EITHER single channel OR collaborative channels
const singleChannelNavigationEndpoint = z.object({
  browseEndpoint: z.object({
    browseId: z.string(),
    canonicalBaseUrl: z.string().optional(),
  }),
});

const collaborativeChannelNavigationEndpoint = z.object({
  showDialogCommand: z.object({
    panelLoadingStrategy: z.object({
      inlineContent: z.object({
        dialogViewModel: z.object({
          customContent: z.object({
            listViewModel: z.object({
              listItems: z.array(collaboratorChannel),
            }),
          }),
        }),
      }),
    }),
  }),
});

const videoRenderer = z.object({
  videoRenderer: z.object({
    videoId: z.string(),
    longBylineText: z
      .object({
        runs: z.tuple([
          z.object({
            text: z.string(),
            // Must have EITHER single channel OR collaborative channels
            navigationEndpoint: z.union([
              singleChannelNavigationEndpoint,
              collaborativeChannelNavigationEndpoint,
            ]),
          }),
        ]).rest(z.unknown()),
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
    contents: z.union([videoRenderer, messageRenderer]).array(),
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

const initialResponse = z.object({
  contents: z.object({
    twoColumnSearchResultsRenderer: z.object({
      primaryContents: z.object({
        sectionListRenderer: z.object({
          contents: z
            .union([itemSectionRenderer, continuationItemRenderer])
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
              continuationItemRenderer,
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
  videoRenderer,
  continuationItemRenderer,
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
