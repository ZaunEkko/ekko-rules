import { randomBytes, randomUUID } from "node:crypto";
import {
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { isSupportedTarget, type TargetFormat } from "./capabilities";
import {
  countEnabledOptions,
  parseConvertOptions,
  type ConvertOptions,
} from "./options";

const PROFILE_ID_PATTERN = /^[A-Za-z0-9_-]{32}$/;

export type StoredProfile = {
  version: 3;
  id: string;
  name: string;
  subscriptionUrl: string;
  target: TargetFormat;
  options: ConvertOptions;
  createdAt: string;
};

export type PublicProfile = Omit<
  StoredProfile,
  "subscriptionUrl" | "version" | "options"
> & {
  subscriptionPath: string;
  downloadPath: string;
  enabledOptionCount: number;
};

function profileDataDir(): string {
  return process.env.PROFILE_DATA_DIR?.trim() || path.join(process.cwd(), ".data");
}

function assertProfileId(id: string): void {
  if (!PROFILE_ID_PATTERN.test(id)) {
    throw new Error("Profile not found.");
  }
}

function profilePath(id: string): string {
  assertProfileId(id);
  return path.join(profileDataDir(), `${id}.json`);
}

function cleanName(name: string | undefined, target: TargetFormat): string {
  const value = (name || "").replace(/[\u0000-\u001f\u007f]/g, "").trim();
  if (value.length > 50) {
    throw new Error("Profile name must be 50 characters or fewer.");
  }
  return value || `${target} 本地订阅`;
}

function parseStoredProfile(raw: string, expectedId: string): StoredProfile {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("Stored profile is invalid.");
  }

  if (!value || typeof value !== "object") {
    throw new Error("Stored profile is invalid.");
  }

  const profile = value as Record<string, unknown>;
  if (
    (profile.version !== 1 && profile.version !== 2 && profile.version !== 3) ||
    profile.id !== expectedId ||
    typeof profile.name !== "string" ||
    typeof profile.subscriptionUrl !== "string" ||
    typeof profile.target !== "string" ||
    !isSupportedTarget(profile.target) ||
    typeof profile.createdAt !== "string"
  ) {
    throw new Error("Stored profile is invalid.");
  }

  let storedOptions: unknown = undefined;
  if (profile.version === 3) {
    storedOptions = profile.options;
  } else if (profile.version === 2) {
    const legacy =
      profile.options && typeof profile.options === "object"
        ? { ...(profile.options as Record<string, unknown>) }
        : {};
    const legacyInterval = legacy.updateIntervalHours;
    storedOptions = {
      ...legacy,
      autoUpdate: legacyInterval !== 0,
      updateIntervalHours: legacyInterval === 0 ? 24 : legacyInterval,
    };
  }

  return {
    version: 3,
    id: profile.id,
    name: profile.name,
    subscriptionUrl: profile.subscriptionUrl,
    target: profile.target,
    options: parseConvertOptions(storedOptions),
    createdAt: profile.createdAt,
  } as StoredProfile;
}

export async function createStoredProfile(input: {
  name?: string;
  subscriptionUrl: string;
  target: TargetFormat;
  options?: ConvertOptions;
}): Promise<StoredProfile> {
  const directory = profileDataDir();
  await mkdir(directory, { recursive: true, mode: 0o700 });

  const id = randomBytes(24).toString("base64url");
  const profile: StoredProfile = {
    version: 3,
    id,
    name: cleanName(input.name, input.target),
    subscriptionUrl: input.subscriptionUrl,
    target: input.target,
    options: parseConvertOptions(input.options),
    createdAt: new Date().toISOString(),
  };
  const destination = profilePath(id);
  const temporary = path.join(directory, `.${id}.${randomUUID()}.tmp`);

  try {
    await writeFile(temporary, `${JSON.stringify(profile)}\n`, {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx",
    });
    await rename(temporary, destination);
  } finally {
    await rm(temporary, { force: true });
  }

  return profile;
}

export async function readStoredProfile(id: string): Promise<StoredProfile> {
  try {
    const raw = await readFile(profilePath(id), "utf8");
    return parseStoredProfile(raw, id);
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      throw new Error("Profile not found.");
    }
    throw error;
  }
}

export async function deleteStoredProfile(id: string): Promise<void> {
  try {
    await rm(profilePath(id));
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      throw new Error("Profile not found.");
    }
    throw error;
  }
}

export function publicProfile(profile: StoredProfile): PublicProfile {
  const encoded = encodeURIComponent(profile.id);
  return {
    id: profile.id,
    name: profile.name,
    target: profile.target,
    createdAt: profile.createdAt,
    subscriptionPath: `/sub/${encoded}`,
    downloadPath: `/sub/${encoded}?download=1`,
    enabledOptionCount: countEnabledOptions(profile.options),
  };
}

export async function listStoredProfiles(): Promise<PublicProfile[]> {
  const directory = profileDataDir();
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const names = await readdir(directory);
  const profiles = await Promise.all(
    names
      .filter((name) => /^[A-Za-z0-9_-]{32}\.json$/.test(name))
      .map(async (name) => {
        const id = name.slice(0, -5);
        try {
          return publicProfile(await readStoredProfile(id));
        } catch {
          return null;
        }
      }),
  );
  return profiles
    .filter((profile): profile is PublicProfile => profile !== null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
