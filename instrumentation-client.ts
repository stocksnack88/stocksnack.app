import * as Sentry from "@sentry/nextjs";

// Instrument client-side navigations (required by Sentry v10+).
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;

const consentDeclined =
  typeof window !== "undefined" &&
  localStorage.getItem("cookie-consent") === "declined";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.2,
  // Session replay: never record background sessions (avoids shipping rrweb
  // to every visitor). Only activate on errors for consenting users.
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: consentDeclined ? 0 : 1.0,
  integrations: [
    Sentry.replayIntegration({ maskAllText: true, blockAllMedia: true }),
  ],
  debug: false,
});
