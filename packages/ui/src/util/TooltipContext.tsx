import React, { createContext, useContext, ReactNode } from "react";

export interface TooltipOptions {
  delay?: number;
  placement?: string;
}

export interface TooltipService {
  setTooltip(
    element: HTMLElement,
    text: string,
    options?: TooltipOptions,
  ): void;
}

// Default no-op implementation for web
const defaultTooltipService: TooltipService = {
  setTooltip: (
    element: HTMLElement,
    text: string,
    options?: TooltipOptions,
  ) => {
    // For web: use title attribute as simple fallback
    if (text && element) {
      element.title = text;
    }
  },
};

const TooltipContext = createContext<TooltipService>(defaultTooltipService);

export interface TooltipProviderProps {
  children: ReactNode;
  tooltipService?: TooltipService;
}

export const TooltipProvider: React.FC<TooltipProviderProps> = ({
  children,
  tooltipService = defaultTooltipService,
}) => {
  return (
    <TooltipContext.Provider value={tooltipService}>
      {children}
    </TooltipContext.Provider>
  );
};

export const useTooltip = (): TooltipService => {
  return useContext(TooltipContext);
};
