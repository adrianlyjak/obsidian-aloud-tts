import { describe, it, expect } from "vitest";
import { locateInSource } from "./locateInSource";

describe("locateInSource", () => {
  it("finds rendered text in markdown source despite formatting and link syntax", () => {
    const source =
      "# Title\n\nRead the **bold** claim in [[Zettels should be atomic|linked note]] now.";
    const found = locateInSource(source, "bold claim in linked note", 0);
    expect(found && source.slice(found.start, found.end)).toEqual(
      "bold** claim in [[Zettels should be atomic|linked note",
    );
  });

  it("searches from the given offset, so a repeated line resolves to the selected copy", () => {
    const source = "Same line here.\n\nSame line here.";
    const second = source.lastIndexOf("Same");
    expect(locateInSource(source, "Same line here.", second)?.start).toEqual(
      second,
    );
  });
});
