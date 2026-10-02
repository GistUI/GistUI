import { expect, test } from "bun:test";
import { defineLibrary, parse } from "../src/index";

const lib = defineLibrary({
  components: [
    { name: "P", args: ["value"], props: { value: { type: "number", required: true }, xs: { type: "array", items: { type: "number" } } } },
  ],
});

test("decimal numbers parse in code, including inside arrays and at the end of a stream", () => {
  const r = parse(`root = P(0.5, xs:[1.6, -2.25, 3e2])`, lib);
  expect(r.errors).toEqual([]);
  expect(r.root!.props.value).toBe(0.5);
  expect(r.root!.props.xs).toEqual([1.6, -2.25, 300]);
});

test("hyphenated enum words (icon:map-pin, icon:chevrons-up-down) are one value, in calls and patches", () => {
  const lib2 = defineLibrary({
    components: [{ name: "I", args: ["label"], props: { label: { type: "string", required: true }, icon: { type: "enum", values: ["map-pin", "chevrons-up-down", "x"] } } }],
  });
  const r = parse(`root = I("a", icon:map-pin)`, lib2);
  expect(r.errors).toEqual([]);
  expect(r.root!.props.icon).toBe("map-pin");
  expect(parse(`root = I("a", icon:chevrons-up-down)`, lib2).root!.props.icon).toBe("chevrons-up-down");
  expect(parse(`root = I("a", icon:x)\nroot.icon = map-pin`, lib2).root!.props.icon).toBe("map-pin");
});
