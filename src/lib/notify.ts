import type { User } from "@prisma/client";
import { prisma } from "./db";
import { env } from "./env";
import { sendMail } from "./mail";
import { sendPush } from "./push";
import { translatorFor } from "@/i18n/server";

/** N-01 notification types; each can be switched off per channel (N-03). */
export const NOTIFICATION_TYPES = [
  "requestNew",
  "requestConfirmed",
  "requestDeclined",
  "requestExpired",
  "bookingCancelled",
  "paymentProblem",
  "startsSoon",
  "endsSoon",
  "problemReported",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];
export type Channel = "email" | "push";
export type NotificationPrefs = Partial<Record<NotificationType, Partial<Record<Channel, boolean>>>>;

export function prefEnabled(user: Pick<User, "notificationPrefs">, type: NotificationType, channel: Channel) {
  const prefs = (user.notificationPrefs ?? {}) as NotificationPrefs;
  return prefs[type]?.[channel] !== false;
}

export interface NotifyOptions {
  /** Path inside the app, e.g. /bookings/<id> */
  path: string;
  /** Extra lines appended to the e-mail body, already translated per recipient via callback */
  extra?: (t: ReturnType<typeof translatorFor>) => string;
  attachments?: { filename: string; content: Buffer; contentType: string }[];
}

/**
 * Sends a notification in the recipient's language. `vars` are interpolated into
 * messages/<locale>/notifications.json -> <type>.subject / .body.
 */
export async function notify(
  userOrId: string | User,
  type: NotificationType,
  vars: (locale: string) => Record<string, string | number>,
  opts: NotifyOptions,
) {
  const user = typeof userOrId === "string" ? await prisma.user.findUnique({ where: { id: userOrId } }) : userOrId;
  if (!user || user.status === "DELETED") return;
  const t = translatorFor(user.locale, "notifications");
  const values = vars(user.locale);
  const url = `${env.appUrl}${opts.path}`;
  const subject = t(`${type}.subject`, values);
  const body = t(`${type}.body`, values);

  const tasks: Promise<unknown>[] = [];
  if (prefEnabled(user, type, "email")) {
    const extra = opts.extra ? `\n\n${opts.extra(t)}` : "";
    const text = `${t("greeting", { name: user.name })}\n\n${body}${extra}\n\n${t("openLink")}: ${url}\n\n${t("footer", { url: `${env.appUrl}/profile` })}`;
    tasks.push(sendMail({ to: user.email, subject, text, attachments: opts.attachments }));
  }
  if (prefEnabled(user, type, "push")) {
    tasks.push(sendPush(user.id, { title: subject, body, url: opts.path }));
  }
  await Promise.all(tasks);
}

/** Notifications to all active admins (Z-07, D-02). */
export async function notifyAdmins(
  type: NotificationType,
  vars: (locale: string) => Record<string, string | number>,
  opts: NotifyOptions,
  exceptUserIds: string[] = [],
) {
  const admins = await prisma.user.findMany({ where: { role: "ADMIN", status: "ACTIVE", id: { notIn: exceptUserIds } } });
  await Promise.all(admins.map((a) => notify(a, type, vars, opts)));
}

/** Operational e-mails to admins that cannot be switched off (e.g. deletion requests). */
export async function alertAdmins(key: string, values: Record<string, string | number>, path: string) {
  const admins = await prisma.user.findMany({ where: { role: "ADMIN", status: "ACTIVE" } });
  await Promise.all(
    admins.map((a) => {
      const t = translatorFor(a.locale, "notifications");
      return sendMail({
        to: a.email,
        subject: t(`admin.${key}.subject`, values),
        text: `${t("greeting", { name: a.name })}\n\n${t(`admin.${key}.body`, values)}\n\n${t("openLink")}: ${env.appUrl}${path}`,
      });
    }),
  );
}
