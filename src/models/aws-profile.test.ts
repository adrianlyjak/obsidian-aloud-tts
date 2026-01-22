import { describe, it, expect } from "vitest";
import { _testing } from "./aws-profile";

const { parseCredentialsFile } = _testing;

describe("parseCredentialsFile", () => {
  it("should parse default profile credentials", () => {
    const content = `[default]
aws_access_key_id = AKIATEST1234567890AB
aws_secret_access_key = TestSecretKey1234567890abcdefghijklmnop
`;
    const result = parseCredentialsFile(content, "default");
    expect(result).toEqual({
      accessKeyId: "AKIATEST1234567890AB",
      secretAccessKey: "TestSecretKey1234567890abcdefghijklmnop",
    });
  });

  it("should parse named profile credentials", () => {
    const content = `[default]
aws_access_key_id = DEFAULT_KEY
aws_secret_access_key = DEFAULT_SECRET

[my-profile]
aws_access_key_id = AKIATEST1234567890AB
aws_secret_access_key = TestSecretKey1234567890abcdefghijklmnop
`;
    const result = parseCredentialsFile(content, "my-profile");
    expect(result).toEqual({
      accessKeyId: "AKIATEST1234567890AB",
      secretAccessKey: "TestSecretKey1234567890abcdefghijklmnop",
    });
  });

  it("should parse credentials with session token", () => {
    const content = `[default]
aws_access_key_id = AKIATEST1234567890AB
aws_secret_access_key = TestSecretKey1234567890abcdefghijklmnop
aws_session_token = TestSessionToken1234567890
`;
    const result = parseCredentialsFile(content, "default");
    expect(result).toEqual({
      accessKeyId: "AKIATEST1234567890AB",
      secretAccessKey: "TestSecretKey1234567890abcdefghijklmnop",
      sessionToken: "TestSessionToken1234567890",
    });
  });

  it("should return null for non-existent profile", () => {
    const content = `[default]
aws_access_key_id = AKIATEST1234567890AB
aws_secret_access_key = TestSecretKey1234567890abcdefghijklmnop
`;
    const result = parseCredentialsFile(content, "nonexistent");
    expect(result).toBeNull();
  });

  it("should return null for profile with missing access key", () => {
    const content = `[incomplete]
aws_secret_access_key = TestSecretKey1234567890abcdefghijklmnop
`;
    const result = parseCredentialsFile(content, "incomplete");
    expect(result).toBeNull();
  });

  it("should return null for profile with missing secret key", () => {
    const content = `[incomplete]
aws_access_key_id = AKIATEST1234567890AB
`;
    const result = parseCredentialsFile(content, "incomplete");
    expect(result).toBeNull();
  });

  it("should handle comments and empty lines", () => {
    const content = `# This is a comment
[default]
; Another comment style
aws_access_key_id = AKIATEST1234567890AB

aws_secret_access_key = TestSecretKey1234567890abcdefghijklmnop
`;
    const result = parseCredentialsFile(content, "default");
    expect(result).toEqual({
      accessKeyId: "AKIATEST1234567890AB",
      secretAccessKey: "TestSecretKey1234567890abcdefghijklmnop",
    });
  });

  it("should handle keys with different casing", () => {
    const content = `[default]
AWS_ACCESS_KEY_ID = AKIATEST1234567890AB
AWS_SECRET_ACCESS_KEY = TestSecretKey1234567890abcdefghijklmnop
`;
    const result = parseCredentialsFile(content, "default");
    expect(result).toEqual({
      accessKeyId: "AKIATEST1234567890AB",
      secretAccessKey: "TestSecretKey1234567890abcdefghijklmnop",
    });
  });

  it("should handle values with spaces around equals sign", () => {
    const content = `[default]
aws_access_key_id=AKIATEST1234567890AB
aws_secret_access_key =TestSecretKey1234567890abcdefghijklmnop
`;
    const result = parseCredentialsFile(content, "default");
    expect(result).toEqual({
      accessKeyId: "AKIATEST1234567890AB",
      secretAccessKey: "TestSecretKey1234567890abcdefghijklmnop",
    });
  });

  it("should return null for empty content", () => {
    const result = parseCredentialsFile("", "default");
    expect(result).toBeNull();
  });

  it("should stop parsing at next profile header", () => {
    const content = `[first]
aws_access_key_id = FIRST_KEY
aws_secret_access_key = FIRST_SECRET

[second]
aws_access_key_id = SECOND_KEY
aws_secret_access_key = SECOND_SECRET
`;
    const result = parseCredentialsFile(content, "first");
    expect(result).toEqual({
      accessKeyId: "FIRST_KEY",
      secretAccessKey: "FIRST_SECRET",
    });
  });
});
