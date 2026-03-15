import { injectable } from "inversify";
import { CaptionSegment } from "./caption-analysis.service.js";

@injectable()
export class CaptionCleanUpService {
  public normalizeCaption(caption: CaptionSegment): CaptionSegment {
    let text = caption.text;

    // Normalize newlines to spaces first
    text = text.replace(/\n/g, ' ');

    // Remove speaker markers (>>)
    text = text.replace(/^>>\s*/g, '');
    text = text.replace(/\s*>>\s*/g, ' ');

    // Remove speaker labels at start, after spaces, or after punctuation
    // Matches patterns like "Sapnap:", "George:", etc.
    // Only matches at word boundaries to avoid false positives like "3:30" or "http://"
    text = text.replace(/(^|[\s.!?])([A-Za-z][A-Za-z0-9_' -]{0,19}:\s*)/g, '$1');

    // Remove sound effects and descriptions in brackets/asterisks
    // Examples: [laughter], [music], *music*, *applause* etc
    text = text.replace(/\[.*?\]/g, '');
    text = text.replace(/\*[^*]+\*/g, '');

    // Remove special symbols
    text = text.replace(/[$%^&*@#~`+=|\\<>{}]/g, '');

    // Remove multiple spaces
    text = text.replace(/\s+/g, ' ');

    // Trim whitespace
    text = text.trim();

    return {
      ...caption,
      text
    };
  }

  public shouldKeepCaption(caption: CaptionSegment): boolean {
    const text = caption.text;

    // Remove empty captions
    if (!text || text.length === 0) {
      return false;
    }

    // Remove captions that are only punctuation or whitespace
    if (/^[.,!?;:\s-]+$/.test(text)) {
      return false;
    }

    // TODO: temporary disabled due to need of bigger captions database
    // Remove captions that are only single interjections
    // (e.g., "Oh", "Ah", "Um", "Hm")
    // if (/^(Oh|Ah|Um|Uh|Hm|Mm)[.,!?]?$/i.test(text)) {
    // return false;
    // }

    return true;
  }

  public mergeShortCaptions(captions: CaptionSegment[]): CaptionSegment[] {
    if (captions.length === 0) {
      return [];
    }

    const MAX_WORDS = 15;
    const MAX_DURATION_MS = 5000;

    const mergedCaptions: CaptionSegment[] = [];
    let currentCaption: CaptionSegment | null = null;
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