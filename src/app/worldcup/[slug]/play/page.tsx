import { AppHeader } from "@/components/common/AppHeader";
import { PlayExperience } from "@/components/play/PlayExperience";
import { findWorldCup } from "@/domains/worldcup/mock-data";
import { defaultRound } from "@/domains/tournament/rounds";

type Props = {
  params: Promise<{ slug: string }>;
};

export default async function PlayPage({ params }: Props) {
  const { slug } = await params;
  const worldCup = findWorldCup(slug);
  const selectedRound = Math.min(defaultRound(worldCup.candidateCount), 16);

  return (
    <main className="page-shell">
      <AppHeader />
      <section className="container py-6">
        <PlayExperience slug={worldCup.slug} title={worldCup.title} selectedRound={selectedRound} />
      </section>
    </main>
  );
}
