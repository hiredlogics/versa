"use client";

import { useEffect } from "react";

const FIRST_USER_MESSAGE = "You've created your first user!";

function findToast(message: string): HTMLElement | null {
  const elements = document.querySelectorAll<HTMLElement>("body *");

  for (const element of elements) {
    if (element.textContent?.trim() !== message) continue;

    let current: HTMLElement | null = element;
    while (current) {
      if (current.getAttribute("role") === "alert" || current.getAttribute("role") === "status") {
        return current;
      }

      const position = window.getComputedStyle(current).position;
      if (position === "fixed" || position === "sticky") return current;

      current = current.parentElement;
    }
  }

  return null;
}

/**
 * Clerk shows this one-time development-mode notice when running without
 * configured instance keys. Keep it visible briefly, then dismiss it so it
 * does not cover application controls.
 */
export function ClerkFirstUserToastDismissal() {
  useEffect(() => {
    const dismissed = new WeakSet<HTMLElement>();

    const dismissFirstUserToast = () => {
      const toast = findToast(FIRST_USER_MESSAGE);
      if (!toast || dismissed.has(toast)) return;

      dismissed.add(toast);
      window.setTimeout(() => {
        toast.style.transition = "opacity 150ms ease";
        toast.style.opacity = "0";
        window.setTimeout(() => toast.remove(), 150);
      }, 5_000);
    };

    dismissFirstUserToast();
    const observer = new MutationObserver(dismissFirstUserToast);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, []);

  return null;
}
