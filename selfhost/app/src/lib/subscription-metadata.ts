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

export function subscriptionMetadataHeaders(
  profileName: string,
  resultFilename: string,
): Record<string, string> {
  const name = safeProfileName(profileName);
  const extensionMatch = resultFilename.match(/(\.[A-Za-z0-9]+)$/);
  const extension = extensionMatch?.[1] || ".yaml";
  const unicodeFilename = `${name}${extension}`;
  const fallbackFilename = `${asciiFilename(name)}${extension}`;

  return {
    "Profile-Title": `base64:${Buffer.from(name, "utf8").toString("base64")}`,
    "Content-Disposition":
      `attachment; filename="${fallbackFilename}"; ` +
      `filename*=UTF-8''${rfc5987(unicodeFilename)}`,
  };
}
