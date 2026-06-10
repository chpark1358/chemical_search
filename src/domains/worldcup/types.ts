export type WorldCupCard = {
  slug: string;
  title: string;
  description: string;
  category: string;
  candidateCount: number;
  playCount: number;
  completionRate: number;
  updatedAt: string;
  coverColors: [string, string];
};

export type Candidate = {
  id: string;
  name: string;
  description: string;
  color: string;
};

export type WorldCupDetail = WorldCupCard & {
  candidates: Candidate[];
  rankings: Array<{
    candidateId: string;
    name: string;
    winRate: number;
  }>;
};
