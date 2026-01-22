import { TTSPluginSettings } from "../player/TTSPluginSettings";
import { AudioData } from "./tts-model";
import {
  AudioTextContext,
  ErrorMessage,
  REQUIRE_API_KEY,
  TTSErrorInfo,
  TTSModel,
  TTSModelOptions,
} from "./tts-model";
import {
  AWSCredentials,
  getCredentialsWithRefresh,
  isDesktopApp,
  readProfileCredentials,
  runRefreshCommand,
} from "./aws-profile";

export const POLLY_ENGINES = [
  { label: "Neural", value: "neural" },
  { label: "Standard", value: "standard" },
  {
    label: "Generative (coming soon)",
    value: "generative",
    disabled: true as any,
  },
  {
    label: "Long-form (coming soon)",
    value: "long-form",
    disabled: true as any,
  },
] as const;

export const POLLY_REGIONS = [
  "us-east-1",
  "us-east-2",
  "us-west-1",
  "us-west-2",
  "ca-central-1",
  "eu-west-1",
  "eu-west-2",
  "eu-west-3",
  "eu-central-1",
  "eu-north-1",
  "eu-south-1",
  "ap-south-1",
  "ap-northeast-1",
  "ap-northeast-2",
  "ap-southeast-1",
  "ap-southeast-2",
  "ap-east-1",
  "sa-east-1",
] as const;

export type PollyVoice = {
  id: string;
  name: string;
  languageName: string;
  supportedEngines?: string[];
};

export const pollyTextToSpeech: TTSModel = {
  call: pollyCallTextToSpeech,
  validateConnection: async (settings) => {
    if (!settings.polly_region.trim()) {
      return "Please specify an AWS region";
    }

    // Get credentials based on auth mode
    const credsResult = await getPollyCredentials(settings);
    if (!credsResult.credentials) {
      if (settings.polly_authMode === "profile") {
        if (!isDesktopApp()) {
          return "AWS profile authentication is only available on desktop";
        }
        return `Could not read credentials from AWS profile "${settings.polly_profile}". Make sure the profile exists in ~/.aws/credentials`;
      }
      return REQUIRE_API_KEY;
    }

    try {
      await listPollyVoicesWithCreds(
        credsResult.credentials,
        settings.polly_region,
      );
      return undefined;
    } catch (error) {
      if (error instanceof TTSErrorInfo) {
        if (error.httpErrorCode === 403 || error.httpErrorCode === 401) {
          // Try refreshing credentials if using profile mode
          if (
            settings.polly_authMode === "profile" &&
            settings.polly_refreshCommand
          ) {
            const refreshResult = await runRefreshCommand(
              settings.polly_refreshCommand,
            );
            if (refreshResult.success) {
              const newCreds = await readProfileCredentials(
                settings.polly_profile,
              );
              if (newCreds) {
                try {
                  await listPollyVoicesWithCreds(
                    newCreds,
                    settings.polly_region,
                  );
                  return undefined;
                } catch {
                  // Still failed after refresh
                }
              }
            }
          }
          return "Invalid AWS credentials or insufficient permissions";
        } else if (error.httpErrorCode !== undefined) {
          return `HTTP error code ${error.httpErrorCode}: ${error.ttsJsonMessage() || error.message}`;
        } else {
          return error.ttsJsonMessage() || error.message;
        }
      }
      return "Cannot connect to AWS Polly";
    }
  },
  convertToOptions: (settings): TTSModelOptions => {
    return {
      apiKey: settings.polly_accessKeyId,
      apiUri: `https://polly.${settings.polly_region}.amazonaws.com`,
      voice: settings.polly_voiceId,
      model: settings.polly_engine,
    };
  },
};

/**
 * Get AWS credentials based on the current auth mode
 */
async function getPollyCredentials(
  settings: TTSPluginSettings,
): Promise<{ credentials: AWSCredentials | null; fromProfile: boolean }> {
  if (settings.polly_authMode === "profile") {
    const credentials = await readProfileCredentials(settings.polly_profile);
    return { credentials, fromProfile: true };
  }

  // Static credentials mode
  if (settings.polly_accessKeyId && settings.polly_secretAccessKey) {
    return {
      credentials: {
        accessKeyId: settings.polly_accessKeyId,
        secretAccessKey: settings.polly_secretAccessKey,
      },
      fromProfile: false,
    };
  }

  return { credentials: null, fromProfile: false };
}

