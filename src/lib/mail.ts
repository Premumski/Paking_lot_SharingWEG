import nodemailer, { type Transporter } from "nodemailer";
import { prisma } from "./db";
import { env } from "./env";

let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (transporter) return transporter;
  if (!process.env.SMTP_HOST) return null;
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined,
  });
  return transporter;
}

export interface MailInput {
  to: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: { filename: string; content: Buffer; contentType: string }[];
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Renders plain text with URLs as a minimal HTML mail. */
export function textToHtml(text: string) {
  const body = escapeHtml(text)
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>')
    .replace(/\n/g, "<br>");
  return `<!doctype html><html><body style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5;color:#1f2937;max-width:560px">${body}</body></html>`;
}

export async function sendMail(input: MailInput) {
  if (env.devTools) {
    await prisma.devMail.create({ data: { to: input.to, subject: input.subject, text: input.text } }).catch(() => {});
  }
  const t = getTransporter();
  if (!t) {
    if (!env.devTools) console.warn("[mail] SMTP_HOST not configured, e-mail not sent");
    return;
  }
  try {
    await t.sendMail({
      from: env.mailFrom,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html ?? textToHtml(input.text),
      attachments: input.attachments,
    });
  } catch (e) {
    // S-05: no recipient address in logs
    console.error("[mail] sending failed:", (e as { code?: string }).code ?? "", (e as Error).message);
  }
}
