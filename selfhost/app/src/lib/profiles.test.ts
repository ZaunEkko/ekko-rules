import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  createStoredProfile,
  deleteStoredProfile,
  listStoredProfiles,
  publicProfile,
  readStoredProfile,
} from "./profiles";

async function withProfileDirectory(run: (directory: string) => Promise<void>) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "ekko-profile-"));
  const previous = process.env.PROFILE_DATA_DIR;
  process.env.PROFILE_DATA_DIR = directory;
  try {
    await run(directory);
  } finally {
    if (previous === undefined) delete process.env.PROFILE_DATA_DIR;
    else process.env.PROFILE_DATA_DIR = previous;
    await rm(directory, { recursive: true, force: true });
  }
}

test("stores the private source behind an opaque restart-safe profile id", () =>
  withProfileDirectory(async (directory) => {
    const profile = await createStoredProfile({
      name: "我的 Mihomo",
      subscriptionUrl: "https://example.com/private-subscription?token=secret",
      target: "clash",
      options: {
        autoUpdate: true,
        emoji: true,
        udp: true,
        xudp: false,
        tfo: false,
        skipCertVerify: false,
        tls13: false,
        sort: false,
        filterUnsupported: true,
        appendType: false,
        include: "香港",
        exclude: "",
        rename: "",
        customUserAgent: "private-client-token",
        updateIntervalHours: 12,
        singboxIpv6: false,
      },
    });

    assert.match(profile.id, /^[A-Za-z0-9_-]{32}$/);
    const visible = publicProfile(profile);
    assert.equal(JSON.stringify(visible).includes("secret"), false);
    assert.equal(JSON.stringify(visible).includes("private-client-token"), false);
    assert.equal(visible.enabledOptionCount, 6);
    assert.equal(visible.subscriptionPath, `/sub/${profile.id}`);
    assert.equal(visible.downloadPath, `/sub/${profile.id}?download=1`);

    const stored = await readStoredProfile(profile.id);
    assert.deepEqual(stored, profile);
    const disk = await readFile(path.join(directory, `${profile.id}.json`), "utf8");
    assert.equal(disk.includes("private-subscription"), true);
  }));

test("loads version 1 profiles with current option defaults", () =>
  withProfileDirectory(async (directory) => {
    const id = "B".repeat(32);
    await writeFile(
      path.join(directory, `${id}.json`),
      `${JSON.stringify({
        version: 1,
        id,
        name: "旧档案",
        subscriptionUrl: "https://example.com/legacy",
        target: "clash",
        createdAt: "2026-08-07T00:00:00.000Z",
      })}\n`,
      "utf8",
    );

    const profile = await readStoredProfile(id);
    assert.equal(profile.version, 3);
    assert.equal(profile.options.emoji, true);
    assert.equal(profile.options.autoUpdate, false);
    assert.equal(profile.options.updateIntervalHours, 24);
  }));

test("migrates version 2 interval settings to the explicit update switch", () =>
  withProfileDirectory(async (directory) => {
    const id = "C".repeat(32);
    await writeFile(
      path.join(directory, `${id}.json`),
      `${JSON.stringify({
        version: 2,
        id,
        name: "旧版定时档案",
        subscriptionUrl: "https://example.com/legacy-v2",
        target: "clash",
        options: { updateIntervalHours: 12 },
        createdAt: "2026-08-07T00:00:00.000Z",
      })}\n`,
      "utf8",
    );

    const profile = await readStoredProfile(id);
    assert.equal(profile.version, 3);
    assert.equal(profile.options.autoUpdate, true);
    assert.equal(profile.options.updateIntervalHours, 12);
  }));

test("lists public metadata, skips corrupt files, and deletes profiles", () =>
  withProfileDirectory(async (directory) => {
    const profile = await createStoredProfile({
      subscriptionUrl: "https://example.com/subscription",
      target: "singbox",
    });
    await writeFile(path.join(directory, `${"A".repeat(32)}.json`), "{}\n", "utf8");

    const listed = await listStoredProfiles();
    assert.equal(listed.length, 1);
    assert.equal(listed[0].id, profile.id);
    assert.equal(JSON.stringify(listed).includes("example.com"), false);

    await deleteStoredProfile(profile.id);
    await assert.rejects(() => readStoredProfile(profile.id), /not found/i);
  }));

test("rejects malformed ids and oversized names", () =>
  withProfileDirectory(async () => {
    await assert.rejects(() => readStoredProfile("../escape"), /not found/i);
    await assert.rejects(
      () =>
        createStoredProfile({
          name: "x".repeat(51),
          subscriptionUrl: "https://example.com/subscription",
          target: "clash",
        }),
      /50 characters/i,
    );
  }));
