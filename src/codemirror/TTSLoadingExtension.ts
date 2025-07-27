import { RangeSetBuilder } from "@codemirror/state";
import {
  Decoration,
  DecorationSet,
  EditorView,
  PluginValue,
  ViewPlugin,
  ViewUpdate,
  WidgetType,
} from "@codemirror/view";

// Platform-specific widget factory interface
export interface LoadingWidgetFactory {
  createWidget(filename: string): HTMLElement;
}

// Obsidian widget factory using existing createDOM
export class ObsidianLoadingWidgetFactory implements LoadingWidgetFactory {
  constructor(private createDOM: (props: { file: string }) => HTMLElement) {}

  createWidget(filename: string): HTMLElement {
    return this.createDOM({ file: filename });
  }
}

// Web widget factory for simple loading indicators
export class WebLoadingWidgetFactory implements LoadingWidgetFactory {
  createWidget(filename: string): HTMLElement {
    const container = document.createElement("span");
    container.className = "tts-loading-widget";
    container.style.cssText = `
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: var(--bg-secondary, #252526);
      border: 1px solid var(--border-primary, #3e3e42);
      border-radius: 4px;
      padding: 4px 8px;
      font-size: 12px;
      color: var(--text-secondary, #969696);
    `;

    // Simple spinning icon
    const spinner = document.createElement("span");
    spinner.textContent = "⟳";
    spinner.style.cssText = "animation: spin 1s linear infinite;";

    const text = document.createElement("span");
    text.textContent = `loading ${filename}`;

    container.appendChild(spinner);
    container.appendChild(text);

    // Add CSS for spin animation if not present
    if (!document.querySelector("#tts-loading-styles")) {
      const style = document.createElement("style");
      style.id = "tts-loading-styles";
      style.textContent = `
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `;
      document.head.appendChild(style);
    }

    return container;
  }
}

class LoadingSpinnerWidget extends WidgetType {
  constructor(
    private filename: string,
    private widgetFactory: LoadingWidgetFactory,
  ) {
    super();
  }

  toDOM() {
    return this.widgetFactory.createWidget(this.filename);
  }

  ignoreEvent() {
    return true;
  }

  eq(that: LoadingSpinnerWidget) {
    return this.filename === that.filename;
  }

  updateDOM() {
    return false;
  }
}

class LoadingSpinnerExtension implements PluginValue {
  decorations: DecorationSet;

  constructor(
    view: EditorView,
    private widgetFactory: LoadingWidgetFactory,
  ) {
    this.decorations = this.createDecorations(view);
  }

  update(update: ViewUpdate) {
    if (update.docChanged || update.viewportChanged) {
      this.decorations = this.createDecorations(update.view);
    }
  }

  createDecorations(view: EditorView): DecorationSet {
    const builder = new RangeSetBuilder<Decoration>();
    const { from, to } = view.viewport;
    const text = view.state.doc.sliceString(from, to);
    const regex = /<loading file="(.+?)" \/>/g;
    let match;

    while ((match = regex.exec(text)) !== null) {
      const start = from + match.index;
      const end = start + match[0].length;
      const filename = match[1];

      const deco = Decoration.widget({
        widget: new LoadingSpinnerWidget(filename, this.widgetFactory),
      });
      builder.add(start, end, deco);
    }

    return builder.finish();
  }
}

export function createLoadingSpinnerExtension(
  widgetFactory: LoadingWidgetFactory,
) {
  return ViewPlugin.fromClass(
    class extends LoadingSpinnerExtension {
      constructor(view: EditorView) {
        super(view, widgetFactory);
      }
    },
    {
      decorations: (v: LoadingSpinnerExtension): DecorationSet => v.decorations,
    },
  );
}
