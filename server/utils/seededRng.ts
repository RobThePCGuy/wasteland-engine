export function createSeededRng(seed: string): () => number {
  let hash = 0;

  for (let index = 0; index < seed.length; index += 1) {
    hash = (Math.imul(31, hash) + seed.charCodeAt(index)) | 0;
  }

  return () => {
    hash = hash ^ (hash << 13);
    hash = hash ^ (hash >> 17);
    hash = hash ^ (hash << 5);
    return (hash >>> 0) / 4294967296;
  };
}

export function shuffleWithRng<T>(values: T[], rng: () => number): T[] {
  const result = [...values];

  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }

  return result;
}