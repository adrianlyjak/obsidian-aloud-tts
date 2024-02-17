import { readFileSync, writeFileSync } from "fs";

const bumpStyle = process.argv[2] || "patch";
const releaseCandidate = bumpStyle === "rc" || process.argv[3] === "rc";
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
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

if (releaseCandidate) {
  const current = pkgVersion[3]
    ? Number.parseInt(pkgVersion[3].match(/\d+/))
    : 0;
  targetVersion += `-rc${current + 1}`;
}

// update package.json
pkg.version = targetVersion;
writeFileSync("package.json", JSON.stringify(pkg, null, 2));

// read minAppVersion from manifest.json and bump version to target version
const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
const { minAppVersion } = manifest;
manifest.version = targetVersion;
writeFileSync("manifest.json", JSON.stringify(manifest, null, 2));

// update versions.json with target version and minAppVersion from manifest.json
const versions = JSON.parse(readFileSync("versions.json", "utf8"));
versions[targetVersion] = minAppVersion;
writeFileSync("versions.json", JSON.stringify(versions, null, 2));
