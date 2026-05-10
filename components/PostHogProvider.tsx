"use client";

import posthog from "posthog-js";
import { useEffect } from "react";

let initialized = false;

function initPostHog() {
  if (initialized || process.env.NODE_ENV === "development") return;
  initialized = true;
  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
    api_host: "https://app.posthog.com",
  });
}

function hasConsent() {
  return (
    document.cookie
      .split("; ")
      .find((r) => r.startsWith("cookie-consent="))
      ?.split("=")[1] === "true"
  );
}

export default function PostHogProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (hasConsent()) initPostHog();

    const handler = () => initPostHog();
    window.addEventListener("cookie-consent-accepted", handler);
    return () => window.removeEventListener("cookie-consent-accepted", handler);
  }, []);

  return <>{children}</>;
}
