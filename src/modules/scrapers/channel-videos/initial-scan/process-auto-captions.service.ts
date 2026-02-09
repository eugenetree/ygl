import { Logger } from "../../../_common/logger/logger.js";
import { Caption } from "../../../youtube-api/youtube-api.types.js";

export class ProcessAutoCaptionsService {
  constructor(private readonly logger: Logger) { }

  async process(captions: Caption[]): Promise<Caption[]> {
    let resultCaptions: Caption[] = [];
    // Normalize caption timings (fix overlapping captions)
    resultCaptions = this.fixOverlappingTimestamps(captions);

    // Normalize individual captions (remove noise, but keep all captions)
    resultCaptions = resultCaptions.map(caption => this.normalizeCaption(caption));

    // Merge short segments into longer ones (15 words, 5 seconds)
    resultCaptions = this.mergeShortCaptions(resultCaptions);

    // Filter out empty/meaningless captions after merging
    resultCaptions = resultCaptions.filter(caption => this.shouldKeepCaption(caption));

    return resultCaptions;
  }

  private fixOverlappingTimestamps(captions: Caption[]): Caption[] {
    const resultCaptions: Caption[] = [];

    for (let i = 0; i < captions.length; i++) {
      const currentCaption = captions[i];
      const nextCaption = captions[i + 1];

      if (nextCaption && currentCaption.endTime > nextCaption.startTime) {
        currentCaption.endTime = nextCaption.startTime;
        currentCaption.duration = currentCaption.endTime - currentCaption.startTime;
      }

      resultCaptions.push(currentCaption);
    }

    return resultCaptions;
  }


  private normalizeCaption(caption: Caption): Caption {
    let text = caption.text;

    // Remove speaker markers (>>)
    text = text.replace(/^>>\s*/g, '');
    text = text.replace(/\s*>>\s*/g, ' ');

    // Remove sound effects and descriptions in brackets
    // Examples: [laughter], [music] etc
    text = text.replace(/\[.*?\]/g, '');

    // Remove multiple spaces
    text = text.replace(/\s+/g, ' ');

    // Trim whitespace
    text = text.trim();

    return {
      ...caption,
      text
    };
  }

  private shouldKeepCaption(caption: Caption): boolean {
    const text = caption.text;

    // Remove empty captions
    if (!text || text.length === 0) {
      return false;
    }

    // Remove captions that are only punctuation or whitespace
    if (/^[.,!?;:\s-]+$/.test(text)) {
      return false;
    }

    // Remove captions that are only single interjections
    // (e.g., "Oh", "Ah", "Um", "Hm")
    if (/^(Oh|Ah|Um|Uh|Hm|Mm)[.,!?]?$/i.test(text)) {
      return false;
    }

    return true;
  }

  private mergeShortCaptions(captions: Caption[]): Caption[] {
    if (captions.length === 0) {
      return [];
    }

    const MAX_WORDS = 15;
    const MAX_DURATION_MS = 5000;

    const mergedCaptions: Caption[] = [];
    let currentCaption: Caption | null = null;
    let currentWordCount = 0;

    for (const caption of captions) {
      const wordCount = this.countWords(caption.text);

      if (!currentCaption) {
        // Start a new segment
        currentCaption = { ...caption };
        currentWordCount = wordCount;
      } else {
        const combinedWordCount = currentWordCount + wordCount;
        const combinedDuration: number = caption.endTime - currentCaption.startTime;

        // Keep merging until next merge would exceed either limit
        const wouldExceedLimits =
          combinedWordCount > MAX_WORDS ||
          combinedDuration > MAX_DURATION_MS;

        if (!wouldExceedLimits) {
          // Merge: combine texts and extend timing
          currentCaption = {
            startTime: currentCaption.startTime,
            endTime: caption.endTime,
            duration: combinedDuration,
            text: this.combineTexts(currentCaption.text, caption.text)
          };

          currentWordCount = combinedWordCount;
        } else {
          // Can't merge anymore, save current and start new caption
          mergedCaptions.push(currentCaption);
          currentCaption = { ...caption };
          currentWordCount = wordCount;
        }
      }
    }

    // Don't forget the last segment
    if (currentCaption) {
      mergedCaptions.push(currentCaption);
    }

    return mergedCaptions;
  }

  private countWords(text: string): number {
    return text.trim().split(/\s+/).filter(word => word.length > 0).length;
  }

  private combineTexts(text1: string, text2: string): string {
    // Smart text combination
    const trimmed1 = text1.trim();
    const trimmed2 = text2.trim();

    // If first text ends with punctuation, just add a space
    if (/[.!?]$/.test(trimmed1)) {
      return `${trimmed1} ${trimmed2}`;
    }

    // If first text ends with comma, keep it
    if (/,$/.test(trimmed1)) {
      return `${trimmed1} ${trimmed2}`;
    }

    // If second text starts with punctuation, no space needed
    if (/^[.,!?;:]/.test(trimmed2)) {
      return `${trimmed1}${trimmed2}`;
    }

    // Default: add a space
    return `${trimmed1} ${trimmed2}`;
  }
}