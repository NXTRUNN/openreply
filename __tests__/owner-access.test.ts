import { beforeEach, describe, expect, it, vi } from "vitest";
import { getOwnerEmail, isOwnerEmail } from "../lib/owner-access";

beforeEach(() => {
  vi.unstubAllEnvs();
  delete process.env.OWNER_EMAIL;
});

describe("single-owner access", () => {
  it("fails closed when the owner email is not configured", () => {
    expect(getOwnerEmail()).toBeNull();
    expect(isOwnerEmail("owner@example.com")).toBe(false);
  });

  it("accepts only the configured owner after safe normalization", () => {
    vi.stubEnv("OWNER_EMAIL", " Owner@Example.com ");

    expect(getOwnerEmail()).toBe("owner@example.com");
    expect(isOwnerEmail("OWNER@example.com")).toBe(true);
    expect(isOwnerEmail("someone@example.com")).toBe(false);
    expect(isOwnerEmail(null)).toBe(false);
  });

  it("rejects Unicode characters that normalize into email syntax", () => {
    vi.stubEnv("OWNER_EMAIL", "owner@example.com");

    expect(isOwnerEmail("owner＠example.com")).toBe(false);
  });
});
