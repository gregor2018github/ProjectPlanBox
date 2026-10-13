import { PhoneAccessSection } from "../core/auth/PhoneAccessSection";
import { BackupsSection } from "../core/data/BackupsSection";
import { TransferSection } from "../core/data/TransferSection";
import { PageHeader } from "../ui/PageHeader";

/** Data safety and devices: backups, export/import between PCs, and phone pairing. */
export function DataPage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-4 pt-6 pb-24 md:px-6 md:pt-10">
      <div className="-mx-3 -mb-6">
        <PageHeader
          title="Data"
          subtitle="Backups, moving your data between PCs, and your phone."
        />
      </div>
      <BackupsSection />
      <TransferSection />
      <PhoneAccessSection />
    </div>
  );
}
