import { readFileSync, writeFileSync } from "fs";

const bumpStyle = process.argv[2] || "patch";
// Whether the caller explicitly requested an RC bump (controls appending -rcN)
const rcBumpRequested = bumpStyle === "rc" || process.argv[3] === "rc";
const packagePaths = [
  "packages/open-tts/package.json",
  "packages/ui/package.json",
  "packages/obsidian/package.json",
  "packages/web/package.json",
];
const pkg = JSON.parse(readFileSync("packages/obsidian/package.json", "utf8"));
const pkgVersion = pkg.version.split(/[\\.\\-]/g);
let targetVersion;
if (bumpStyle === "major") {
  pkgVersion[0] = `${Number.parseInt(pkgVersion[0]) + 1}`;
  pkgVersion[1] = "0";
  pkgVersion[2] = "0";
  targetVersion = pkgVersion.slice(0, 3).join(".");
} else if (bumpStyle === "minor") {
  pkgVersion[1] = `${Number.parseInt(pkgVersion[1]) + 1}`;
  pkgVersion[2] = "0";
  targetVersion = pkgVersion.slice(0, 3).join(".");
} else if (bumpStyle === "patch") {
  pkgVersion[2] = `${Number.parseInt(pkgVersion[2]) + 1}`;
  targetVersion = pkgVersion.slice(0, 3).join(".");
} else if (bumpStyle === "specified") {
  targetVersion = process.argv[3];
} else {
  targetVersion = pkgVersion.slice(0, 3).join(".");
}

if (rcBumpRequested) {
  const current = pkgVersion[3]
    ? Number.parseInt(pkgVersion[3].match(/\d+/))
    : 0;
  targetVersion += `-rc${current + 1}`;
}

// update package versions
for (const packagePath of packagePaths) {
  const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));
  packageJson.version = targetVersion;
  writeFileSync(packagePath, JSON.stringify(packageJson, null, 2));
}

// Only update manifest.json and versions.json for full releases, not pre-releases
// Detect prerelease by inspecting the computed target version (handles specified versions like 1.2.3-rc1)
const isPreRelease = /-(?:rc|alpha|beta)/i.test(targetVersion);
if (!isPreRelease) {
  // read minAppVersion from manifest.json and bump version to target version
  const manifest = JSON.parse(
    readFileSync("packages/obsidian/manifest.json", "utf8"),
  );
  const { minAppVersion } = manifest;
  manifest.version = targetVersion;
  writeFileSync(
    "packages/obsidian/manifest.json",
    JSON.stringify(manifest, null, 2),
  );

  // update versions.json with target version and minAppVersion from manifest.json
  const versions = JSON.parse(
    readFileSync("packages/obsidian/versions.json", "utf8"),
  );
  versions[targetVersion] = manifest.minAppVersion;
  writeFileSync(
    "packages/obsidian/versions.json",
    JSON.stringify(versions, null, 2),
  );
}
