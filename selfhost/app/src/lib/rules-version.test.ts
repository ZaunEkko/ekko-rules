import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import test from "node:test";
import {
  readEngineRulesVersion,
  resetEngineRulesVersionCacheForTests,
} from "./rules-version";

async function withEngine(
  handler: (url: string) => Promise<void>,
  respond: (path: string) => { status: number; body: string },
): Promise<number> {
  let hits = 0;
  const server: Server = createServer((request, response) => {
    hits += 1;
    const { status, body } = respond(request.url || "/");
    response.writeHead(status, { "content-type": "application/json" });
    response.end(body);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  try {
    await handler(`http://127.0.0.1:${port}`);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
  return hits;
}

test("reads the version the running engine reports", async () => {
  resetEngineRulesVersionCacheForTests();
  let path = "";
  const hits = await withEngine(
    async (url) => {
      assert.deepEqual(await readEngineRulesVersion(url), {
        version: "1.2.3",
        built: "2026-09-21",
      });
      // Concurrent and repeat callers share one answer: this runs on every
      // page load, and the number does not change on its own.
      assert.deepEqual(await readEngineRulesVersion(url), {
        version: "1.2.3",
        built: "2026-09-21",
      });
    },
    (requested) => {
      path = requested;
      return {
        status: 200,
        body: JSON.stringify({ version: "1.2.3", built: "2026-09-21" }),
      };
    },
  );
  assert.equal(path, "/rules-version.json");
  assert.equal(hits, 1);
});

test("says nothing rather than something it cannot stand behind", async () => {
  // An engine that is starting, older than this file, or answering with
  // something else has no version to report — and a page that invents one is
  // worse than a page that leaves the number out.
  for (const answer of [
    { status: 404, body: "not found" },
    { status: 200, body: "<html>nope</html>" },
    { status: 200, body: JSON.stringify({ version: "" }) },
    { status: 200, body: JSON.stringify({ version: "1.2.3 && rm -rf /" }) },
    { status: 200, body: JSON.stringify({ other: "1.2.3" }) },
  ]) {
    resetEngineRulesVersionCacheForTests();
    await withEngine(async (url) => {
      assert.equal(await readEngineRulesVersion(url), null);
    }, () => answer);
  }
});

test("keeps a malformed build date out of the page", async () => {
  resetEngineRulesVersionCacheForTests();
  await withEngine(
    async (url) => {
      assert.deepEqual(await readEngineRulesVersion(url), {
        version: "1.2.3",
        built: "",
      });
    },
    () => ({
      status: 200,
      body: JSON.stringify({ version: "1.2.3", built: "昨天" }),
    }),
  );
});

test("an unreachable engine is not an error", async () => {
  resetEngineRulesVersionCacheForTests();
  // Port 1 on loopback refuses immediately, which is the unreachable case.
  assert.equal(await readEngineRulesVersion("http://127.0.0.1:1"), null);
});
