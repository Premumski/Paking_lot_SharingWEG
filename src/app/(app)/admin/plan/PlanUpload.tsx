"use client";
import { useTranslations } from "next-intl";
import { ActionForm, SubmitButton, type FormAction } from "@/components/ActionForm";

export function PlanUpload({ action, levels }: { action: FormAction; levels: string[] }) {
  const t = useTranslations("admin");
  return (
    <ActionForm action={action} className="grid gap-3 sm:grid-cols-2" resetOnSuccess>
      <div>
        <label className="label" htmlFor="plan-file">{t("planFile")}</label>
        <input className="input" id="plan-file" type="file" name="file" accept=".svg,.drawio,.xml,image/svg+xml" required />
      </div>
      <div>
        <label className="label" htmlFor="plan-level">{t("levelName")}</label>
        <input className="input" id="plan-level" name="level" maxLength={30} list="plan-levels" placeholder="UG -1" aria-describedby="plan-level-hint" />
        <datalist id="plan-levels">{levels.map((l) => <option key={l} value={l} />)}</datalist>
        <p className="hint" id="plan-level-hint">{t("levelNameHint")}</p>
      </div>
      <div className="sm:col-span-2"><SubmitButton>{t("upload")}</SubmitButton></div>
    </ActionForm>
  );
}
