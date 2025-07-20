import { describe, it, expect } from "vitest";
import { TTSErrorInfo, ErrorMessage } from "./tts-model";

describe("TTSErrorInfo", () => {
  describe("constructor and basic properties", () => {
    it("should create error with status only", () => {
      const error = new TTSErrorInfo("timeout");
      
      expect(error.status).toBe("timeout");
      expect(error.httpErrorCode).toBeUndefined();
      expect(error.errorDetails).toBeUndefined();
      expect(error.name).toBe("TTSErrorInfo");
      expect(error.message).toBe("Request failed 'timeout'");
    });

    it("should create error with status and http code", () => {
      const error = new TTSErrorInfo("Bad Request", undefined, 400);
      
      expect(error.status).toBe("Bad Request");
      expect(error.httpErrorCode).toBe(400);
      expect(error.message).toBe("Request failed 'Bad Request'");
    });

    it("should create error with full details", () => {
      const errorDetails: ErrorMessage = {
        error: {
          message: "Invalid API key",
          type: "invalid_request_error",
          code: "invalid_api_key",
          param: null
        }
      };
      
      const error = new TTSErrorInfo("API Error", errorDetails, 401);
      
      expect(error.status).toBe("API Error");
      expect(error.httpErrorCode).toBe(401);
      expect(error.errorDetails).toBe(errorDetails);
    });
  });

  describe("isRetryable", () => {
    it("should be retryable when no http code", () => {
      const error = new TTSErrorInfo("network error");
      expect(error.isRetryable).toBe(true);
    });

    it("should be retryable for 429 status", () => {
      const error = new TTSErrorInfo("rate limited", undefined, 429);
      expect(error.isRetryable).toBe(true);
    });

    it("should be retryable for 5xx status codes", () => {
      const error500 = new TTSErrorInfo("server error", undefined, 500);
      const error502 = new TTSErrorInfo("bad gateway", undefined, 502);
      const error503 = new TTSErrorInfo("service unavailable", undefined, 503);
      
      expect(error500.isRetryable).toBe(true);
      expect(error502.isRetryable).toBe(true);
      expect(error503.isRetryable).toBe(true);
    });

    it("should not be retryable for 4xx status codes (except 429)", () => {
      const error400 = new TTSErrorInfo("bad request", undefined, 400);
      const error401 = new TTSErrorInfo("unauthorized", undefined, 401);
      const error404 = new TTSErrorInfo("not found", undefined, 404);
      
      expect(error400.isRetryable).toBe(false);
      expect(error401.isRetryable).toBe(false);
      expect(error404.isRetryable).toBe(false);
    });
  });

  describe("ttsJsonMessage", () => {
    it("should return error message from details", () => {
      const errorDetails: ErrorMessage = {
        error: {
          message: "Invalid API key provided",
          type: "invalid_request_error",
          code: "invalid_api_key",
          param: null
        }
      };
      
      const error = new TTSErrorInfo("API Error", errorDetails, 401);
      expect(error.ttsJsonMessage()).toBe("Invalid API key provided");
    });

    it("should return undefined when no details", () => {
      const error = new TTSErrorInfo("network error");
      expect(error.ttsJsonMessage()).toBeUndefined();
    });
  });

  describe("ttsErrorCode", () => {
    it("should return error code from details", () => {
      const errorDetails: ErrorMessage = {
        error: {
          message: "Invalid API key provided",
          type: "invalid_request_error",
          code: "invalid_api_key",
          param: null
        }
      };
      
      const error = new TTSErrorInfo("API Error", errorDetails, 401);
      expect(error.ttsErrorCode()).toBe("invalid_api_key");
    });

    it("should return undefined when no details", () => {
      const error = new TTSErrorInfo("network error");
      expect(error.ttsErrorCode()).toBeUndefined();
    });
  });
}); 