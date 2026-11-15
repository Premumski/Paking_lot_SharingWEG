import { getTranslations } from "next-intl/server";
import { getSettings } from "@/lib/settings";
import { saveSettingsAction } from "@/app/actions/admin";
import { SettingsForm } from "./SettingsForm";

// A-04
export default async function AdminSettings() {
  const t = await getTranslations("settings");
  const s = await getSettings();
  const { devClockOffsetMs, updatedAt, ...rest } = s;
  void devClockOffsetMs; void updatedAt;
  return (
    <div className="space-y-4">
      <h1 className="h1">{t("title")}</h1>
      <div className="card"><SettingsForm action={saveSettingsAction} s={rest} /></div>
    </div>
  );
}
