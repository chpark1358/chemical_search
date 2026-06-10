import type { WorldCupCard, WorldCupDetail } from "./types";

export const worldCupCards: WorldCupCard[] = [
  {
    slug: "street-food",
    title: "퇴근길 길거리 음식 월드컵",
    description: "붕어빵부터 타코야키까지, 오늘 가장 당기는 간식을 고릅니다.",
    category: "음식",
    candidateCount: 32,
    playCount: 18420,
    completionRate: 72,
    updatedAt: "2026-05-19",
    coverColors: ["#f97316", "#0f766e"]
  },
  {
    slug: "weekend-place",
    title: "주말에 가고 싶은 장소 월드컵",
    description: "집, 카페, 전시, 한강 중 지금의 기분에 맞는 선택지.",
    category: "라이프",
    candidateCount: 16,
    playCount: 9311,
    completionRate: 79,
    updatedAt: "2026-05-18",
    coverColors: ["#2563eb", "#b8324a"]
  },
  {
    slug: "retro-game",
    title: "추억의 게임 캐릭터 월드컵",
    description: "한 번쯤 밤새 플레이했던 캐릭터를 다시 고릅니다.",
    category: "게임",
    candidateCount: 46,
    playCount: 21004,
    completionRate: 68,
    updatedAt: "2026-05-17",
    coverColors: ["#7c3aed", "#16a34a"]
  }
];

const baseCandidates = [
  ["c1", "붕어빵", "추운 날 손에 쥐면 바로 납득되는 간식", "#f97316"],
  ["c2", "떡볶이", "매콤한 양념과 쫀득한 떡의 기본기", "#dc2626"],
  ["c3", "타코야키", "겉은 바삭하고 속은 촉촉한 한입", "#0f766e"],
  ["c4", "호떡", "달콤한 시럽과 바삭한 가장자리", "#b45309"],
  ["c5", "어묵", "국물까지 생각나는 겨울 선택지", "#2563eb"],
  ["c6", "핫도그", "설탕과 케첩 조합의 강한 존재감", "#b8324a"],
  ["c7", "군고구마", "종이봉투 안에서 오래 따뜻한 간식", "#92400e"],
  ["c8", "계란빵", "부드러운 빵과 짭짤한 계란의 조합", "#ca8a04"]
] as const;

export function buildCandidates(count: number) {
  return Array.from({ length: count }, (_, index) => {
    const template = baseCandidates[index % baseCandidates.length];
    const cycle = Math.floor(index / baseCandidates.length);
    const suffix = cycle === 0 ? "" : ` ${cycle + 1}`;

    return {
      id: `c${index + 1}`,
      name: `${template[1]}${suffix}`,
      description: template[2],
      color: template[3]
    };
  });
}

export const featuredWorldCup: WorldCupDetail = {
  ...worldCupCards[0],
  candidates: buildCandidates(worldCupCards[0].candidateCount),
  rankings: [
    { candidateId: "c2", name: "떡볶이", winRate: 61 },
    { candidateId: "c1", name: "붕어빵", winRate: 57 },
    { candidateId: "c4", name: "호떡", winRate: 53 }
  ]
};

export function findWorldCup(slug: string): WorldCupDetail {
  if (slug === featuredWorldCup.slug) {
    return featuredWorldCup;
  }

  return {
    ...featuredWorldCup,
    ...(worldCupCards.find((card) => card.slug === slug) ?? worldCupCards[0]),
    candidates: buildCandidates((worldCupCards.find((card) => card.slug === slug) ?? worldCupCards[0]).candidateCount),
    rankings: featuredWorldCup.rankings
  };
}
