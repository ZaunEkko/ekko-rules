function safeProfileName(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f/\\]/g, "-").trim() || "ekko-rules";
}

function asciiFilename(value: string): string {
  const normalized = value
    .normalize("NFKD")
    .replace(/[^\x20-\x7e]/g, "")
    .replace(/["\\/;=]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  return normalized || "ekko-rules";
}

function rfc5987(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

/**
 * A subscription is not a file the user saves. Clients name the profile after
 * whatever filename the response hands them, extension and all, which is how a
 * profile ends up listed as "ekko-rules.yaml" instead of "ekko-rules". So the
 * name published here carries no extension; the explicit download button
 * (`/api/convert`) still sends a real filename, because that one really is a
 * file.
 */
export function subscriptionMetadataHeaders(
  profileName: string,
): Record<string, string> {
  const name = safeProfileName(profileName);

  return {
    "Profile-Title": `base64:${Buffer.from(name, "utf8").toString("base64")}`,
    "Content-Disposition":
      `attachment; filename="${asciiFilename(name)}"; ` +
      `filename*=UTF-8''${rfc5987(name)}`,
  };
}
