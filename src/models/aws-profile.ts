/**
 * AWS Profile credential provider for Obsidian (Desktop only)
 *
 * Reads credentials from ~/.aws/credentials file and supports
 * automatic refresh via configurable shell commands.
 *
 * SECURITY NOTE: The refresh command is executed in a shell. Users should
 * only configure commands they trust. The command output is not logged
 * to prevent accidental credential exposure.
 */

import { Platform } from "obsidian";

export interface AWSCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
}

export interface CredentialRefreshResult {
  success: boolean;
  error?: string;
}

// Prevent concurrent refresh operations
let isRefreshing = false;

/**
 * Check if we're running on desktop (Node.js available)
 */
export function isDesktopApp(): boolean {
  return Platform.isDesktopApp;
}

/**
 * Parse AWS credentials file content (INI format)
 */
function parseCredentialsFile(
  content: string,
  profile: string,
): AWSCredentials | null {
  const lines = content.split("\n");
  let currentProfile: string | null = null;
  let credentials: Partial<AWSCredentials> = {};

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith(";")) {
      continue;
    }

    // Check for profile header
    const profileMatch = trimmed.match(/^\[([^\]]+)\]$/);
    if (profileMatch) {
      // If we were in the target profile, we're done
      if (currentProfile === profile && credentials.accessKeyId) {
        break;
      }
      currentProfile = profileMatch[1];
      if (currentProfile === profile) {
        credentials = {};
      }
      continue;
    }

    // Parse key=value if we're in the target profile
    if (currentProfile === profile) {
      const keyValueMatch = trimmed.match(/^([^=]+)=(.*)$/);
      if (keyValueMatch) {
        const key = keyValueMatch[1].trim().toLowerCase();
        const value = keyValueMatch[2].trim();

        switch (key) {
          case "aws_access_key_id":
            credentials.accessKeyId = value;
            break;
          case "aws_secret_access_key":
            credentials.secretAccessKey = value;
            break;
          case "aws_session_token":
            credentials.sessionToken = value;
            break;
        }
      }
    }
  }

  if (credentials.accessKeyId && credentials.secretAccessKey) {
    return credentials as AWSCredentials;
  }

  return null;
}

/**
 * Read AWS credentials from the credentials file for a specific profile
 */
export async function readProfileCredentials(
  profile: string,
): Promise<AWSCredentials | null> {
  if (!isDesktopApp()) {
    console.warn("AWS profile credentials are only available on desktop");
    return null;
  }

  try {
    // Use require for Node.js APIs in Electron (avoid Vite analysis issues)
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const os = window.require("os");
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const path = window.require("path");
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = window.require("fs");

    const credentialsPath = path.join(os.homedir(), ".aws", "credentials");
    const content = fs.readFileSync(credentialsPath, "utf-8");

    return parseCredentialsFile(content, profile);
  } catch (error) {
    console.error("Failed to read AWS credentials file:", error);
    return null;
  }
}

/**
 * Execute a shell command to refresh AWS credentials.
 *
 * SECURITY: The command is executed in a login shell to pick up PATH.
 * Command output is intentionally not logged to prevent credential exposure.
 */
export async function runRefreshCommand(
  command: string,
): Promise<CredentialRefreshResult> {
  if (!isDesktopApp()) {
    return {
      success: false,
      error: "Credential refresh is only available on desktop",
    };
  }

  if (!command.trim()) {
    return {
      success: false,
      error: "No refresh command configured",
    };
  }

  // Prevent concurrent refresh operations
  if (isRefreshing) {
    return {
      success: false,
      error: "Credential refresh already in progress",
    };
  }

  isRefreshing = true;

  try {
    // Use require for Node.js APIs in Electron (avoid Vite analysis issues)
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const childProcess = window.require("child_process");
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const os = window.require("os");

    // Determine the user's default shell (fallback to common shells)
    const userShell = process.env.SHELL || "/bin/zsh";

    // Execute in a login shell to pick up PATH from shell profile
    // Using -i for interactive (sources .zshrc/.bashrc) and -l for login shell
    return await new Promise<CredentialRefreshResult>((resolve) => {
      const child = childProcess.exec(
        `${userShell} -i -l -c ${JSON.stringify(command)}`,
        {
          timeout: 60000, // 60 second timeout
          env: {
            ...process.env,
            HOME: os.homedir(),
          },
        },
        (error: Error | null, _stdout: string, _stderr: string) => {
          // Intentionally not logging stdout/stderr to prevent credential exposure
          if (error) {
            // Extract just the exit code or a generic message, not full error details
            const exitCode = (error as NodeJS.ErrnoException).code;
            resolve({
              success: false,
              error: exitCode
                ? `Refresh command failed (exit code: ${exitCode})`
                : "Refresh command failed",
            });
          } else {
            resolve({ success: true });
          }
        },
      );

      // Handle timeout
      child.on("error", () => {
        resolve({
          success: false,
          error: "Refresh command failed to start",
        });
      });
    });
  } finally {
    isRefreshing = false;
  }
}

/**
 * Get AWS credentials, optionally refreshing them first
 */
export async function getCredentialsWithRefresh(
  profile: string,
  refreshCommand: string,
  forceRefresh: boolean = false,
): Promise<{ credentials: AWSCredentials | null; refreshed: boolean }> {
  // First try to read existing credentials
  let credentials = await readProfileCredentials(profile);

  // If we have credentials and don't need to force refresh, return them
  if (credentials && !forceRefresh) {
    return { credentials, refreshed: false };
  }

  // If no credentials or force refresh, try to refresh
  if (refreshCommand.trim()) {
    const refreshResult = await runRefreshCommand(refreshCommand);

    if (refreshResult.success) {
      // Re-read credentials after refresh
      credentials = await readProfileCredentials(profile);
      return { credentials, refreshed: true };
    }
    // Refresh failed - fall through to return existing credentials (if any)
  }

  return { credentials, refreshed: false };
}

// Export for testing
export const _testing = {
  parseCredentialsFile,
};
