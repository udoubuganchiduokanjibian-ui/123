import { GameDesktop } from "../components/reader/game-desktop";

export default async function Home({ searchParams }: {
  searchParams: Promise<{ view?: string | string[] }>;
}) {
  const { view } = await searchParams;
  return <GameDesktop glassPreview={view === "glass"} />;
}
