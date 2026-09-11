export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { cleanupOrphanedConversionInputs, getRuntimeConfig, safeLog } =
    await import("./lib/convert");

  const runtime = getRuntimeConfig();
  safeLog("service.start", {
    deployMode: runtime.deployMode,
    accessPasswordConfigured: Boolean(runtime.accessPassword),
    manageRateLimitPerMinute: runtime.manageRateLimitPerMinute,
    subscribeRateLimitPerMinute: runtime.subscribeRateLimitPerMinute,
  });
  // Public deployments stay reachable so existing fixed URLs keep updating,
  // but every management endpoint refuses until the operator fixes this.
  if (runtime.deploymentError) {
    safeLog("service.deployment_blocked", { error: runtime.deploymentError });
  }
  if (runtime.deploymentWarning) {
    safeLog("service.deployment_warning", { warning: runtime.deploymentWarning });
  }

  const removed = await cleanupOrphanedConversionInputs();
  if (removed > 0) {
    safeLog("conversion.orphan_cleanup", { removed });
  }
}
