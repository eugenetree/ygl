export const countryCodeToNameMap = {
  UA: "Ukraine",
  US: "United States",
} as const;

export const countryNameToCodeMap = {
  Ukraine: "UA",
  "United States": "US",
} as const;

export type CountryCode = keyof typeof countryCodeToNameMap;
export type CountryName = keyof typeof countryNameToCodeMap;

export const languageCodeToNameMap = {
  EN: "English",
  UA: "Ukrainian",
} as const;

export const languageNameToCodeMap = {
  English: "EN",
  Ukrainian: "UA",
} as const;

export type LanguageCode = keyof typeof languageCodeToNameMap;
export type LanguageName = keyof typeof languageNameToCodeMap;
