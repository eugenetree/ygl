import {
  any,
  array,
  flatten,
  includes,
  InferOutput,
  looseTuple,
  number,
  object,
  optional,
  parse,
  pipe,
  safeParse,
  string,
  tuple,
  union,
  unknown,
  value,
} from "valibot";

const schema = looseTuple([
  object({ x: pipe(string(), value("1")) }),
  object({ y: pipe(number(), value(2)) }),
]);

// const r = safeParse(schema, [{ x: 1 }, { x: "1" }, { x: "2" }, { x: 2 }]);
// console.log(JSON.stringify(r.issues, null, 2));

const YoutubeVideoSchema = object({
  richItemRenderer: object({
    content: object({
      videoRenderer: object({
        videoId: string(),
        thumbnail: object({
          thumbnails: array(object({ url: string() })),
        }),
        title: object({
          runs: array(object({ text: string() })),
        }),
        viewCountText: object({ simpleText: string() }),
        lengthText: object({ simpleText: string() }),
      }),
    }),
  }),
});

const video = {
  richItemRenderer: {
    content: {
      videoRenderer: {
        videoId: "123",
        thumbnail: {
          thumbnails: [{ url: 1 }],
        },
        title: {
          runs: [{ text: "text" }],
        },
        viewCountText: { simpleText: "simpleText" },
        lengthText: { simpleText: "simpleText" },
      },
    },
  },
};

const res = safeParse(YoutubeVideoSchema, video);
if (!res.success) {
  // console.log(JSON.stringify(res.issues, null, 2));
}

const z = require("zod");

const zVideoSchema = z.object({
  richItemRenderer: z.object({
    content: z.object({
      videoRenderer: z.object({
        videoId: z.string(),
        thumbnail: z.object({
          thumbnails: z.array(z.object({ url: z.string() })),
        }),
        title: z.object({
          runs: z.array(z.object({ text: z.string() })),
        }),
        viewCountText: z.object({ simpleText: z.string() }),
        lengthText: z.object({ simpleText: z.string() }),
      }),
    }),
  }),
});

const zRes = zVideoSchema.safeParse(video);
const zIssues = zRes.error;
console.log(JSON.stringify(zIssues, null, 2));
