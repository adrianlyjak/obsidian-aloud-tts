import { describe, it, expect } from "vitest";
import { findTextRange } from "./findTextRange";

function render(html: string): HTMLElement {
  const root = document.createElement("div");
  root.innerHTML = html;
  return root;
}

describe("findTextRange", () => {
  it("finds a sentence split across inline formatting", () => {
    const root = render(
      "<p>Read the <a>linked note</a> and <b>this</b> too.</p>",
    );
    const range = findTextRange(root, "Read the linked note and this too.");
    expect(range?.toString()).toEqual("Read the linked note and this too.");
  });

  it("matches spoken text across block elements with no space between them", () => {
    const root = render(
      "<h1>First Section</h1><p>This is the first section.</p>",
    );
    const range = findTextRange(
      root,
      "First Section\n\nThis is the first section.",
    );
    expect(range?.startContainer.parentElement?.tagName).toEqual("H1");
    expect(range?.endContainer.parentElement?.tagName).toEqual("P");
    expect(range?.toString()).toEqual(
      "First SectionThis is the first section.",
    );
  });

  it("skips embed titles and the properties panel", () => {
    const root = render(
      '<div class="embed-title">First Section</div>' +
        '<div class="metadata-container">Properties Add property</div>' +
        "<h1>First Section</h1><p>Body.</p>",
    );
    const heading = findTextRange(root, "First Section");
    expect(heading?.startContainer.parentElement?.tagName).toEqual("H1");
    expect(findTextRange(root, "Add property")).toBeNull();
  });

  it("finds a repeated sentence after an earlier match", () => {
    const root = render("<p>Say it again.</p><p>Say it again.</p>");
    const first = findTextRange(root, "Say it again.")!;
    const second = findTextRange(root, "Say it again.", { after: first });
    expect(second?.startContainer).toBe(
      root.querySelectorAll("p")[1].firstChild,
    );
  });
});
