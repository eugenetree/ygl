import { Kysely, sql } from "kysely";

// The extractor used to store the last word of each auto caption line as ending
// at `2 × line start + duration`. YouTube's lines aren't stored, but the first
// word of a line is the only one without a leading space, so a word's line
// start is recoverable: `stored end − line start` is the line's real end
// wherever it is at least the word's start. Overlapping lines repeat words with
// identical times, which can put a line start between a word and its own line
// start, so up to 4 recent line starts are tried, nearest first. Looking further
// back reaches lines in the video's first second, which "fit" any word.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    WITH ordered AS (
      SELECT
        id,
        video_id,
        start_time,
        end_time,
        row_number() OVER w AS row_no,
        left(text, 1) <> ' ' OR row_number() OVER w = 1 AS is_line_start,
        lead(start_time) OVER w AS next_start,
        lead(end_time) OVER w AS next_end,
        lead(left(text, 1) <> ' ') OVER w AS next_is_line_start,
        first_value(start_time) OVER (
          PARTITION BY video_id
          ORDER BY start_time
          RANGE BETWEEN 1 FOLLOWING AND UNBOUNDED FOLLOWING
        ) AS next_later_start
      FROM captions
      WHERE type = 'auto'
      WINDOW w AS (PARTITION BY video_id ORDER BY start_time, ctid)
    ),
    numbered AS (
      SELECT
        *,
        count(*) FILTER (WHERE is_line_start) OVER (
          PARTITION BY video_id ORDER BY row_no
        ) AS line_no
      FROM ordered
    ),
    line_starts AS (
      SELECT
        video_id,
        line_no,
        start_time AS start0,
        lag(start_time, 1) OVER l AS start1,
        lag(start_time, 2) OVER l AS start2,
        lag(start_time, 3) OVER l AS start3
      FROM numbered
      WHERE is_line_start
      WINDOW l AS (PARTITION BY video_id ORDER BY line_no)
    ),
    possible_last_words AS (
      SELECT
        n.id,
        n.start_time,
        n.end_time,
        n.next_start,
        n.next_end,
        n.next_later_start,
        n.next_is_line_start,
        CASE
          WHEN n.end_time - s.start0 >= n.start_time THEN n.end_time - s.start0
          WHEN n.end_time - s.start1 >= n.start_time THEN n.end_time - s.start1
          WHEN n.end_time - s.start2 >= n.start_time THEN n.end_time - s.start2
          WHEN n.end_time - s.start3 >= n.start_time THEN n.end_time - s.start3
        END AS line_end
      FROM numbered n
      JOIN line_starts s USING (video_id, line_no)
      WHERE n.end_time IS DISTINCT FROM n.next_start
    ),
    repaired AS (
      SELECT
        id,
        start_time,
        end_time,
        CASE
          -- A word sharing its start with the next word of its line (a second
          -- word at offset 0, or any segment of a block-level track) ends where
          -- a later word starts. A block's segments share its stored end too,
          -- even one that begins with a line break and so looks like a line start.
          WHEN next_start = start_time
            AND (NOT next_is_line_start OR next_end = end_time)
            THEN least(next_later_start, line_end)
          WHEN next_start > start_time THEN least(next_start, line_end)
          ELSE line_end
        END AS new_end
      FROM possible_last_words
      WHERE line_end IS NOT NULL
    )
    UPDATE captions
    SET end_time = repaired.new_end,
        duration = repaired.new_end - repaired.start_time
    FROM repaired
    WHERE captions.id = repaired.id
      AND repaired.new_end <> repaired.end_time
  `.execute(db);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {}
