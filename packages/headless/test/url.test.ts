import { describe, expect, test } from "bun:test";
import { safeUrl, urlHost } from "../src/url";

describe("safeUrl", () => {
  test("http, https, mailto, tel and relative paths pass", () => {
    for (const u of ["https://example.com/a?b=1#c", "HTTP://Example.com", "mailto:a@b.co", "tel:+15551234", "/docs/x", "./x", "../x", "docs/page", "#top", "?q=1"]) expect(safeUrl(u)).toBe(u);
    expect(safeUrl("  https://example.com  ")).toBe("https://example.com");
  });

  test("other schemes are refused, however they are disguised", () => {
    for (const u of [
      "javascript:alert(1)",
      "JaVaScRiPt:alert(1)",
      "java\tscript:alert(1)",
      "jav\nascript:alert(1)",
      "\u0001javascript:alert(1)",
      "javascript\t:alert(1)",
      " \u0000 javascript:alert(1)",
      "data:text/html,<script>1</script>",
      "\u0001data:text/html,x",
      "vbscript:x",
      "blob:https://example.com/1",
      "file:///etc/passwd",
    ]) {
      expect(safeUrl(u)).toBeUndefined();
    }
  });

  test("references that leave the site while looking like paths are refused", () => {
    for (const u of ["//evil.example/x", "/\\evil.example", "\\\\evil.example", "/\t/evil.example", "x:y"]) expect(safeUrl(u)).toBeUndefined();
    expect(safeUrl(42)).toBeUndefined();
    expect(safeUrl("")).toBeUndefined();
  });

  test("urlHost", () => {
    expect(urlHost("https://User:pw@Images.Example.com:8443/a")).toBe("images.example.com");
    expect(urlHost("/local")).toBe("");
    expect(urlHost("javascript:1")).toBeUndefined();
  });
});
