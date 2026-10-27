import { requirePermission } from "@/lib/auth";
import { ClientForm } from "@/components/ClientForm";
import { PageHeader } from "@/components/ui";
import { saveClientAction } from "@/app/actions";

export const metadata = { title: "Nouveau client" };

export default async function NewClientPage() {
  await requirePermission("client.edit");
  return (
    <div className="max-w-3xl">
      <PageHeader title="Nouvelle fiche client" />
      <ClientForm id={null} initial={{}} save={saveClientAction} />
    </div>
  );
}
