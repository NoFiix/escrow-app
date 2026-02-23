import MissionDetails from "@/components/missions/MissionDetails";

export default async function MissionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <MissionDetails id={id} />;
}