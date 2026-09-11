import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";

/**
 * Four running totals, and nothing else.
 *
 * The open station tells visitors it keeps nothing. Counters are the one
 * exception, so they are built to keep that statement true: no address, no
 * identifier, no per-visit record — four integers and the day they belong to.
 * Nothing here can be traced back to a person or to a subscription.
 */

export type Metrics = {
  day: string;
  visitsToday: number;
  visitsTotal: number;
  conversionsToday: number;
  conversionsTotal: number;
};

export type MetricKind = "visit" | "conversion";

const EMPTY: Metrics = {
  day: "",
  visitsToday: 0,
  visitsTotal: 0,
  conversionsToday: 0,
  conversionsTotal: 0,
};

/** "Today" is the audience's day, not the server's timezone. */
export function currentDay(nowMs = Date.now(), offsetMinutes = 480): string {
  return new Date(nowMs + offsetMinutes * 60_000).toISOString().slice(0, 10);
}

function sanitizeCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : 0;
}

export function parseMetrics(raw: unknown): Metrics {
  if (!raw || typeof raw !== "object") return { ...EMPTY };
  const value = raw as Record<string, unknown>;
  return {
    day: typeof value.day === "string" ? value.day : "",
    visitsToday: sanitizeCount(value.visitsToday),
    visitsTotal: sanitizeCount(value.visitsTotal),
    conversionsToday: sanitizeCount(value.conversionsToday),
    conversionsTotal: sanitizeCount(value.conversionsTotal),
  };
}

/** A new day zeroes the daily figures without touching the running totals. */
export function rollOver(metrics: Metrics, day: string): Metrics {
  if (metrics.day === day) return metrics;
  return { ...metrics, day, visitsToday: 0, conversionsToday: 0 };
}

export function applyIncrement(
  metrics: Metrics,
  kind: MetricKind,
  day: string,
): Metrics {
  const rolled = rollOver(metrics, day);
  if (kind === "visit") {
    return {
      ...rolled,
      visitsToday: rolled.visitsToday + 1,
      visitsTotal: rolled.visitsTotal + 1,
    };
  }
  return {
    ...rolled,
    conversionsToday: rolled.conversionsToday + 1,
    conversionsTotal: rolled.conversionsTotal + 1,
  };
}

function metricsPath(directory: string): string {
  return path.join(directory, "metrics.json");
}

export async function readMetrics(directory: string): Promise<Metrics> {
  try {
    const raw = await readFile(metricsPath(directory), "utf8");
    return rollOver(parseMetrics(JSON.parse(raw)), currentDay());
  } catch {
    return { ...EMPTY, day: currentDay() };
  }
}

// One container, so a promise chain is enough to keep concurrent conversions
// from clobbering each other's read-modify-write.
let queue: Promise<unknown> = Promise.resolve();

export async function recordMetric(
  directory: string,
  kind: MetricKind,
): Promise<void> {
  const run = queue.then(async () => {
    let current: Metrics;
    try {
      current = parseMetrics(
        JSON.parse(await readFile(metricsPath(directory), "utf8")),
      );
    } catch {
      current = { ...EMPTY };
    }
    const next = applyIncrement(current, kind, currentDay());

    await mkdir(directory, { recursive: true, mode: 0o700 });
    const temporary = path.join(directory, `.metrics.${randomUUID()}.tmp`);
    try {
      await writeFile(temporary, `${JSON.stringify(next)}\n`, {
        encoding: "utf8",
        mode: 0o600,
      });
      await rename(temporary, metricsPath(directory));
    } finally {
      await rm(temporary, { force: true });
    }
  });
  // A counter must never be able to fail a conversion.
  queue = run.catch(() => undefined);
  await queue;
}
