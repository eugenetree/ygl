// Transform YouTube captions data for Elasticsearch

function transformCaptionsForElasticsearch(captionsData, videoId, videoTitle) {
  const documents = [];

  captionsData.captions.forEach((caption, captionIndex) => {
    // NEW: Extract full text directly from the first textSegment
    const captionText = caption.textSegments?.[0]?.utf8?.trim() || "";
    const wordsInCaption = captionText
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w);

    const words = [];
    let position = 0; // Position within this individual caption

    wordsInCaption.forEach((wordStr) => {
      words.push({
        text: wordStr,
        position: position,
        // offset_time is 0 relative to this caption's startTime
        // as we don't have per-word offsets in the new format
        offset_time: 0,
        absolute_time: caption.startTime, // All words in this segment get segment's startTime
      });
      position++;
    });

    const doc = {
      video_id: videoId,
      video_title: videoTitle,
      caption: {
        id: `${videoId}_${captionIndex}`,
        start_time: caption.startTime,
        end_time: caption.endTime,
        duration: caption.duration,
        text: captionText,
        words: words,
      },
    };

    documents.push(doc);
  });

  return documents;
}

// Example: Create documents that combine consecutive captions for better context
function createOverlappingDocuments(
  captionsData,
  videoId,
  videoTitle,
  windowSize = 3,
) {
  const documents = [];
  const originalCaptions = captionsData.captions;

  for (let i = 0; i < originalCaptions.length; i++) {
    const windowCaptionsDetails = []; // To store details of captions in the current window
    const allWordsInWindow = [];
    let fullTextForWindow = "";
    let currentPositionInWindow = 0;

    // Create a window of captions
    for (let j = 0; j < windowSize && i + j < originalCaptions.length; j++) {
      const currentOriginalCaption = originalCaptions[i + j];

      // NEW: Extract full text directly for the current original caption
      const singleCaptionText =
        currentOriginalCaption.textSegments?.[0]?.utf8?.trim() || "";
      windowCaptionsDetails.push({
        text: singleCaptionText,
        startTime: currentOriginalCaption.startTime,
        endTime: currentOriginalCaption.endTime,
        duration: currentOriginalCaption.duration,
      });

      fullTextForWindow += (fullTextForWindow ? " " : "") + singleCaptionText;

      // Split this single caption's text into words for the allWordsInWindow array
      const wordsInSingleCaption = singleCaptionText
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w);

      wordsInSingleCaption.forEach((wordStr) => {
        allWordsInWindow.push({
          text: wordStr,
          position: currentPositionInWindow,
          // offset_time is 0 relative to its original caption's startTime
          // absolute_time will be that original caption's startTime
          offset_time: 0,
          absolute_time: currentOriginalCaption.startTime,
        });
        currentPositionInWindow++;
      });
    }

    if (windowCaptionsDetails.length > 0) {
      const firstCaptionInWindow = windowCaptionsDetails[0];
      const lastCaptionInWindow =
        windowCaptionsDetails[windowCaptionsDetails.length - 1];

      const doc = {
        video_id: videoId,
        video_title: videoTitle,
        caption: {
          id: `${videoId}_window_${i}`,
          start_time: firstCaptionInWindow.startTime,
          end_time: lastCaptionInWindow.endTime,
          duration:
            lastCaptionInWindow.endTime - firstCaptionInWindow.startTime,
          text: fullTextForWindow.trim(), // Trim final full text
          words: allWordsInWindow,
        },
      };
      documents.push(doc);
    }
  }
  return documents;
}

export { transformCaptionsForElasticsearch, createOverlappingDocuments };
