export interface AwsCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
}

export interface CredentialRefreshResult {
  ok: boolean;
  error?: string;
}

export interface AwsProfileRuntime {
  readonly available: boolean;
  readCredentials(profile: string): Promise<AwsCredentials | null>;
  refreshCredentials(command: string): Promise<CredentialRefreshResult>;
}

export interface RuntimeServices {
  readonly awsProfiles: AwsProfileRuntime;
}

export const unavailableAwsProfileRuntime: AwsProfileRuntime = {
  available: false,
  async readCredentials(): Promise<AwsCredentials | null> {
    return null;
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
