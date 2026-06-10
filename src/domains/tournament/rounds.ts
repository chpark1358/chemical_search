export function availableRounds(candidateCount: number): number[] {
  const rounds = [2, 4, 8, 16, 32, 64, 128, 256, 512, 1024];
  return rounds.filter((round) => round <= candidateCount);
}

export function defaultRound(candidateCount: number): number {
  const rounds = availableRounds(candidateCount);
  return rounds.at(-1) ?? 2;
}

export function estimatedMinutes(round: number): number {
  return Math.max(1, Math.ceil((round - 1) * 0.18));
}
