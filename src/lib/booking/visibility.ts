import { now } from "../clock";
import { DAY } from "../domain/time";

/** D-01: phone and access notes only after confirmation and until 7 days after the end. */
export function contactVisible(b: { status: string; endsAt: Date }) {
  return b.status === "CONFIRMED" && now().getTime() <= b.endsAt.getTime() + 7 * DAY;
}

export type DisplayStatus = "draft" | "requested" | "confirmed" | "active" | "completed" | "declined" | "withdrawn" | "expired" | "cancelled";

export function displayStatus(b: { status: string; startsAt: Date; endsAt: Date }): DisplayStatus {
  const t = now();
  if (b.status === "CONFIRMED") {
    if (b.endsAt <= t) return "completed";
    if (b.startsAt <= t) return "active";
    return "confirmed";
  }
  return b.status.toLowerCase() as DisplayStatus;
}
