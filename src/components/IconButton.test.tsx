import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { IconButton, IconSpan } from "./IconButton";

// Mock obsidian functions
vi.mock("obsidian", () => ({
  setIcon: vi.fn(),
  setTooltip: vi.fn(),
}));

describe("IconButton Components", () => {
  describe("IconButton", () => {
    it("should render and handle click", async () => {
      const user = userEvent.setup();
      const mockClick = vi.fn();

      render(
        <IconButton icon="play" onClick={mockClick} tooltip="Play audio" />,
      );

      const button = screen.getByRole("button");
      expect(button).toBeDefined();

      await user.click(button);
      expect(mockClick).toHaveBeenCalledOnce();
    });

    it("should handle disabled state", () => {
      const mockClick = vi.fn();

      render(<IconButton icon="play" onClick={mockClick} disabled={true} />);

      const button = screen.getByRole("button");
      expect(button).toHaveProperty("disabled", true);
    });
  });

  describe("IconSpan", () => {
    it("should render with icon", () => {
      render(<IconSpan icon="pause" />);

      const span = document.querySelector("span");
      expect(span).toBeTruthy();
    });
  });
});
