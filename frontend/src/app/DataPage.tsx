import { PhoneAccessSection } from "../core/auth/PhoneAccessSection";
import { BackupsSection } from "../core/data/BackupsSection";
import { CloudSection } from "../core/data/CloudSection";
import { TransferSection } from "../core/data/TransferSection";
import { IS_DEVICE } from "../core/platform";
import { PageHeader } from "../ui/PageHeader";

/** Data safety and devices: backups, Google Drive sync, export/import, and phone pairing. */
export function DataPage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-4 pt-6 pb-24 md:px-6 md:pt-10">
      <div className="-mx-3 -mb-6">
        <PageHeader
          title="Data"
          subtitle={
            IS_DEVICE
              ? "Backups on this phone, and syncing with your PCs."
              : "Backups, moving your data between PCs, and your phone."
          }
        />
      </div>
      <CloudSection />
      <BackupsSection />
      <TransferSection />
      {!IS_DEVICE && <PhoneAccessSection />}
    </div>
  );
}
