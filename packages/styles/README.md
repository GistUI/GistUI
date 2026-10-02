# @gistui/styles

GistUI's design system: one plain-CSS stylesheet for every framework.

```ts
import "@gistui/styles/styles.css";
```

- Everything is in `@layer gistui`, so your own CSS wins without `!important`.
- With Tailwind (and shadcn/ui), import this stylesheet **before** your Tailwind CSS. It sets the layer
  order `theme, base, gistui, components, utilities`: above Tailwind's reset, below its utilities, so
  utility classes passed through `classNames` still win.
- Customise with `--gistui-*` tokens on `.gistui` (or the `tokens` prop), the `data-gistui-color`,
  `data-gistui-radius` and `data-gistui-density` presets, and per-component hooks:
  `data-gistui="Card"`, `data-v`, `data-tone`.
