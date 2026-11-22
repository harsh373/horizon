import { describe, expect, it } from "vitest";
import { checkPassword } from "./passwordStrength";

describe("checkPassword", () => {
  it("refuses short passwords", () => {
    expect(checkPassword("short1!").ok).toBe(false);
  });

  it("refuses common passwords even with extras added", () => {
    expect(checkPassword("mypassword2024!!").level).toBe("weak");
  });

  it("refuses keyboard and alphabet runs", () => {
    expect(checkPassword("abcdefgh!Xy93kL").level).toBe("weak");
  });

  it("refuses passwords containing the person's own name", () => {
    expect(checkPassword("harshsrivastava2026!X", ["harsh"]).level).toBe("weak");
  });

  it("accepts a mixed 15-character password as okay", () => {
    const result = checkPassword("Tr0ub4dor&3xyz!");
    expect(result.level).toBe("okay");
    expect(result.ok).toBe(true);
  });

  it("rates a long phrase as strong", () => {
    expect(checkPassword("my dog ate my homework yesterday").level).toBe("strong");
  });
});