export async function pollyCallTextToSpeech(
  text: string,
  options: TTSModelOptions,
  settings: TTSPluginSettings,
  _context: AudioTextContext = {},
): Promise<AudioData> {
  if (!settings.polly_voiceId) {
    throw new TTSErrorInfo("Voice is required for AWS Polly", {
      error: {
        message: "Voice is required for AWS Polly",
        type: "invalid_request_error",
        code: "missing_voice",
        param: null,
      },
    });
  }

  // Get credentials based on auth mode
  const credsResult = await getPollyCredentials(settings);
  if (!credsResult.credentials) {
    throw new TTSErrorInfo("AWS credentials not available", {
      error: {
        message:
          settings.polly_authMode === "profile"
            ? `Could not read credentials from AWS profile "${settings.polly_profile}"`
            : "AWS Access Key ID and Secret Access Key are required",
        type: "invalid_request_error",
        code: "missing_credentials",
        param: null,
      },
    });
  }

  // Try to make the request
  try {
    return await makePollyRequest(
      text,
      settings.polly_region,
      settings.polly_voiceId,
      settings.polly_engine,
      credsResult.credentials,
    );
  } catch (error) {
    // If auth error and using profile mode with refresh command, try refreshing
    if (
      error instanceof TTSErrorInfo &&
      (error.httpErrorCode === 401 || error.httpErrorCode === 403) &&
      settings.polly_authMode === "profile" &&
      settings.polly_refreshCommand
    ) {
      const refreshResult = await getCredentialsWithRefresh(
        settings.polly_profile,
        settings.polly_refreshCommand,
        true, // force refresh
      );

      if (refreshResult.credentials && refreshResult.refreshed) {
        return await makePollyRequest(
          text,
          settings.polly_region,
          settings.polly_voiceId,
          settings.polly_engine,
          refreshResult.credentials,
        );
      }
    }

    throw error;
  }
}

/**
 * Make the actual Polly API request
 */
async function makePollyRequest(
  text: string,
  region: string,
  voiceId: string,
  engine: string,
  credentials: AWSCredentials,
): Promise<AudioData> {
  const endpoint = `https://polly.${region}.amazonaws.com/v1/speech`;

  const requestBody = JSON.stringify({
    Text: text,
    OutputFormat: "mp3",
    VoiceId: voiceId,
    Engine: engine,
  });

  const signed = await signAwsRequest({
    method: "POST",
    service: "polly",
    region: region,
    host: `polly.${region}.amazonaws.com`,
    path: "/v1/speech",
    headers: {
      "content-type": "application/json",
    },
    body: requestBody,
    accessKeyId: credentials.accessKeyId,
    secretAccessKey: credentials.secretAccessKey,
    sessionToken: credentials.sessionToken,
  });

  const response = await fetch(endpoint, {
    method: "POST",
    headers: signed.headers,
    body: requestBody,
  });

  await validate200Polly(response);
  const buf = await response.arrayBuffer();
  return { data: buf, format: "mp3" };
}

/**
 * List Polly voices using credentials object
 */
export async function listPollyVoicesWithCreds(
  credentials: AWSCredentials,
  region: string,
): Promise<PollyVoice[]> {
  const endpoint = `https://polly.${region}.amazonaws.com/v1/voices`;

  const signed = await signAwsRequest({
    method: "GET",
    service: "polly",
    region,
    host: `polly.${region}.amazonaws.com`,
    path: "/v1/voices",
    headers: {},
    accessKeyId: credentials.accessKeyId,
    secretAccessKey: credentials.secretAccessKey,
    sessionToken: credentials.sessionToken,
  });

  const response = await fetch(endpoint, {
    method: "GET",
    headers: signed.headers,
  });
  await validate200Polly(response);
  const data = await response.json();
  return (data.Voices || []).map((v: any) => ({
    id: v.Id,
    name: v.Name,
    languageName: v.LanguageName,
    supportedEngines: Array.isArray(v.SupportedEngines)
      ? (v.SupportedEngines as string[])
      : [],
  }));
}

/**
 * List Polly voices (legacy function for static credentials)
 */
export async function listPollyVoices(
  accessKeyId: string,
  secretAccessKey: string,
  region: string,
): Promise<PollyVoice[]> {
  return listPollyVoicesWithCreds({ accessKeyId, secretAccessKey }, region);
}

