import type { User } from "@prisma/client";
import { issueToken } from "./tokens";
import { sendMail } from "./mail";
import { env } from "./env";
import { HOUR } from "./domain/time";
import { translatorFor } from "@/i18n/server";

/** R-02: invitation link to set the password, valid 72 h, single use. */
export async function sendInvitation(user: User) {
  const token = await issueToken(user.id, "INVITE", 72 * HOUR);
  const t = translatorFor(user.locale, "authMail");
  const url = `${env.appUrl}/invite/${token}`;
  await sendMail({ to: user.email, subject: t("inviteSubject"), text: t("inviteBody", { name: user.name, url }) });
  return url;
}
