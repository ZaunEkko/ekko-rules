#!/usr/bin/env node
import {
  copyFileSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const sourceIni = path.join(root, "generated/reversed-profile/config/ekko-rules.ini");
const sourceRules = path.join(root, "generated/reversed-profile/Ruleset");
const destIni = path.join(root, "selfhost/subconverter/config/ekko-rules-selfhost.ini");
const destRules = path.join(root, "selfhost/subconverter/rulesets");

mkdirSync(destRules, { recursive: true });

const lines = readFileSync(sourceIni, "utf8").split(/\r?\n/);
const out = [];
let insertedBase = false;
for (const line of lines) {
  if (line.startsWith("ruleset=") && line.includes(",https://")) {
    const [left, url] = line.split(",", 2);
    const name = url.split("/").pop();
    out.push(`${left},rulesets/${name}`);
    continue;
  }
  if (!insertedBase && line.startsWith("enable_rule_generator=")) {
    out.push("clash_rule_base=base/ekko-rules-base.yaml");
    out.push("singbox_rule_base=base/singbox.json");
    out.push("surge_rule_base=base/surge.conf");
    out.push("quanx_rule_base=base/quanx.conf");
    out.push("loon_rule_base=base/loon.conf");
    out.push("surfboard_rule_base=base/surfboard.conf");
    out.push("quan_rule_base=base/quan.conf");
    out.push("mellow_rule_base=base/mellow.conf");
    out.push("");
    insertedBase = true;
  }
  out.push(line);
}
writeFileSync(destIni, `${out.join("\n").replace(/\n+$/, "\n")}`, "utf8");

const sourceRuleNames = readdirSync(sourceRules)
  .filter((name) => name.endsWith(".list"))
  .sort();
const sourceRuleSet = new Set(sourceRuleNames);
let pruned = 0;
for (const name of readdirSync(destRules)) {
  if (!name.endsWith(".list") || sourceRuleSet.has(name)) continue;
  rmSync(path.join(destRules, name));
  pruned += 1;
}

let copied = 0;
for (const name of sourceRuleNames) {
  copyFileSync(path.join(sourceRules, name), path.join(destRules, name));
  copied += 1;
}

console.log(
  JSON.stringify(
    {
      ini: path.relative(root, destIni).replaceAll("\\", "/"),
      rulesets: copied,
      pruned,
      complete_config_bases: 8,
    },
    null,
    2,
  ),
);
