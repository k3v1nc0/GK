import type { DeterministicRandomStreamContract, ProceduralSeedInput } from "@gk/schemas";

export interface DeterministicRandomStream extends DeterministicRandomStreamContract {
  next(): number;
  nextInt(maxExclusive: number): number;
  pickWeighted<TValue>(entries: readonly WeightedChoice<TValue>[]): TValue | null;
}

export interface WeightedChoice<TValue> {
  readonly value: TValue;
  readonly weight: number;
}

export function createDeterministicRandomStream(options: {
  readonly seed: ProceduralSeedInput;
  readonly streamKey?: string;
}): DeterministicRandomStream {
  const seed = normalizeSeed(options.seed);
  const streamKey = options.streamKey ?? "default";
  let state = hashSeed(`${seed}:${streamKey}`);

  return {
    algorithm: "gk-xfnv1a-mulberry32-v1",
    seed,
    streamKey,
    usesMathRandom: false,
    usesImplicitTimeSource: false,
    next: () => {
      state += 0x6D2B79F5;
      let value = state;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    },
    nextInt: (maxExclusive: number) => {
      if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
        throw new Error("max_exclusive_must_be_positive_integer");
      }

      return Math.floor(createRandomNumberFromState(() => {
        state += 0x6D2B79F5;
        let value = state;
        value = Math.imul(value ^ (value >>> 15), value | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
      }) * maxExclusive);
    },
    pickWeighted: <TValue>(entries: readonly WeightedChoice<TValue>[]): TValue | null => {
      const validEntries = entries.filter((entry) => Number.isFinite(entry.weight) && entry.weight > 0);
      const totalWeight = validEntries.reduce((total, entry) => total + entry.weight, 0);

      if (validEntries.length === 0 || totalWeight <= 0) {
        return null;
      }

      let cursor = createRandomNumberFromState(() => {
        state += 0x6D2B79F5;
        let value = state;
        value = Math.imul(value ^ (value >>> 15), value | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
      }) * totalWeight;

      for (const entry of validEntries) {
        cursor -= entry.weight;
        if (cursor <= 0) {
          return entry.value;
        }
      }

      return validEntries.at(-1)?.value ?? null;
    }
  };
}

export function createDeterministicSequence(options: {
  readonly seed: ProceduralSeedInput;
  readonly count: number;
  readonly streamKey?: string;
}): readonly number[] {
  const stream = createDeterministicRandomStream({
    seed: options.seed,
    ...(options.streamKey !== undefined ? { streamKey: options.streamKey } : {})
  });
  return Array.from({ length: options.count }, () => stream.next());
}

export function normalizeSeed(seed: ProceduralSeedInput): string {
  return String(seed).trim();
}

function createRandomNumberFromState(next: () => number): number {
  return next();
}

function hashSeed(seed: string): number {
  let hash = 0x811c9dc5;

  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return hash >>> 0;
}
