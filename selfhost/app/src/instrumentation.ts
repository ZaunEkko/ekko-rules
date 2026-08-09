export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { cleanupOrphanedConversionInputs, safeLog } = await import(
    "./lib/convert"
  );
  const removed = await cleanupOrphanedConversionInputs();
  if (removed > 0) {
    safeLog("conversion.orphan_cleanup", { removed });
  }
}
