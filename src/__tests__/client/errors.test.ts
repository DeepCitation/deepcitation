import { describe, expect, it } from "@jest/globals";
import {
  AuthenticationError,
  DeepCitationError,
  NetworkError,
  RateLimitError,
  ServerError,
  ValidationError,
} from "../../client/errors.js";

describe("DeepCitationError", () => {
  it("extends Error with message, code, and isRetryable", () => {
    const error = new DeepCitationError("Test error", "TEST_CODE", false);
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe("Test error");
    expect(error.code).toBe("TEST_CODE");
    expect(error.isRetryable).toBe(false);
    expect(error.name).toBe("DeepCitationError");
  });

  it("handles retryable errors", () => {
    const error = new DeepCitationError("Test", "CODE", true);
    expect(error.isRetryable).toBe(true);
  });

  it("handles optional status code", () => {
    const error = new DeepCitationError("Test", "CODE", false, 400);
    expect(error.statusCode).toBe(400);
  });

  it("includes docUrl derived from error code", () => {
    const error = new DeepCitationError("Test", "DC_AUTH_INVALID", false, 401);
    expect(error.docUrl).toBe("https://docs.deepcitation.com/errors#DC_AUTH_INVALID");
  });
});

describe("AuthenticationError", () => {
  it("is not retryable with correct code and status", () => {
    const error = new AuthenticationError("Invalid API key");
    expect(error).toBeInstanceOf(DeepCitationError);
    expect(error.message).toBe("Invalid API key");
    expect(error.code).toBe("DC_AUTH_INVALID");
    expect(error.isRetryable).toBe(false);
    expect(error.statusCode).toBe(401);
    expect(error.name).toBe("AuthenticationError");
    expect(error.docUrl).toBe("https://docs.deepcitation.com/errors#DC_AUTH_INVALID");
  });
});

describe("NetworkError", () => {
  it("is retryable with correct code", () => {
    const error = new NetworkError("Connection timeout");
    expect(error).toBeInstanceOf(DeepCitationError);
    expect(error.message).toBe("Connection timeout");
    expect(error.code).toBe("DC_NETWORK_ERROR");
    expect(error.isRetryable).toBe(true);
    expect(error.statusCode).toBeUndefined();
    expect(error.name).toBe("NetworkError");
    expect(error.docUrl).toBe("https://docs.deepcitation.com/errors#DC_NETWORK_ERROR");
  });
});

describe("RateLimitError", () => {
  it("is retryable with correct code and status", () => {
    const error = new RateLimitError("Too many requests");
    expect(error).toBeInstanceOf(DeepCitationError);
    expect(error.message).toBe("Too many requests");
    expect(error.code).toBe("DC_RATE_LIMITED");
    expect(error.isRetryable).toBe(true);
    expect(error.statusCode).toBe(429);
    expect(error.name).toBe("RateLimitError");
    expect(error.docUrl).toBe("https://docs.deepcitation.com/errors#DC_RATE_LIMITED");
  });
});

describe("ValidationError", () => {
  it("is not retryable with default 400 status", () => {
    const error = new ValidationError("Invalid citation format");
    expect(error).toBeInstanceOf(DeepCitationError);
    expect(error.message).toBe("Invalid citation format");
    expect(error.code).toBe("DC_VALIDATION_ERROR");
    expect(error.isRetryable).toBe(false);
    expect(error.statusCode).toBe(400);
    expect(error.name).toBe("ValidationError");
    expect(error.docUrl).toBe("https://docs.deepcitation.com/errors#DC_VALIDATION_ERROR");
  });

  it("handles custom status code", () => {
    const error = new ValidationError("Not found", 404);
    expect(error.statusCode).toBe(404);
    expect(error.isRetryable).toBe(false);
  });
});

describe("ServerError", () => {
  it("is retryable with default 500 status", () => {
    const error = new ServerError("Internal server error");
    expect(error).toBeInstanceOf(DeepCitationError);
    expect(error.message).toBe("Internal server error");
    expect(error.code).toBe("DC_SERVER_ERROR");
    expect(error.isRetryable).toBe(true);
    expect(error.statusCode).toBe(500);
    expect(error.name).toBe("ServerError");
    expect(error.docUrl).toBe("https://docs.deepcitation.com/errors#DC_SERVER_ERROR");
  });

  it("handles custom status codes", () => {
    const error503 = new ServerError("Service unavailable", 503);
    expect(error503.statusCode).toBe(503);
    expect(error503.isRetryable).toBe(true);

    const error502 = new ServerError("Bad gateway", 502);
    expect(error502.statusCode).toBe(502);
    expect(error502.isRetryable).toBe(true);
  });
});

describe("Error instanceof checks", () => {
  it("allows instanceof checks for type narrowing", () => {
    const error: DeepCitationError = new AuthenticationError("Test");

    if (error instanceof AuthenticationError) {
      expect(error.isRetryable).toBe(false);
    }

    if (error instanceof RateLimitError) {
      expect(error.isRetryable).toBe(true);
    }
  });

  it("preserves Error prototype chain", () => {
    const auth = new AuthenticationError("Test");
    const rate = new RateLimitError("Test");
    const validation = new ValidationError("Test");
    const server = new ServerError("Test");
    const network = new NetworkError("Test");

    expect(auth).toBeInstanceOf(Error);
    expect(rate).toBeInstanceOf(Error);
    expect(validation).toBeInstanceOf(Error);
    expect(server).toBeInstanceOf(Error);
    expect(network).toBeInstanceOf(Error);

    expect(auth).toBeInstanceOf(DeepCitationError);
    expect(rate).toBeInstanceOf(DeepCitationError);
    expect(validation).toBeInstanceOf(DeepCitationError);
    expect(server).toBeInstanceOf(DeepCitationError);
    expect(network).toBeInstanceOf(DeepCitationError);
  });
});
