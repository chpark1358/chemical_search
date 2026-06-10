export const routes = {
  home: "/",
  explore: "/explore",
  createWorldCup: "/worldcup/new",
  worldCupDetail: (slug: string) => `/worldcup/${slug}`,
  worldCupPlay: (slug: string) => `/worldcup/${slug}/play`,
  worldCupResult: (slug: string, sessionId: string) =>
    `/worldcup/${slug}/result/${sessionId}`,
  adminReports: "/admin/reports"
} as const;
