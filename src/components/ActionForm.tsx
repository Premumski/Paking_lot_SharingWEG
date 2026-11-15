"use client";

import { createContext, useActionState, useContext, useEffect, useRef, useTransition, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ActionResult } from "@/lib/errors";

export type FormAction = (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>;

const PendingContext = createContext<boolean | null>(null);

export function FormMessage({ state }: { state: ActionResult | null }) {
  const te = useTranslations("errors");
  const tm = useTranslations("messages");
  if (!state) return null;
  if (state.ok && !state.message) return null;
  const text = state.ok ? tm(state.message!, state.params) : te(state.error, state.params);
  return (
    <p
      role={state.ok ? "status" : "alert"}
      className={`mt-3 rounded-lg px-3 py-2 text-sm ${state.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}
    >
      {text}
    </p>
  );
}

export function SubmitButton({ children, className = "btn-primary", disabled, name, value }: { children: ReactNode; className?: string; disabled?: boolean; name?: string; value?: string }) {
  const ctx = useContext(PendingContext);
  const { pending: formPending } = useFormStatus();
  const pending = ctx ?? formPending;
  return (
    <button type="submit" className={className} disabled={pending || disabled} aria-busy={pending} name={name} value={value}>
      {pending ? <span aria-hidden className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : null}
      {children}
    </button>
  );
}

/**
 * Server-action form with inline result messages. Submits through a transition instead of the
 * form `action` prop, because React 19 resets uncontrolled fields after every form action – the
 * user would lose their input on validation errors. Without JavaScript the plain action is used.
 */
export function useActionForm(action: FormAction, opts: { resetOnSuccess?: boolean; confirmText?: string; onResult?: (r: ActionResult) => void } = {}) {
  const [state, formAction] = useActionState(action, null);
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLFormElement>(null);
  const router = useRouter();
  useEffect(() => {
    if (!state) return;
    opts.onResult?.(state);
    if (state.ok && state.redirect) {
      if (/^https?:\/\//.test(state.redirect)) window.location.assign(state.redirect);
      else router.push(state.redirect);
      return;
    }
    if (state.ok && opts.resetOnSuccess) ref.current?.reset();
    if (state.ok) router.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (pending) return;
    if (opts.confirmText && !window.confirm(opts.confirmText)) return;
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
    const fd = new FormData(e.currentTarget, submitter);
    startTransition(() => formAction(fd));
  };
  return { state, pending, ref, formProps: { ref, action: formAction, onSubmit } };
}

export function PendingProvider({ pending, children }: { pending: boolean; children: ReactNode }) {
  return <PendingContext.Provider value={pending}>{children}</PendingContext.Provider>;
}

export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess,
  onResult,
  confirmText,
}: {
  action: FormAction;
  children: ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  onResult?: (r: ActionResult) => void;
  confirmText?: string;
}) {
  const { state, pending, formProps } = useActionForm(action, { resetOnSuccess, onResult, confirmText });
  return (
    <form {...formProps} className={className}>
      <PendingProvider pending={pending}>
        {children}
        <FormMessage state={state} />
      </PendingProvider>
    </form>
  );
}
