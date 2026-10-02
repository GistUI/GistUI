import { expect, test } from "bun:test";
import { isEmail, isUrl, validateAll, validateValue } from "../src/validate";

test("email", () => {
  for (const ok of ["a@b.co", "first.last+tag@sub.example.org", "x_y@ex-ample.io"]) expect(isEmail(ok)).toBe(true);
  for (const bad of ["a@b", "a@@b.com", "a b@c.com", "@b.com", "a@.com", "a@b..com", "a@b.c"]) expect(isEmail(bad)).toBe(false);
  expect(validateValue({ type: "email", label: "Email" }, "nope")).toContain("valid email");
});

test("url with allowed protocols", () => {
  expect(isUrl("https://example.com")).toBe(true);
  expect(isUrl("http://example.com/path?q=1")).toBe(true);
  expect(isUrl("ftp://example.com")).toBe(false);
  expect(isUrl("https://localhost:3000")).toBe(true);
  expect(isUrl("example.com")).toBe(false);
  expect(isUrl("https://nodot")).toBe(false);
  expect(isUrl("http://example.com", ["https"])).toBe(false);
  expect(validateValue({ type: "url", protocols: ["https"] }, "http://a.com")).toContain("https://");
});

test("required, lengths, numbers, pattern, match, lists, custom message", () => {
  expect(validateValue({ required: true, label: "Name" }, "  ")).toBe("Name is required");
  expect(validateValue({ required: false }, "")).toBeNull();
  expect(validateValue({ minLength: 3 }, "ab")).toContain("at least 3");
  expect(validateValue({ type: "number", min: 1, max: 10 }, "11")).toContain("at most 10");
  expect(validateValue({ type: "number" }, "abc")).toBe("Enter a number");
  expect(validateValue({ pattern: "[A-Z]{3}", label: "Code" }, "abc")).toContain("right format");
  expect(validateValue({ match: "password" }, "x", { password: "y" })).toBe("Does not match");
  expect(validateValue({ required: true }, [])).toContain("choose");
  expect(validateValue({ minLength: 2 }, ["a"])).toContain("at least 2");
  expect(validateValue({ required: true, requiredMessage: "Tell us your name" }, "")).toBe("Tell us your name");
  // `message` is for invalid values; an empty required field still says it is required.
  expect(validateValue({ label: "Code", required: true, pattern: "[A-Z]{3}", message: "Three capitals" }, "")).toBe("Code is required");
  expect(validateValue({ label: "Code", required: true, pattern: "[A-Z]{3}", message: "Three capitals" }, "ab")).toBe("Three capitals");
  expect(validateValue({ required: true, label: "Terms" }, false)).toContain("choose");
  expect(validateAll({ a: { required: true }, b: {} }, { a: "", b: "" })).toEqual({ a: "This field is required" });
});
