"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ActionForm, SubmitButton, type FormAction } from "@/components/ActionForm";

export function ProfileForm({ action, user }: { action: FormAction; user: { name: string; phone: string | null; locale: string; email: string; apartment: string } }) {
  const t = useTranslations("profile");
  return (
    <ActionForm action={action} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="name">{t("name")}</label>
          <input className="input" id="name" name="name" defaultValue={user.name} required maxLength={80} autoComplete="name" />
        </div>
        <div>
          <label className="label" htmlFor="phone">{t("phone")}</label>
          <input className="input" id="phone" name="phone" defaultValue={user.phone ?? ""} type="tel" autoComplete="tel" />
          <p className="hint">{t("phoneHint")}</p>
        </div>
        <div>
          <label className="label" htmlFor="email">{t("email")}</label>
          <input className="input bg-slate-100" id="email" value={user.email} readOnly aria-describedby="admin-only" />
        </div>
        <div>
          <label className="label" htmlFor="apartment">{t("apartment")}</label>
          <input className="input bg-slate-100" id="apartment" value={user.apartment} readOnly aria-describedby="admin-only" />
        </div>
        <div>
          <label className="label" htmlFor="locale">{t("language")}</label>
          <select className="input" id="locale" name="locale" defaultValue={user.locale}>
            <option value="de">Deutsch</option>
            <option value="en">English</option>
          </select>
        </div>
      </div>
      <p id="admin-only" className="hint">{t("adminOnly")}</p>
      <SubmitButton>{t("save")}</SubmitButton>
    </ActionForm>
  );
}

export function NotificationsForm({ action, types, prefs }: { action: FormAction; types: readonly string[]; prefs: Record<string, { email?: boolean; push?: boolean }> }) {
  const t = useTranslations("profile");
  const tn = useTranslations("notificationTypes");
  return (
    <ActionForm action={action} className="space-y-3">
      <div className="overflow-x-auto">
        <table className="table">
          <thead><tr><th scope="col">{t("notificationType")}</th><th scope="col">{t("email")}</th><th scope="col">{t("push")}</th></tr></thead>
          <tbody>
            {types.map((type) => (
              <tr key={type}>
                <th scope="row" className="font-normal">{tn(type)}</th>
                <td><input type="checkbox" className="h-5 w-5" name={`${type}.email`} defaultChecked={prefs[type]?.email !== false} aria-label={`${tn(type)} – ${t("email")}`} /></td>
                <td><input type="checkbox" className="h-5 w-5" name={`${type}.push`} defaultChecked={prefs[type]?.push !== false} aria-label={`${tn(type)} – ${t("push")}`} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <SubmitButton>{t("save")}</SubmitButton>
    </ActionForm>
  );
}

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

/** N-01 Web-Push subscription */
export function PushToggle({ publicKey }: { publicKey: string }) {
  const t = useTranslations("profile");
  const [state, setState] = useState<"unsupported" | "off" | "on" | "denied" | "loading">("loading");
  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !publicKey) return setState("unsupported");
    if (Notification.permission === "denied") return setState("denied");
    navigator.serviceWorker.register("/sw.js").then(async (reg) => {
      const sub = await reg.pushManager.getSubscription();
      setState(sub ? "on" : "off");
    }).catch(() => setState("unsupported"));
  }, [publicKey]);
  const enable = async () => {
    const reg = await navigator.serviceWorker.ready;
    const perm = await Notification.requestPermission();
    if (perm !== "granted") return setState("denied");
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) });
    await fetch("/api/push", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(sub) });
    setState("on");
  };
  const disable = async () => {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await fetch("/api/push", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) });
      await sub.unsubscribe();
    }
    setState("off");
  };
  if (state === "loading") return null;
  if (state === "unsupported") return <p className="text-sm text-slate-500">{t("pushUnsupported")}</p>;
  if (state === "denied") return <p className="text-sm text-slate-500">{t("pushDenied")}</p>;
  return state === "on" ? (
    <button type="button" className="btn-secondary btn-small" onClick={disable}>{t("pushDisable")}</button>
  ) : (
    <button type="button" className="btn-primary btn-small" onClick={enable}>{t("pushEnable")}</button>
  );
}

export function ChangePasswordForm({ action }: { action: FormAction }) {
  const t = useTranslations("profile");
  return (
    <ActionForm action={action} className="grid gap-3 sm:grid-cols-3" resetOnSuccess>
      <div>
        <label className="label" htmlFor="current">{t("currentPassword")}</label>
        <input className="input" id="current" name="current" type="password" autoComplete="current-password" required />
      </div>
      <div>
        <label className="label" htmlFor="newpw">{t("newPassword")}</label>
        <input className="input" id="newpw" name="password" type="password" autoComplete="new-password" minLength={12} required />
      </div>
      <div>
        <label className="label" htmlFor="newpw2">{t("repeatPassword")}</label>
        <input className="input" id="newpw2" name="password2" type="password" autoComplete="new-password" minLength={12} required />
      </div>
      <div className="sm:col-span-3"><SubmitButton className="btn-secondary">{t("changePassword")}</SubmitButton></div>
    </ActionForm>
  );
}

export function DisableTotpForm({ action }: { action: FormAction }) {
  const t = useTranslations("profile");
  return (
    <ActionForm action={action} className="flex flex-wrap items-end gap-2">
      <div>
        <label className="label" htmlFor="dcode">{t("totpCode")}</label>
        <input className="input w-36" id="dcode" name="code" inputMode="numeric" maxLength={7} required />
      </div>
      <SubmitButton className="btn-secondary">{t("disable2fa")}</SubmitButton>
    </ActionForm>
  );
}
