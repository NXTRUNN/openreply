import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  createOAuthState,
  decryptToken,
  encryptToken,
  getAuthorizationUrl,
  verifyOAuthState,
} from "../lib/meta/oauth";

beforeEach(() => {
  vi.stubEnv("INSTAGRAM_APP_ID", "test-instagram-app-id");
  vi.stubEnv("NEXTAUTH_SECRET", "test-secret-with-enough-length");
  vi.stubEnv(
    "ENCRYPTION_KEY",
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
  );
});

describe("OAuth state and token encryption", () => {
  it("round-trips encrypted tokens", () => {
    const encrypted = encryptToken("long-lived-token");
    expect(encrypted).not.toBe("long-lived-token");
    expect(decryptToken(encrypted)).toBe("long-lived-token");
  });

  it("signs and verifies Instagram OAuth state", () => {
    const state = createOAuthState("workspace_123");
    expect(verifyOAuthState(state)?.workspaceId).toBe("workspace_123");
  });

  it("rejects tampered OAuth state", () => {
    const state = createOAuthState("workspace_123");
    expect(verifyOAuthState(`${state}tampered`)).toBeNull();
  });
});

describe("Instagram reconnect authorization window", () => {
  it("uses Instagram's browser authorization window without changing grants or signed state", () => {
    const redirectUri = "https://reply.example.test/api/instagram/callback";
    const state = createOAuthState("workspace_123");
    const url = new URL(getAuthorizationUrl(redirectUri, state));
    expect(url.origin).toBe("https://www.instagram.com");
    expect(url.pathname).toBe("/oauth/authorize");
    expect(url.searchParams.get("enable_fb_login")).toBe("0");
    expect(url.searchParams.get("client_id")).toBe("test-instagram-app-id");
    expect(url.searchParams.get("redirect_uri")).toBe(redirectUri);
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("state")).toBe(state);
    expect(verifyOAuthState(url.searchParams.get("state"))?.workspaceId).toBe("workspace_123");
    expect(url.searchParams.get("scope")).toBe("instagram_business_basic,instagram_business_manage_messages,instagram_business_manage_comments,instagram_business_manage_insights");
  });
});
