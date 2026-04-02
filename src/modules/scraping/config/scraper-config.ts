import type { ScraperName } from "../constants.js";

export type ScraperConfig = {
  scraperName: ScraperName;
  enabled: boolean;
}

export type ScrapersConfig = {
  [key in ScraperName]: {
    enabled: boolean;
  }
}