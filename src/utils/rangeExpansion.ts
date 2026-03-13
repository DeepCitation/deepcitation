/**
 * Expands a numeric range [start, end] into an array of integers.
 * For large ranges (> MAX_RANGE_SIZE), uses deterministic sampling
 * to avoid memory exhaustion while preserving range boundaries.
 */

const MAX_RANGE_SIZE = 1000;
const SAMPLE_COUNT = 50;

/**
 * Expands a numeric range into an array of integers.
 * For ranges larger than 1000, returns a deterministic sample of ~50 values
 * (always including the start and end) to prevent memory exhaustion.
 *
 * @param start - Range start (inclusive)
 * @param end - Range end (inclusive)
 * @returns Array of integers in ascending order
 */
export function expandRange(start: number, end: number): number[] {
  if (start > end) return [start];

  const rangeSize = end - start + 1;

  if (rangeSize <= MAX_RANGE_SIZE) {
    const result: number[] = [];
    for (let i = start; i <= end; i++) {
      result.push(i);
    }
    return result;
  }

  // Large range: sample deterministically
  const samples = [start];
  const sampleCount = Math.min(SAMPLE_COUNT - 2, rangeSize - 2);
  if (sampleCount > 0) {
    const step = Math.max(1, Math.floor((end - start) / (sampleCount + 1)));
    for (let i = 1; i <= sampleCount; i++) {
      const sample = start + step * i;
      if (sample < end) {
        samples.push(sample);
      }
    }
  }
  samples.push(end);
  return samples;
}
