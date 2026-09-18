/** The tempo levels every dance surface offers, slowest first. */
export const TEMPO_STEPS: readonly number[] = [0.5, 0.75, 1, 1.25, 1.5];

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

/** Where `rate` sits on the bar, 0 at the slowest step and 1 at the fastest. */
export function tempoFraction(rate: number, steps: readonly number[] = TEMPO_STEPS): number {
  const slowest = steps[0];
  const fastest = steps[steps.length - 1];
  if (slowest === undefined || fastest === undefined || fastest === slowest) return 1;
  return Math.min(1, Math.max(0, (rate - slowest) / (fastest - slowest)));
}

/**
 * The inverse of `tempoFraction`: the step a point `fraction` of the way up the bar
 * selects, 0 at the slowest step and 1 at the fastest. Out-of-range input clamps.
 */
export function tempoRateAtFraction(
  fraction: number,
  steps: readonly number[] = TEMPO_STEPS,
): number {
  const slowest = steps[0];
  const fastest = steps[steps.length - 1];
  if (slowest === undefined || fastest === undefined) return fraction;
  const clamped = Math.min(1, Math.max(0, fraction));
  return snapTempoRate(slowest + clamped * (fastest - slowest), steps);
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
