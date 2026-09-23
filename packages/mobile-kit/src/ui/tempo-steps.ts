/** The Boogiz playback levels every dance surface offers, slowest first. */
export const TEMPO_STEPS: readonly number[] = [0.1, 0.25, 0.5, 0.75, 1];

/**
 * The step nearest `rate`. Ties resolve to the slower step, and because the result
 * always comes from `steps`, this clamps as well as snaps.
 */
export function snapTempoRate(rate: number, steps: readonly number[] = TEMPO_STEPS): number {
  let nearest = steps[0];
  if (nearest === undefined) return rate;
  for (const step of steps) {
    if (Math.abs(step - rate) < Math.abs(nearest - rate)) nearest = step;
  }
  return nearest;
}

/** Moves `delta` steps along the scale, stopping at either end. */
export function shiftTempoRate(
  rate: number,
  delta: number,
  steps: readonly number[] = TEMPO_STEPS,
): number {
  const index = steps.indexOf(snapTempoRate(rate, steps));
  if (index === -1) return rate;
  return steps[Math.min(steps.length - 1, Math.max(0, index + delta))] ?? rate;
}

/**
 * Where `rate` sits on the bar, 0 at the slowest step and 1 at the fastest.
 *
 * Boogiz spaces its five selectable stops evenly even though their numeric values are
 * not evenly spaced. Mapping by index keeps the thumb and its snapping positions in
 * the same places as the original control.
 */
export function tempoFraction(rate: number, steps: readonly number[] = TEMPO_STEPS): number {
  if (steps.length < 2) return 1;
  const index = steps.indexOf(snapTempoRate(rate, steps));
  return index < 0 ? 1 : index / (steps.length - 1);
}

/**
 * The inverse of `tempoFraction`: the step a point `fraction` of the way up the bar
 * selects, 0 at the slowest step and 1 at the fastest. Out-of-range input clamps.
 */
export function tempoRateAtFraction(
  fraction: number,
  steps: readonly number[] = TEMPO_STEPS,
): number {
  if (steps.length === 0) return fraction;
  const clamped = Math.min(1, Math.max(0, fraction));
  const index = Math.floor(clamped * (steps.length - 1) + 0.5);
  return steps[index] ?? fraction;
}

/** `1×`, not `1.00×`: the label reads as a level, not a measurement. */
export function formatTempoRate(rate: number): string {
  return `${Number.parseFloat(rate.toFixed(2))}×`;
}

/**
 * The spoken counterpart of `formatTempoRate`. `×` is announced inconsistently — some
 * screen readers say "multiplication sign", others drop it — so speech spells the word.
 */
export function describeTempoRate(rate: number): string {
  return `${Number.parseFloat(rate.toFixed(2))} times normal speed`;
}
