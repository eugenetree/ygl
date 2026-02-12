"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.captionsExtractor = void 0;
var zod_1 = require("zod");
var index_js_1 = require("../../../types/index.js");
var jsonSchema = zod_1.z.object({
    events: zod_1.z.array(zod_1.z.unknown()),
});
var eventSchema = zod_1.z.object({
    tStartMs: zod_1.z.number(),
    dDurationMs: zod_1.z.number(),
    segs: zod_1.z.array(zod_1.z.object({
        utf8: zod_1.z.string().refine(function (value) { return value !== "\n"; }),
        tOffsetMs: zod_1.z.number().optional(), // optional as youtube returs no field for 0 offset
    })),
});
var CaptionsExtractor = /** @class */ (function () {
    function CaptionsExtractor() {
    }
    CaptionsExtractor.prototype.extractFromJson = function (_a) {
        var jsonResponse = _a.jsonResponse;
        var resultCaptions = [];
        var jsonParseResult = jsonSchema.safeParse(jsonResponse);
        if (!jsonParseResult.success) {
            return (0, index_js_1.Failure)({
                type: "VALIDATION_ERROR",
                cause: jsonParseResult.error,
            });
        }
        for (var _i = 0, _b = jsonParseResult.data.events; _i < _b.length; _i++) {
            var event_1 = _b[_i];
            var eventParseResult = eventSchema.safeParse(event_1);
            if (!eventParseResult.success) {
                continue;
            }
            var _c = eventParseResult.data, tStartMs = _c.tStartMs, dDurationMs = _c.dDurationMs, segs = _c.segs;
            var caption = {
                startTime: tStartMs,
                endTime: tStartMs + dDurationMs,
                duration: dDurationMs,
                textSegments: segs.map(function (seg) {
                    var _a;
                    return ({
                        utf8: seg.utf8,
                        offsetTime: (_a = seg.tOffsetMs) !== null && _a !== void 0 ? _a : 0,
                    });
                }),
            };
            resultCaptions.push(caption);
        }
        return (0, index_js_1.Success)(resultCaptions);
    };
    return CaptionsExtractor;
}());
exports.captionsExtractor = new CaptionsExtractor();
