"use client";
import { useEffect } from "react";
import { storePendingTotp } from "./actions";

/** Cookies can only be set in actions; this binds the displayed secret to the browser. */
export function PendingTotpCookie({ secret }: { secret: string }) {
  useEffect(() => {
    void storePendingTotp(secret);
  }, [secret]);
  return null;
}
