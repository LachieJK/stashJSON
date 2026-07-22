"use client";

import { useEffect, useRef } from "react";

/*
 * A form error that actually reaches everyone: role="alert" announces it, and
 * focus moves to it so a keyboard/screen-reader user lands on the explanation
 * instead of being left on the submit button wondering what happened. Keyed on
 * `message` so a second failure re-announces even if the text is unchanged.
 *
 * role="alert" carries its own live region — no aria-live here, which would
 * only fight it and risk double announcement alongside the focus move.
 */
export function AuthError({ message }: { message: string }) {
  const ref = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, [message]);

  return (
    <p
      ref={ref}
      role="alert"
      tabIndex={-1}
      className="notice notice-error outline-none"
    >
      {message}
    </p>
  );
}
