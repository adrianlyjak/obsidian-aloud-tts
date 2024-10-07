// Extend the Window interface to include ManagedMediaSource
declare global {
  interface Window {
    ManagedMediaSource?: typeof MediaSource;
  }
}

// Ensure this file is treated as a module
export {};