async function validate200Polly(response: Response) {
  if (response.status >= 300) {
    let errorMessage: ErrorMessage | undefined;
    try {
      const jsonBody = await response.json();
      if (jsonBody?.message || jsonBody?.__type) {
        errorMessage = {
          error: {
            message: jsonBody.message || jsonBody.__type || "Unknown error",
            type: jsonBody.__type || "aws_polly_error",
            code: String(response.status),
            param: null,
          },
        };
      }
    } catch (ex) {
      // ignore parse errors
    }
    throw new TTSErrorInfo(
      `HTTP ${response.status} error`,
      errorMessage,
      response.status,
    );
  }
}

// Minimal AWS SigV4 signer with WebCrypto

type SignRequest = {
  method: "GET" | "POST" | "PUT" | "DELETE";
  service: string;
  region: string;
  host: string;
  path: string;
  headers: Record<string, string>;
  body?: string;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
};

async function signAwsRequest(req: SignRequest): Promise<{
  headers: Record<string, string>;
}> {
  const now = new Date();
  const amzDate = toAmzDate(now);
  const dateStamp = amzDate.slice(0, 8);

  const method = req.method;
  const canonicalUri = req.path;
  const canonicalQueryString = "";
  const lowerCaseHeaders: Record<string, string> = {};
  Object.keys(req.headers || {}).forEach((k) => {
    lowerCaseHeaders[k.toLowerCase()] = req.headers[k];
  });
  const payloadHash = await sha256Hex(req.body ?? "");
  const headers: Record<string, string> = {
    host: req.host,
    "x-amz-date": amzDate,
    "x-amz-content-sha256": payloadHash,
    ...lowerCaseHeaders,
  };

  // Add session token if present (for temporary credentials from profiles)
  if (req.sessionToken) {
    headers["x-amz-security-token"] = req.sessionToken;
  }
  const signedHeaders = Object.keys(headers)
    .map((h) => h.toLowerCase())
    .sort()
    .join(";");
  const canonicalHeaders =
    Object.keys(headers)
      .map((h) => h.toLowerCase())
      .sort()
      .map((h) => `${h}:${headers[h]}`)
      .join("\n") + "\n";

  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const algorithm = "AWS4-HMAC-SHA256";
  const credentialScope = `${dateStamp}/${req.region}/${req.service}/aws4_request`;
  const stringToSign = [
    algorithm,
    amzDate,
    credentialScope,
    await sha256Hex(canonicalRequest),
  ].join("\n");

  const signingKey = await getSignatureKey(
    req.secretAccessKey,
    dateStamp,
    req.region,
    req.service,
  );
  const signature = await hmacHex(signingKey, stringToSign);

  const authorizationHeader = `${algorithm} Credential=${req.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return {
    headers: {
      ...headers,
      authorization: authorizationHeader,
    },
  };
}

function toAmzDate(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return (
    date.getUTCFullYear().toString() +
    pad(date.getUTCMonth() + 1) +
    pad(date.getUTCDate()) +
    "T" +
    pad(date.getUTCHours()) +
    pad(date.getUTCMinutes()) +
    pad(date.getUTCSeconds()) +
    "Z"
  );
}

async function sha256Hex(message: string): Promise<string> {
  const data = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return bufferToHex(hashBuffer);
}

async function hmac(
  key: ArrayBuffer | Uint8Array,
  data: string,
): Promise<ArrayBuffer> {
  const rawKey: ArrayBuffer =
    key instanceof Uint8Array ? new Uint8Array(key).buffer : key;
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    rawKey,
    { name: "HMAC", hash: { name: "SHA-256" } },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    new TextEncoder().encode(data),
  );
  return sig;
}

async function hmacHex(key: ArrayBuffer, data: string): Promise<string> {
  const sig = await hmac(key, data);
  return bufferToHex(sig);
}

async function getSignatureKey(
  key: string,
  dateStamp: string,
  regionName: string,
  serviceName: string,
): Promise<ArrayBuffer> {
  const kDate = await hmac(new TextEncoder().encode("AWS4" + key), dateStamp);
  const kRegion = await hmac(kDate, regionName);
  const kService = await hmac(kRegion, serviceName);
  const kSigning = await hmac(kService, "aws4_request");
  return kSigning;
}

function bufferToHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const hex: string[] = [];
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i].toString(16).padStart(2, "0");
    hex.push(b);
  }
  return hex.join("");
}
