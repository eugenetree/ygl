export type Accent = "us" | "uk" | "au" | "ca";
export type Speed = "slow" | "normal" | "fast";

export interface MockResult {
  id: string;
  videoId: string;
  startAt: number;
  channel: string;
  title: string;
  speaker: string;
  accent: Accent;
  accentLabel: string;
  speed: Speed;
  durationAt: string;
  caption: string;
  matches: number;
  year: number;
}

export interface TranscriptLine {
  t: string;
  c: string;
  match?: boolean;
}

export interface PhraseSyllable {
  text: string;
  stress: 0 | 1 | 2;
}

export interface PhraseToken {
  word: string;
  syllables: PhraseSyllable[];
  linkTo?: "next";
}

export interface Phrase {
  phrase: string;
  ipa: string;
  tokens: PhraseToken[];
  partOfSpeech: string;
  register: string;
  frequency: string;
  definition: string;
  nearSynonyms: string[];
  commonPairings: string[];
  rhythm: string;
  notes: string;
  totalVideos: number;
  totalMatches: number;
}

export const MOCK_RESULTS: MockResult[] = [
  {
    id: "a1",
    videoId: "GS1gK4B_Otk",
    startAt: 222,
    channel: "The Morning Desk",
    title: "How we actually spend our weekends — unfiltered",
    speaker: "Nora Albright",
    accent: "us",
    accentLabel: "US · California",
    speed: "normal",
    durationAt: "3:42",
    caption: "i only call my parents <mark>once in a while</mark>, which i feel guilty about, honestly.",
    matches: 3,
    year: 2024,
  },
  {
    id: "b2",
    videoId: "GS1gK4B_Otk",
    startAt: 58,
    channel: "LingoLab Shorts",
    title: "English idioms you actually hear in conversation",
    speaker: "Daniel Ó Conaill",
    accent: "uk",
    accentLabel: "UK · Dublin-ish",
    speed: "slow",
    durationAt: "0:58",
    caption: 'you\'ll hear "<mark>once in a while</mark>" far more often than "occasionally" in real speech.',
    matches: 1,
    year: 2025,
  },
  {
    id: "c3",
    videoId: "GS1gK4B_Otk",
    startAt: 728,
    channel: "Field Notes",
    title: "A week tracking brush-tailed possums in Tasmania",
    speaker: "Mira Halcombe",
    accent: "au",
    accentLabel: "AU · Hobart",
    speed: "normal",
    durationAt: "12:08",
    caption: "<mark>once in a while</mark> we'd spot one moving across the fence line, but mostly it was quiet.",
    matches: 2,
    year: 2023,
  },
  {
    id: "d4",
    videoId: "GS1gK4B_Otk",
    startAt: 441,
    channel: "Dr. Paulo Reyes",
    title: "Why your sleep schedule shifts on weekends",
    speaker: "Paulo Reyes",
    accent: "us",
    accentLabel: "US · New York",
    speed: "fast",
    durationAt: "7:21",
    caption: "skipping a nap <mark>once in a while</mark> is completely fine. doing it every day is not.",
    matches: 4,
    year: 2025,
  },
  {
    id: "e5",
    videoId: "GS1gK4B_Otk",
    startAt: 134,
    channel: "kitchen table",
    title: "my grandmother's coffee ritual",
    speaker: "Anaïs Petit",
    accent: "ca",
    accentLabel: "CA · Montréal",
    speed: "slow",
    durationAt: "2:14",
    caption: "she still grinds her own beans — <mark>once in a while</mark>, when she has the time.",
    matches: 1,
    year: 2024,
  },
  {
    id: "f6",
    videoId: "GS1gK4B_Otk",
    startAt: 1113,
    channel: "Built It Twice",
    title: "Rebuilding a 1973 Bedford truck — part 4",
    speaker: "Rhys Llewellyn",
    accent: "uk",
    accentLabel: "UK · Cardiff",
    speed: "normal",
    durationAt: "18:33",
    caption: "you'll get a seized bolt <mark>once in a while</mark>, and that's when patience matters most.",
    matches: 2,
    year: 2024,
  },
  {
    id: "g7",
    videoId: "GS1gK4B_Otk",
    startAt: 1370,
    channel: "Plain Talk Interviews",
    title: "A conversation with novelist Esme Ortega",
    speaker: "Esme Ortega",
    accent: "us",
    accentLabel: "US · Texas",
    speed: "normal",
    durationAt: "22:50",
    caption: "i reread my first book <mark>once in a while</mark> — mostly to remind myself how far i've come.",
    matches: 1,
    year: 2025,
  },
  {
    id: "h8",
    videoId: "GS1gK4B_Otk",
    startAt: 544,
    channel: "Commute Notes",
    title: "Cycling the length of the Thames path",
    speaker: "Harriet Okafor",
    accent: "uk",
    accentLabel: "UK · London",
    speed: "fast",
    durationAt: "9:04",
    caption: "it rains <mark>once in a while</mark>, which, frankly, is putting it generously.",
    matches: 2,
    year: 2024,
  },
];

