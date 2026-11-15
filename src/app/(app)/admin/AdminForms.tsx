"use client";
import { useTranslations } from "next-intl";
import { ActionForm, SubmitButton, type FormAction } from "@/components/ActionForm";

export function UserForm({ action, user, submitLabel }: { action: FormAction; user?: { name: string; email: string; apartment: string; role: string; locale: string }; submitLabel: string }) {
  const t = useTranslations("admin");
  return (
    <ActionForm action={action} className="grid gap-3 sm:grid-cols-2" resetOnSuccess={!user}>
      <div><label className="label" htmlFor="u-name">{t("name")}</label><input className="input" id="u-name" name="name" required defaultValue={user?.name} /></div>
      <div><label className="label" htmlFor="u-email">{t("email")}</label><input className="input" id="u-email" name="email" type="email" required defaultValue={user?.email} /></div>
      <div><label className="label" htmlFor="u-apt">{t("apartment")}</label><input className="input" id="u-apt" name="apartment" required defaultValue={user?.apartment} /></div>
      <div>
        <label className="label" htmlFor="u-role">{t("role")}</label>
        <select className="input" id="u-role" name="role" defaultValue={user?.role ?? "RESIDENT"}>
          <option value="RESIDENT">{t("roles.RESIDENT")}</option>
          <option value="ADMIN">{t("roles.ADMIN")}</option>
        </select>
      </div>
      <div>
        <label className="label" htmlFor="u-locale">{t("language")}</label>
        <select className="input" id="u-locale" name="locale" defaultValue={user?.locale ?? "de"}>
          <option value="de">Deutsch</option>
          <option value="en">English</option>
        </select>
      </div>
      <div className="flex items-end sm:col-span-2"><SubmitButton>{submitLabel}</SubmitButton></div>
    </ActionForm>
  );
}

export function ImportForm({ action }: { action: FormAction }) {
  const t = useTranslations("admin");
  return (
    <ActionForm action={action} className="space-y-3" resetOnSuccess>
      <p className="hint">{t("csvHint")}</p>
      <input className="input" type="file" name="file" accept=".csv,text/csv" aria-label={t("csvFile")} />
      <textarea className="input min-h-24 font-mono text-xs" name="csv" placeholder={"name;email;apartment;role;language\nMax Muster;max@example.org;W 3.2;RESIDENT;de"} aria-label={t("csvText")} />
      <SubmitButton className="btn-secondary">{t("import")}</SubmitButton>
    </ActionForm>
  );
}

export function SpotForm({
  action,
  spot,
  owners,
  submitLabel,
  types,
}: {
  action: FormAction;
  spot?: { planNumber: string; label: string; type: string; ownerId: string | null };
  owners: { id: string; name: string; apartment: string }[];
  submitLabel: string;
  types: string[];
}) {
  const t = useTranslations("admin");
  const ts = useTranslations("spotTypes");
  return (
    <ActionForm action={action} className="grid gap-3 sm:grid-cols-2" resetOnSuccess={!spot}>
      <div><label className="label" htmlFor="s-pn">{t("planNumber")}</label><input className="input" id="s-pn" name="planNumber" required defaultValue={spot?.planNumber} pattern="[A-Za-z0-9_\-]{1,20}" /></div>
      <div><label className="label" htmlFor="s-label">{t("label")}</label><input className="input" id="s-label" name="label" required defaultValue={spot?.label} /></div>
      <div>
        <label className="label" htmlFor="s-type">{t("type")}</label>
        <select className="input" id="s-type" name="type" defaultValue={spot?.type ?? "STANDARD"}>
          {types.map((x) => <option key={x} value={x}>{ts(x)}</option>)}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="s-owner">{t("owner")}</label>
        <select className="input" id="s-owner" name="ownerId" defaultValue={spot?.ownerId ?? ""}>
          <option value="">{t("noOwner")}</option>
          {owners.map((o) => <option key={o.id} value={o.id}>{o.name} ({o.apartment})</option>)}
        </select>
        {spot ? <p className="hint">{t("ownerChangeHint")}</p> : null}
      </div>
      <div className="sm:col-span-2"><SubmitButton>{submitLabel}</SubmitButton></div>
    </ActionForm>
  );
}

export function TwoLanguageForm({ action, de, en, rows = 16, hint }: { action: FormAction; de: string; en: string; rows?: number; hint?: string }) {
  const t = useTranslations("admin");
  return (
    <ActionForm action={action} className="space-y-3">
      {hint ? <p className="hint">{hint}</p> : null}
      <div className="grid gap-3 lg:grid-cols-2">
        <div><label className="label">{t("german")}<textarea className="input mt-1 font-mono text-xs" name="bodyDe" rows={rows} defaultValue={de} /></label></div>
        <div><label className="label">{t("english")}<textarea className="input mt-1 font-mono text-xs" name="bodyEn" rows={rows} defaultValue={en} /></label></div>
      </div>
      <SubmitButton>{t("save")}</SubmitButton>
    </ActionForm>
  );
}
