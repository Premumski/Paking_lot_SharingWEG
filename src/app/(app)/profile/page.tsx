import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatDateTime } from "@/i18n/server";
import { NOTIFICATION_TYPES } from "@/lib/notify";
import { pushPublicKey } from "@/lib/push";
import { ActionButton } from "@/components/ActionButton";
import { changePasswordAction, disableTotpAction } from "@/app/actions/auth";
import {
  requestDeletionAction,
  revokeOtherSessionsAction,
  revokeSessionAction,
  updateNotificationsAction,
  updateProfileAction,
  withdrawDeletionAction,
} from "@/app/actions/profile";
import { ChangePasswordForm, DisableTotpForm, NotificationsForm, ProfileForm, PushToggle } from "./ProfileForms";

export async function generateMetadata() {
  return { title: (await getTranslations("profile"))("title") };
}

export default async function ProfilePage() {
  const { user, session } = await requireUser();
  const t = await getTranslations("profile");
  const locale = await getLocale();
  const sessions = await prisma.session.findMany({ where: { userId: user.id }, orderBy: { lastSeenAt: "desc" } });
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="h1">{t("title")}</h1>
      <section className="card" aria-labelledby="p-data"><h2 id="p-data" className="h2 mb-3">{t("data")}</h2>
        <ProfileForm action={updateProfileAction} user={user} />
      </section>

      <section className="card space-y-3" aria-labelledby="p-notif"><h2 id="p-notif" className="h2">{t("notifications")}</h2>
        <div className="flex items-center gap-3"><span className="text-sm">{t("pushDevice")}</span><PushToggle publicKey={pushPublicKey()} /></div>
        <NotificationsForm action={updateNotificationsAction} types={NOTIFICATION_TYPES} prefs={(user.notificationPrefs ?? {}) as Record<string, { email?: boolean; push?: boolean }>} />
      </section>

      <section className="card space-y-3" aria-labelledby="p-sec"><h2 id="p-sec" className="h2">{t("security")}</h2>
        <ChangePasswordForm action={changePasswordAction} />
        <div className="border-t border-slate-100 pt-3">
          <h3 className="font-semibold">{t("twoFactor")}</h3>
          {user.totpEnabled ? (
            <div className="space-y-2">
              <p className="text-sm text-green-800">{t("twoFactorOn")}</p>
              {user.role === "ADMIN" ? <p className="hint">{t("adminMust2fa")}</p> : <DisableTotpForm action={disableTotpAction} />}
              <Link href="/setup-2fa" className="btn-secondary btn-small">{t("replace2fa")}</Link>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm">{t("twoFactorOff")}</p>
              <Link href="/setup-2fa" className="btn-primary btn-small">{t("enable2fa")}</Link>
            </div>
          )}
        </div>
      </section>

      {/* R-07 */}
      <section className="card space-y-3" aria-labelledby="p-sess"><h2 id="p-sess" className="h2">{t("sessions")}</h2>
        <ul className="space-y-2">
          {sessions.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 p-2 text-sm">
              <span>
                <span className="block">{s.userAgent?.slice(0, 80) ?? t("unknownDevice")}</span>
                <span className="text-xs text-slate-500">{t("lastSeen", { date: formatDateTime(s.lastSeenAt, locale) })}{s.id === session.id ? ` · ${t("thisSession")}` : ""}</span>
              </span>
              {s.id !== session.id ? <ActionButton action={revokeSessionAction.bind(null, s.id)} label={t("logoutSession")} className="btn-secondary btn-small" /> : null}
            </li>
          ))}
        </ul>
        {sessions.length > 1 ? <ActionButton action={revokeOtherSessionsAction} label={t("logoutOthers")} className="btn-secondary btn-small" /> : null}
      </section>

      {/* S-08 / R-09 */}
      <section className="card space-y-3" aria-labelledby="p-privacy"><h2 id="p-privacy" className="h2">{t("privacy")}</h2>
        <a className="btn-secondary btn-small" href="/api/export/me">{t("export")}</a>
        {user.deletionRequestedAt ? (
          <div className="space-y-2">
            <p className="text-sm">{t("deletionPending", { date: formatDateTime(user.deletionRequestedAt, locale) })}</p>
            <ActionButton action={withdrawDeletionAction} label={t("withdrawDeletion")} className="btn-secondary btn-small" />
          </div>
        ) : (
          <div className="space-y-1">
            <p className="hint">{t("deletionHint")}</p>
            <ActionButton action={requestDeletionAction} label={t("requestDeletion")} className="btn-danger btn-small" confirmText={t("deletionConfirm")} />
          </div>
        )}
      </section>
    </div>
  );
}
