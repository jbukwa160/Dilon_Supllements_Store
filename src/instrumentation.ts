// Runs once when a Next.js server process starts (`next start`, `next dev`; not during `next build`).
// Starts the background jobs: scheduled price changes + page refresh, e-mail retries, daily clean-up (lib/scheduler.ts).
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NEXT_PHASE === "phase-production-build") return;
  // Opt-out for a second process sharing the same data folder (only one should run the jobs), and for tests.
  if (process.env.DISABLE_SCHEDULER === "1") return;
  const { startScheduler } = await import("./lib/scheduler");
  startScheduler();
}
