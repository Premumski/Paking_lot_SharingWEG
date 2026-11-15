"use client";
import { ActionForm, SubmitButton, type FormAction } from "./ActionForm";

/** A single-button form for bound server actions (confirm, decline, ...). */
export function ActionButton({ action, label, className, confirmText }: { action: FormAction; label: string; className?: string; confirmText?: string }) {
  return (
    <ActionForm action={action} className="inline-block" confirmText={confirmText}>
      <SubmitButton className={className ?? "btn-primary btn-small"}>{label}</SubmitButton>
    </ActionForm>
  );
}
