import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  countWords,
  endsSentence,
  startsSentence,
} from "./caption-features.js";

describe("startsSentence()", () => {
  const cases: [string, boolean][] = [
    ["Strange.", true],
    ["of life.", false],
    ["- So is it a custom dish?", true],
    ["– So is it a custom dish?", true],
    ["— So is it?", true],
    ["every once in a while...", false],
    ['Is it "strange"?', true],
    ['"Strange," he said.', true],
    ["1990 was a good year.", true],
    ["iPhone sales went up.", false],
    ["...and then he left.", false],
    // A known limit until text clean-up: the speaker label's `[` is skipped as
    // an opening bracket.
    ["[Mary] one of Peter's favorite treats every once in a while.", true],
  ];

  for (const [text, expected] of cases) {
    it(`is ${expected} for ${JSON.stringify(text)}`, () => {
      assert.equal(startsSentence(text), expected);
    });
  }
});

describe("endsSentence()", () => {
  const cases: [string, boolean][] = [
    ["Strange.", true],
    ["of life.", true],
    ["- So is it a custom dish?", true],
    ["every once in a while...", false],
    ["every once in a while…", false],
    ['Is it "strange"?', true],
    ['"Strange," he said.', true],
    ['She said "no."', true],
    ["She said (no.)", true],
    ["Wait, what?!", true],
    ["Wait, what!?", true],
    ["Give up!", true],
    ["Strange,", false],
    ["you know;", false],
    ["as follows:", false],
    ["and then —", false],
    ["of life", false],
  ];

  for (const [text, expected] of cases) {
    it(`is ${expected} for ${JSON.stringify(text)}`, () => {
      assert.equal(endsSentence(text), expected);
    });
  }
});

describe("countWords()", () => {
  const cases: [string, number][] = [
    ["Strange.", 1],
    ["of life.", 2],
    ["- So is it a custom dish?", 6],
    ["every once in a while...", 5],
    ['Is it "strange"?', 3],
    ["it's", 1],
    ["1990 was a good year.", 5],
    ["♪ we were - you know - fine ♪", 5],
    [">> Strange. >> Yes.", 2],
    ["[Mary] one of Peter's favorite treats every once in a while.", 11],
    ["", 0],
  ];

  for (const [text, expected] of cases) {
    it(`is ${expected} for ${JSON.stringify(text)}`, () => {
      assert.equal(countWords(text), expected);
    });
  }
});

describe("features of captions with markup", () => {
  const cases: [
    string,
    { words: number; startsSentence: boolean; endsSentence: boolean },
  ][] = [
    [
      "<i>Strange\xA0things\xA0happen.</i>",
      { words: 3, startsSentence: true, endsSentence: true },
    ],
    [
      "<i>- So is it a custom dish?</i>",
      { words: 6, startsSentence: true, endsSentence: true },
    ],
    [
      '<font color="#ffff00">every once</font>\nin a while',
      { words: 5, startsSentence: false, endsSentence: false },
    ],
    [
      "Strange<br>things<br/>happen<br />here.",
      { words: 4, startsSentence: true, endsSentence: true },
    ],
    [
      "&quot;Strange,&quot; he said.",
      { words: 3, startsSentence: true, endsSentence: true },
    ],
    [
      "She said &quot;no.&quot;",
      { words: 3, startsSentence: true, endsSentence: true },
    ],
    [
      "&#39;Cause Tom &amp; Jerry &#x2014; that&#8217;s it.",
      { words: 5, startsSentence: true, endsSentence: true },
    ],
    [
      "&gt;&gt; strange.",
      { words: 1, startsSentence: false, endsSentence: true },
    ],
    [
      "\u{200B}Strange.\u{200B}",
      { words: 1, startsSentence: true, endsSentence: true },
    ],
    [
      "Strange &#99999999;",
      { words: 2, startsSentence: true, endsSentence: false },
    ],
  ];

  for (const [text, expected] of cases) {
    it(`are ${JSON.stringify(expected)} for ${JSON.stringify(text)}`, () => {
      assert.deepEqual(
        {
          words: countWords(text),
          startsSentence: startsSentence(text),
          endsSentence: endsSentence(text),
        },
        expected,
      );
    });
  }
});
