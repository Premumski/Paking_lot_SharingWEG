"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { ActionForm, SubmitButton, type FormAction } from "@/components/ActionForm";

export function CancelForm({ action, asOwner, refundText }: { action: FormAction; asOwner: boolean; refundText: string }) {
  const t = useTranslations("bookingDetail");
  const [open, setOpen] = useState(false);
  if (!open) {
    return <button type="button" className="btn-danger btn-small" onClick={() => setOpen(true)}>{t("cancel")}</button>;
  }
  return (
    <ActionForm action={action} className="w-full space-y-2 rounded-lg border border-red-200 bg-red-50 p-3">
      <p className="text-sm">{refundText}</p>
      {asOwner ? (
        <div>
          <label className="label" htmlFor="reason">{t("cancelReason")}</label>
          <input className="input" id="reason" name="reason" required minLength={3} maxLength={300} />
        </div>
      ) : null}
      <div className="flex gap-2">
        <SubmitButton className="btn-danger btn-small">{t("confirmCancel")}</SubmitButton>
        <button type="button" className="btn-secondary btn-small" onClick={() => setOpen(false)}>{t("keep")}</button>
      </div>
    </ActionForm>
  );
}

export function ProblemForm({ action }: { action: FormAction }) {
  const t = useTranslations("bookingDetail");
  return (
    <ActionForm action={action} className="space-y-3" resetOnSuccess>
      <div>
        <label className="label" htmlFor="category">{t("problemCategory")}</label>
        <select className="input" id="category" name="category">
          <option value="SPOT_OCCUPIED">{t("problem.SPOT_OCCUPIED")}</option>
          <option value="OVERSTAY">{t("problem.OVERSTAY")}</option>
          <option value="DAMAGE">{t("problem.DAMAGE")}</option>
          <option value="OTHER">{t("problem.OTHER")}</option>
        </select>
      </div>
      <div>
        <label className="label" htmlFor="text">{t("problemText")}</label>
        <textarea className="input min-h-24" id="text" name="text" required minLength={5} maxLength={2000} />
      </div>
      <div>
        <label className="label" htmlFor="photos">{t("problemPhotos")}</label>
        <input className="input" id="photos" name="photos" type="file" accept="image/jpeg,image/png,image/webp" multiple />
        <p className="hint">{t("problemPhotosHint")}</p>
      </div>
      <SubmitButton className="btn-secondary">{t("sendProblem")}</SubmitButton>
    </ActionForm>
  );
}
