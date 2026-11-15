"use client";
import { useTranslations } from "next-intl";
import { ActionForm, SubmitButton, type FormAction } from "@/components/ActionForm";

export function ClockForm({ action }: { action: FormAction }) {
  const t = useTranslations("dev");
  return (
    <div className="flex flex-wrap gap-2">
      {[1, 6, 13, 24, 72].map((h) => (
        <ActionForm key={h} action={action} className="inline-block">
          <input type="hidden" name="mode" value="add" />
          <input type="hidden" name="hours" value={h} />
          <SubmitButton className="btn-secondary btn-small">+{h} h</SubmitButton>
        </ActionForm>
      ))}
      <ActionForm action={action} className="inline-block">
        <input type="hidden" name="mode" value="reset" />
        <SubmitButton className="btn-secondary btn-small">{t("resetClock")}</SubmitButton>
      </ActionForm>
    </div>
  );
}
