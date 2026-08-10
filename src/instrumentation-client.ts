// instrumentation-client.js
import { schedulePosthogLoad } from "@/lib/posthog-client";

const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
if (posthogKey) {
  schedulePosthogLoad(() => {});
}
