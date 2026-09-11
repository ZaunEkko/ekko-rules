import assert from "node:assert/strict";
import test from "node:test";
import {
  applyIncrement,
  currentDay,
  parseMetrics,
  rollOver,
  type Metrics,
} from "./metrics";

const base: Metrics = {
  day: "2026-09-12",
  visitsToday: 3,
  visitsTotal: 30,
  conversionsToday: 2,
  conversionsTotal: 20,
};

test("uses the audience's day, not the server timezone", () => {
  // 2026-09-11T17:00Z is already the 12th at UTC+8.
  assert.equal(currentDay(Date.parse("2026-09-11T17:00:00Z")), "2026-09-12");
  assert.equal(currentDay(Date.parse("2026-09-11T15:59:00Z")), "2026-09-11");
});

test("a new day zeroes only the daily figures", () => {
  const rolled = rollOver(base, "2026-09-13");
  assert.deepEqual(rolled, {
    day: "2026-09-13",
    visitsToday: 0,
    visitsTotal: 30,
    conversionsToday: 0,
    conversionsTotal: 20,
  });
  assert.equal(rollOver(base, "2026-09-12"), base);
});

test("each kind advances its own pair", () => {
  const visited = applyIncrement(base, "visit", "2026-09-12");
  assert.equal(visited.visitsToday, 4);
  assert.equal(visited.visitsTotal, 31);
  assert.equal(visited.conversionsToday, 2);

  const converted = applyIncrement(base, "conversion", "2026-09-12");
  assert.equal(converted.conversionsToday, 3);
  assert.equal(converted.conversionsTotal, 21);
  assert.equal(converted.visitsToday, 3);
});

test("an increment on a new day starts the daily count at one", () => {
  const next = applyIncrement(base, "conversion", "2026-09-13");
  assert.equal(next.day, "2026-09-13");
  assert.equal(next.conversionsToday, 1);
  assert.equal(next.conversionsTotal, 21);
  assert.equal(next.visitsToday, 0);
});

test("a damaged or hostile file cannot produce nonsense counters", () => {
  assert.deepEqual(parseMetrics(null), {
    day: "",
    visitsToday: 0,
    visitsTotal: 0,
    conversionsToday: 0,
    conversionsTotal: 0,
  });
  const parsed = parseMetrics({
    day: 7,
    visitsToday: -5,
    visitsTotal: "many",
    conversionsToday: 2.7,
    conversionsTotal: Number.POSITIVE_INFINITY,
  });
  assert.deepEqual(parsed, {
    day: "",
    visitsToday: 0,
    visitsTotal: 0,
    conversionsToday: 2,
    conversionsTotal: 0,
  });
});
