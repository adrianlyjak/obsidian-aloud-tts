// The CSS Custom Highlight API isn't in this TypeScript version's DOM types, so
// this wraps the two parts used here.

interface HighlightRegistry {
  set(name: string, highlight: unknown): unknown;
  delete(name: string): boolean;
}

type HighlightConstructor = new (...ranges: Range[]) => unknown;

interface WindowWithHighlights {
  CSS?: { highlights?: HighlightRegistry };
  Highlight?: HighlightConstructor;
}

/** Paints named highlights in one window's registry */
export interface HighlightPainter {
  /** the window whose registry this paints in */
  readonly window: Window;
  /** Paints `range` under `name`, replacing whatever that name painted before */
  set(name: string, range: Range): void;
  delete(name: string): void;
}

/**
 * The highlight registry of the window showing `node`. Each window (including
 * Obsidian's pop-out windows) has its own registry, and highlights only show
 * in the registry of the window that owns the text. Returns null when that
 * window can't paint highlights over arbitrary text ranges.
 */
export function highlightPainterFor(node: Node): HighlightPainter | null {
  const document = node.ownerDocument ?? (node as Document);
  const window = document.defaultView;
  const { CSS, Highlight } = (window ?? {}) as WindowWithHighlights;
  const registry = CSS?.highlights;
  if (!window || !registry || typeof Highlight !== "function") {
    return null;
  }
  return {
    window,
    set: (name, range) => registry.set(name, new Highlight(range)),
    delete: (name) => {
      registry.delete(name);
    },
  };
}