export const MOCK_TRANSCRIPT: TranscriptLine[] = [
  { t: "3:28", c: "i think the honest answer is that my routine has gotten looser over time." },
  { t: "3:33", c: "like, genuinely looser — not in a bad way, just less structured." },
  { t: "3:38", c: "i used to call my sister every sunday without fail." },
  { t: "3:42", c: "i only call my parents <mark>once in a while</mark>, which i feel guilty about, honestly.", match: true },
  { t: "3:49", c: "but they know i love them, and we text a lot, so it's not like we're out of touch." },
  { t: "3:55", c: "and <mark>once in a while</mark> my dad will send me a photo of his garden, completely out of nowhere.", match: true },
  { t: "4:03", c: "which — i mean, that's the whole relationship right there, in one photo." },
  { t: "4:09", c: "anyway. weekends. we were talking about weekends." },
  { t: "4:14", c: "saturdays are usually slower. i try not to schedule anything before eleven." },
  { t: "4:21", c: "<mark>once in a while</mark> i'll make pancakes, but mostly it's just coffee and a book.", match: true },
  { t: "4:28", c: "sundays are for laundry. that's not a personality trait, that's just reality." },
];

export const MOCK_PHRASE: Phrase = {
  phrase: "once in a while",
  ipa: "/wʌns ɪn ə ˈwaɪl/",
  tokens: [
    { word: "once", syllables: [{ text: "once", stress: 1 }] },
    { word: "in", syllables: [{ text: "in", stress: 0 }], linkTo: "next" },
    { word: "a", syllables: [{ text: "a", stress: 0 }], linkTo: "next" },
    { word: "while", syllables: [{ text: "while", stress: 1 }] },
  ],
  partOfSpeech: "adverbial phrase",
  register: "informal / very common",
  frequency: "top 2% of spoken English",
  definition: "Occasionally; not often, but now and then.",
  nearSynonyms: ["occasionally", "every so often", "from time to time", "now and then"],
  commonPairings: ["I {phrase} like to …", "{phrase}, you'll find …", "… but {phrase} it happens."],
  rhythm: "DA-da-da-DA  (trochaic)",
  notes: "The 'in a' collapses into a quick 'nə' in natural speech: 'once-nə-while'.",
  totalVideos: 84,
  totalMatches: 127,
};

export const EXAMPLE_PHRASES: string[] = [
  "once in a while",
  "long story short",
  "at the end of the day",
  "to be fair",
  "no worries",
  "I reckon",
];

export interface WallClip {
  id: string;
  phrase: string;
  caption: string;
  speaker: string;
  accent: Accent;
  accentShort: string;
}

export const WALL_CLIPS: WallClip[] = [
  {
    id: "w1",
    phrase: "once in a while",
    caption: "i only call my parents <mark>once in a while</mark>, which i feel guilty about.",
    speaker: "Nora Albright",
    accent: "us",
    accentShort: "US",
  },
  {
    id: "w2",
    phrase: "long story short",
    caption: "<mark>long story short</mark>, we missed the last train and ended up walking home.",
    speaker: "Daniel Ó Conaill",
    accent: "uk",
    accentShort: "UK",
  },
  {
    id: "w3",
    phrase: "at the end of the day",
    caption: "<mark>at the end of the day</mark>, you just want someone to pick up the phone.",
    speaker: "Mira Halcombe",
    accent: "au",
    accentShort: "AU",
  },
  {
    id: "w4",
    phrase: "to be fair",
    caption: "<mark>to be fair</mark>, i hadn't actually read the email before replying.",
    speaker: "Priya Jessal",
    accent: "uk",
    accentShort: "UK",
  },
  {
    id: "w5",
    phrase: "no worries",
    caption: "yeah <mark>no worries</mark>, take your time — we're not in a rush or anything.",
    speaker: "Jack Henbury",
    accent: "au",
    accentShort: "AU",
  },
  {
    id: "w6",
    phrase: "I reckon",
    caption: "<mark>i reckon</mark> it's closer to twenty minutes than ten, honestly.",
    speaker: "Olivia Tench",
    accent: "au",
    accentShort: "AU",
  },
  {
    id: "w7",
    phrase: "for sure",
    caption: "oh <mark>for sure</mark> — she's probably the best hire we made last year.",
    speaker: "Marcus Lin",
    accent: "us",
    accentShort: "US",
  },
  {
    id: "w8",
    phrase: "kind of",
    caption: "it was <mark>kind of</mark> the whole reason we moved out here in the first place.",
    speaker: "Sasha Bell",
    accent: "ca",
    accentShort: "CA",
  },
  {
    id: "w9",
    phrase: "on the nose",
    caption: "and the casting was just — <mark>on the nose</mark>, you know? too perfect.",
    speaker: "Rufus Okafor",
    accent: "uk",
    accentShort: "UK",
  },
  {
    id: "w10",
    phrase: "give or take",
    caption: "about forty minutes <mark>give or take</mark>, depending on traffic.",
    speaker: "Hana Weiss",
    accent: "us",
    accentShort: "US",
  },
  {
    id: "w11",
    phrase: "nine times out of ten",
    caption: "<mark>nine times out of ten</mark> the first answer you think of is the right one.",
    speaker: "Eliot Barnard",
    accent: "uk",
    accentShort: "UK",
  },
  {
    id: "w12",
    phrase: "up for grabs",
    caption: "the last two tickets are still <mark>up for grabs</mark> if anyone's keen.",
    speaker: "Tom Priddy",
    accent: "au",
    accentShort: "AU",
  },
];
