import cleanMarkup from "../util/cleanMarkdown";
import { AudioTextChunk } from "./AudioTextChunk";

/**
 * mutates the given chunks array in-place. If these are mobx, must be wrapped in an action
 * @param changes
 * @param chunks
 */
export function onMultiTextChanged(
  changes: { position: number; type: "add" | "remove"; text: string }[],
  chunks: AudioTextChunk[],
): void {
  for (const { position, type, text } of changes) {
    if (chunks.length) {
      // left-most part of the add or delete
      const left = position;
      // right-most part of the add or delete
      const right = position + text.length;
      const end = chunks.at(-1)!.end;

      if (type == "add") {
        // this kind of needs to be "smart" about whether the change is inclusive to the range or not
        const isAffected = position <= end;
        if (isAffected) {
          for (const [track, idx] of chunks.map((x, i) => [x, i] as const)) {
            const isLast = idx === chunks.length - 1;
            const isAddAtVeryEnd = isLast && position === end;
            const isTrackAffected = left < track.end || isAddAtVeryEnd;

            if (isTrackAffected) {
              track.end += text.length;
              if (position < track.start) {
                track.start += text.length;
              } else {
                const split = position - track.start;
                const updatedText =
                  track.text.slice(0, split) + text + track.text.slice(split);
                const cleanedText = cleanMarkup(updatedText);
                if (updatedText != track.rawText) {
                  track.rawText = updatedText;
                }
                if (cleanedText != track.text) {
                  track.text = cleanedText;
                  track.duration = undefined;
                  track.audio = undefined;
                  track.audioBuffer = undefined;
                  track.loading = false;
                  track.failureInfo = undefined;
                }
              }
            }
          }
        }
      } else {
        // start or end of the deletion are inside the range
        const isAffected = left < end;
        // or the whole range has been deleted
        if (isAffected) {
          for (const track of chunks) {
            let update: Partial<AudioTextChunk> & {
              updateType: "after" | "before" | "left" | "right" | "interior";
            };
            if (track.end <= left) {
              // is completely after
              update = { updateType: "after" };
            } else if (right < track.start) {
              // is completely before
              update = {
                updateType: "before",
                start: track.start - text.length,
                end: track.end - text.length,
              };
            } else if (left <= track.start) {
              // is left side deletion
              const removedBefore = Math.max(0, track.start - left);
              const removed = Math.min(
                right - Math.max(left, track.start),
                track.text.length,
              );
              update = {
                updateType: "left",
                start: track.start - removedBefore,
                end: track.end - removed - removedBefore,
                rawText: track.rawText.slice(removed),
              };
            } else if (left < track.end && track.end <= right) {
              // is right side deletion
              const removed = track.end - left;
              update = {
                updateType: "right",
                rawText: track.rawText.slice(0, -removed),
                end: track.end - removed,
              };
            } else {
              // is interior deletion
              update = {
                updateType: "interior",
                end: track.end - (right - left),
                rawText:
                  track.rawText.slice(0, left - track.start) +
                  track.rawText.slice(right - track.start),
              };
            }
            const { updateType: _, rawText, ...updates } = update;
            // const { updateType, rawText, ...updates } = update;
            // console.info(
            //   `Type: ${updateType} ${rawText ? `'${track.rawText}' -> '${rawText}'` : "[no text change]"}`,
            //   Object.keys(updates).map((x) => {
            //     return `${x}: '${(track as any)[x]}' -> '${(updates as any)[x]}'`;
            //   }),
            // );
            if (rawText !== undefined) {
              const cleanedText = cleanMarkup(rawText);

              if (rawText != track.rawText) {
                track.rawText = rawText;
              }

              if (cleanedText != track.text) {
                track.text = cleanedText;
                track.duration = undefined;
                track.audio = undefined;
                track.audioBuffer = undefined;
                track.loading = false;
                track.failureInfo = undefined;
              }
            }
            Object.assign(track, updates);
          }
        }
      }
    }
  }
}
