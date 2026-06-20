import { ScraperName } from "../constants.js";

export type ScraperConfig = {
  instanceId: string;
  scraperName: ScraperName;
  enabled: boolean;
};
