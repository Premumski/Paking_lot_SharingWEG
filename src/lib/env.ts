/** O-06: all configuration comes from environment variables (.env file). */
function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (!v) throw new Error(`Missing environment variable ${name}`);
  return v;
}

export const env = {
  get appUrl() {
    return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  },
  get secure() {
    return this.appUrl.startsWith("https://");
  },
  get sessionSecret() {
    return required("SESSION_SECRET", process.env.NODE_ENV === "production" ? undefined : "dev-secret");
  },
  get paymentProvider(): "mock" | "stripe" {
    return process.env.PAYMENT_PROVIDER === "stripe" ? "stripe" : "mock";
  },
  get devTools() {
    return process.env.DEV_TOOLS === "true";
  },
  get hibpEnabled() {
    return process.env.HIBP_ENABLED !== "false";
  },
  get mailFrom() {
    return process.env.MAIL_FROM ?? "Stellplatz-Sharing <noreply@localhost>";
  },
  get adminAlertEmail() {
    return process.env.ADMIN_ALERT_EMAIL ?? "";
  },
};
