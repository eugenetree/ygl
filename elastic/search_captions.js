// Elasticsearch search queries for caption search

// Search with phrase matching allowing words in between (slop)
export function searchWithSlop(searchPhrase, maxSlop = 5) {
  return {
    query: {
      bool: {
        should: [
          // Exact phrase match (highest score)
          {
            match_phrase: {
              "caption.text": {
                query: searchPhrase,
                boost: 3,
              },
            },
          },
          // Phrase match with slop (allows words in between)
          {
            match_phrase: {
              "caption.text": {
                query: searchPhrase,
                slop: maxSlop,
                boost: 2,
              },
            },
          },
          // Shingle match for better phrase detection
          {
            match: {
              "caption.text.shingles": {
                query: searchPhrase,
                boost: 1.5,
              },
            },
          },
          // All terms must be present but in any order
          {
            match: {
              "caption.text": {
                query: searchPhrase,
                operator: "and",
                boost: 1,
              },
            },
          },
        ],
        minimum_should_match: 1,
      },
    },
    highlight: {
      fields: {
        "caption.text": {
          fragment_size: 150,
          number_of_fragments: 3,
          pre_tags: ["<mark>"],
          post_tags: ["</mark>"],
        },
      },
    },
    _source: [
      "video_id",
      "video_title",
      "caption.start_time",
      "caption.end_time",
      "caption.text",
    ],
    size: 20,
  };
}

// Advanced search using nested query for exact word positions
export function searchWithWordPositions(searchWords) {
  const words = searchWords
    .toLowerCase()
    .split(" ")
    .filter((w) => w);

  return {
    query: {
      bool: {
        must: [
          // All words must exist in the caption
          ...words.map((word) => ({
            nested: {
              path: "caption.words",
              query: {
                match: {
                  "caption.words.text": word,
                },
              },
            },
          })),
        ],
        should: [
          // Boost if words appear in order
          {
            nested: {
              path: "caption.words",
              query: {
                script_score: {
                  query: { match_all: {} },
                  script: {
                    source: `
                      // Check if search words appear in order with reasonable gaps
                      def positions = [];
                      for (word in params.words) {
                        for (doc_word in params._source.caption.words) {
                          if (doc_word.text == word) {
                            positions.add(doc_word.position);
                            break;
                          }
                        }
                      }
                      
                      if (positions.size() != params.words.size()) {
                        return 0;
                      }
                      
                      // Check if positions are in ascending order
                      def isOrdered = true;
                      for (int i = 1; i < positions.size(); i++) {
                        if (positions[i] <= positions[i-1]) {
                          isOrdered = false;
                          break;
                        }
                      }
                      
                      if (!isOrdered) return 0.5;
                      
                      // Calculate score based on word proximity
                      def totalGap = 0;
                      for (int i = 1; i < positions.size(); i++) {
                        totalGap += (positions[i] - positions[i-1] - 1);
                      }
                      
                      return 1.0 / (1.0 + totalGap * 0.1);
                    `,
                    params: {
                      words: words,
                    },
                  },
                },
              },
            },
          },
        ],
      },
    },
    _source: ["video_id", "video_title", "caption"],
    size: 20,
  };
}

// Get exact timestamp for first matching word
export function getExactTimestamp(searchPhrase, captionWords) {
  const searchWords = searchPhrase
    .toLowerCase()
    .split(" ")
    .filter((w) => w);

  // Find the first occurrence of the search phrase
  for (let i = 0; i < captionWords.length; i++) {
    let matchCount = 0;
    let firstMatchIndex = -1;

    // Check if we can match all words starting from position i
    for (
      let j = 0;
      j < searchWords.length && i + j < captionWords.length;
      j++
    ) {
      for (let k = 0; k < searchWords.length; k++) {
        if (captionWords[i + j].text === searchWords[k]) {
          if (firstMatchIndex === -1) firstMatchIndex = i + j;
          matchCount++;
          break;
        }
      }
    }

    // If we found all words, return the timestamp of the first word
    if (matchCount === searchWords.length && firstMatchIndex !== -1) {
      return captionWords[firstMatchIndex].absolute_time;
    }
  }

  // Fallback: return timestamp of first matching word
  for (const word of captionWords) {
    if (searchWords.includes(word.text)) {
      return word.absolute_time;
    }
  }

  return null;
}

// Format search results for display
export function formatSearchResults(elasticsearchResponse, searchPhrase) {
  // Add comprehensive logging for debugging
  if (!elasticsearchResponse) {
    console.error(
      "formatSearchResults: elasticsearchResponse is null/undefined",
    );
    return [];
  }

  // Log the response structure for debugging
  console.log("formatSearchResults response structure:", {
    hasHits: !!elasticsearchResponse.hits,
    hasBody: !!elasticsearchResponse.body,
    responseKeys: Object.keys(elasticsearchResponse),
    // Log first 200 chars of stringified response
    responsePreview: JSON.stringify(elasticsearchResponse).substring(0, 200),
  });

  // Handle different response structures more defensively
  let hits = [];

  if (elasticsearchResponse.hits?.hits) {
    hits = elasticsearchResponse.hits.hits;
  } else if (elasticsearchResponse.body?.hits?.hits) {
    hits = elasticsearchResponse.body.hits.hits;
  } else if (Array.isArray(elasticsearchResponse)) {
    // In case the response is already the hits array
    hits = elasticsearchResponse;
  }

  if (!hits || hits.length === 0) {
    console.log("formatSearchResults: No hits found");
    return [];
  }

  return hits.map((hit) => {
    const caption = hit._source.caption;
    const exactTime = caption.words
      ? getExactTimestamp(searchPhrase, caption.words)
      : caption.start_time;

    return {
      videoId: hit._source.video_id,
      videoTitle: hit._source.video_title,
      startTime: caption.start_time,
      endTime: caption.end_time,
      exactTime: exactTime || caption.start_time,
      text: caption.text,
      highlight: hit.highlight ? hit.highlight["caption.text"] : [caption.text],
      score: hit._score,
    };
  });
}
