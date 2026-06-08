import * as Sentry from "@sentry/nextjs";

const consentDeclined =
  typeof window !== "undefined" &&
  localStorage.getItem("cookie-consent") === "declined";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.2,
  // Session recordings respect cookie consent — error tracking always on
  replaysOnErrorSampleRate: consentDeclined ? 0 : 1.0,
  replaysSessionSampleRate: consentDeclined ? 0 : 0.05,
  integrations: [
    Sentry.replayIntegration({ maskAllText: true, blockAllMedia: true }),
  ],
  debug: false,
});

// Dynamically start/stop replay if user changes consent mid-session
if (typeof window !== "undefined") {
  window.addEventListener("cookie-consent-accepted", () => {
    Sentry.getReplay()?.start();
  });
  window.addEventListener("cookie-consent-declined", () => {
    Sentry.getReplay()?.stop();
  });
}
