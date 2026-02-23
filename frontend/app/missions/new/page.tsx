import MissionForm from "@/components/missions/MissionForm";

export default function NewMissionPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Créer une mission</h1>
        <p className="text-sm text-muted-foreground">
          Remplis les infos, puis signe la transaction.
        </p>
      </div>

      <MissionForm />
    </div>
  );
}