export interface AwsCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
}

export type AwsCredentialReadResult =
  | { ok: true; credentials: AwsCredentials }
  | { ok: false; error: string };

export interface CredentialRefreshResult {
  ok: boolean;
  error?: string;
}

export interface AwsProfileRuntime {
  readonly available: boolean;
  listProfiles(awsCliPath?: string): Promise<string[]>;
  readCredentials(
    profile: string,
    awsCliPath?: string,
  ): Promise<AwsCredentialReadResult>;
  refreshCredentials(command: string): Promise<CredentialRefreshResult>;
}

export interface RuntimeServices {
  readonly awsProfiles: AwsProfileRuntime;
}

export const unavailableAwsProfileRuntime: AwsProfileRuntime = {
  available: false,
  async listProfiles(): Promise<string[]> {
    return [];
  },
  async readCredentials(): Promise<AwsCredentialReadResult> {
    return {
      ok: false,
      error: "AWS profile authentication is unavailable on this device.",
    };
  },
  async refreshCredentials(): Promise<CredentialRefreshResult> {
    return {
      ok: false,
      error: "AWS profile authentication is unavailable on this device.",
    };
  },
};

export const unavailableRuntimeServices: RuntimeServices = {
  awsProfiles: unavailableAwsProfileRuntime,
};
