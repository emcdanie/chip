#!/usr/bin/env node
// second-review: a second model (Copilot CLI, no write or shell tools) challenges
// a plan file or a diff. Prints its answer; a finding is a claim until someone
// has measured it. Scans what it would send against the NDA terms and refuses on a match.
//
// Run: npm run review -- <plan.md>
//      npm run review -- <git range> [repo path]
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";

const [target, repoArg] = process.argv.slice(2);
if (!target) {
  console.error("usage: npm run review -- <plan.md> | <git range> [repo path]");
  process.exit(1);
}
const isPlan = target.endsWith(".md") && existsSync(target);
const repo = resolve(repoArg ?? ".");
const content = isPlan
  ? readFileSync(target, "utf8")
  : execFileSync("git", ["-C", repo, "diff", target], { encoding: "utf8", maxBuffer: 64e6 });
if (!content.trim()) {
  console.error(`second-review: nothing to review in ${target}`);
  process.exit(1);
}

const terms = readFileSync(`${homedir()}/.claude/nda-terms.txt`, "utf8")
  .split("\n")
  .map((t) => t.trim())
  .filter((t) => t && !t.startsWith("#"));
const escape = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const hits = terms.filter((t) => new RegExp(`\\b${escape(t)}\\b`, "i").test(content));
if (hits.length) {
  console.error(`second-review: refused, nothing sent. NDA terms matched: ${hits.join(", ")}`);
  process.exit(2);
}

const rules =
  "CHIP is an app built from the BELLA design system: BELLA components and tokens only, no hex or px font sizes in app/src, a 16px type floor, 44px targets, BELLA's focus ring and components not restyled.";
const ask = isPlan
  ? "Review this plan. List what is wrong or missing: a step that will not work, a risk it ignores, an unstated dependency, or a cheaper route to the same result."
  : "Review this diff. You may read files in this repo to check claims. List only real defects: wrong behaviour, a broken rule, a regression, or something the change claims but does not do.";
const prompt = `You are a senior design-system engineer. ${rules} ${ask} For each give the location, what breaks and in which situation, and your confidence (high, medium or low). No style opinions, praise or summary. If you find nothing, say so.\n\n${content}`;

let token = process.env.GH_TOKEN;
if (!token) {
  try {
    token = execFileSync("gh", ["auth", "token"], { encoding: "utf8" }).trim();
  } catch {}
}
const run = spawnSync(
  "copilot",
  ["-p", prompt, "-s", "--no-color", "--allow-all-tools", "--deny-tool", "write", "--deny-tool", "shell"],
  { cwd: repo, encoding: "utf8", env: { ...process.env, ...(token ? { GH_TOKEN: token } : {}) }, maxBuffer: 16e6 },
);
const review = (run.stdout ?? "").trim();
if (run.error || run.status !== 0 || !review) {
  const why = run.error ? "Copilot CLI not found" : `no review returned (exit ${run.status}; quota or sign-in?)`;
  console.error(`second-review: NOT REVIEWED. ${why}`);
  process.exit(1);
}
console.log(review);
