/**
 * The default GistUI component catalog: schemas and prompt metadata only, shared by every framework
 * package, so React, Svelte and Vue get the same components, the same prompt and the same props.
 */

import { defineLibrary, generatePrompt, type ComponentSpec, type GeneratedPrompt, type Library, type PromptOptions, type PropSpec } from "@gistui/core";

const gap: PropSpec = { type: "enum", values: ["none", "xs", "sm", "md", "lg", "xl"], aliases: { small: "sm", medium: "md", large: "lg" } };
const align: PropSpec = { type: "enum", values: ["start", "center", "end", "stretch", "between"] };
const justify: PropSpec = { type: "enum", values: ["start", "center", "end", "between", "around"] };
const tone: PropSpec = {
  type: "enum",
  values: ["neutral", "info", "success", "warning", "danger", "accent"],
  aliases: { error: "danger", red: "danger", green: "success", blue: "info", yellow: "warning", primary: "accent" },
};
const size: PropSpec = { type: "enum", values: ["sm", "md", "lg"], aliases: { small: "sm", medium: "md", large: "lg" } };
const bind: PropSpec = { type: "state", description: "two-way binding to a $variable" };
const action: PropSpec = { type: "action", description: "steps run on click" };
/** Icon names the default renderers draw (keep in sync with @gistui/widgets/icons). */
export const iconNames: readonly string[] = [
  "activity", "alert-circle", "alert-triangle", "armchair", "arrow-down", "arrow-left", "arrow-right", "arrow-up", "arrow-up-right", "award", "bar-chart",
  "bell", "book", "briefcase", "building", "calendar", "camera", "car", "cart", "check", "check-circle", "chevron-down",
  "chevron-left", "chevron-right", "chevron-up", "chevrons-up-down", "clock", "cloud", "cloud-lightning", "cloud-rain", "cloud-snow", "cloud-sun", "code",
  "coffee", "cpu", "credit-card", "database", "dollar", "download", "droplet", "external-link", "eye", "file-text", "film",
  "flag", "flame", "gamepad", "gift", "globe", "graduation-cap", "headphones", "heart", "heartbeat", "home", "hotel",
  "image", "info", "key", "layers", "leaf", "lightbulb", "line-chart", "link", "lock", "luggage", "mail",
  "map", "map-pin", "megaphone", "menu", "message", "minus", "moon", "mountain", "music", "navigation", "package",
  "palette", "pause", "percent", "phone", "pie-chart", "plane", "plane-landing", "plane-takeoff", "play", "plus", "rocket",
  "scale", "search", "server", "settings", "share", "shield", "shopping-bag", "sliders", "snowflake", "sparkles", "star",
  "sun", "sunrise", "sunset", "tag", "target", "terminal", "thermometer", "thumbs-up", "ticket", "train", "trending-down",
  "trending-up", "trophy", "truck", "tv", "umbrella", "upload", "user", "users", "utensils", "wallet", "wifi",
  "wind", "x", "x-circle", "zap",
];

/** Natural words a model may use for an icon. */
const iconAliases: Record<string, string> = {
  money: "dollar", revenue: "dollar", price: "dollar", cost: "dollar", payment: "credit-card", chart: "bar-chart", analytics: "bar-chart",
  trend: "trending-up", growth: "trending-up", decline: "trending-down", people: "users", team: "users", customers: "users", person: "user",
  company: "building", office: "building", location: "map-pin", place: "map-pin", travel: "plane", flight: "plane", food: "utensils",
  restaurant: "utensils", time: "clock", date: "calendar", email: "mail", chat: "message", security: "shield", idea: "lightbulb",
  ai: "sparkles", launch: "rocket", speed: "zap", energy: "zap", warning: "alert-triangle", error: "x-circle", success: "check-circle",
  video: "film", movie: "film", streaming: "tv", game: "gamepad", education: "graduation-cap", nature: "leaf", health: "heartbeat",
  legal: "scale", document: "file-text", photo: "image", shop: "cart", shopping: "cart", house: "home", storage: "database", api: "code",
  winner: "trophy", goal: "target",
  sunny: "sun", clear: "sun", cloudy: "cloud", "partly-cloudy": "cloud-sun", rain: "cloud-rain", rainy: "cloud-rain", snow: "cloud-snow",
  storm: "cloud-lightning", thunder: "cloud-lightning", temperature: "thermometer", takeoff: "plane-takeoff", departure: "plane-takeoff",
  landing: "plane-landing", arrival: "plane-landing", baggage: "luggage", seat: "armchair", bag: "shopping-bag",
};
// Open: any icon name is accepted (unknown ones fall back through aliases and close matches); the
// prompt shows a few examples instead of all of them.
const icon: PropSpec = {
  type: "enum",
  values: iconNames,
  aliases: iconAliases,
  open: true,
  examples: ["users", "dollar", "trending-up", "calendar", "map-pin", "check-circle", "alert-triangle", "star", "rocket", "sparkles", "shield", "globe"],
};
const url: PropSpec = { type: "string" };
/** A URL that loads by itself (an image, a video, a background): checked against the host's allowed hosts. */
const loads: PropSpec = { type: "string", format: "url" };

/** Themes the model may pick per answer (same names as the <GistUI color> themes). */
export const themeColors = ["neutral", "slate", "stone", "rose", "pink", "violet", "indigo", "blue", "teal", "green", "orange", "amber", "red"] as const;
const accent: PropSpec = { type: "enum", values: [...themeColors], aliases: { purple: "violet", gray: "neutral", grey: "neutral", zinc: "neutral", yellow: "amber" } };
const radius: PropSpec = { type: "enum", values: ["none", "sm", "md", "lg", "xl"] };
const density: PropSpec = { type: "enum", values: ["compact", "comfortable", "spacious"] };

export const components: readonly ComponentSpec[] = [
  // Layout
  {
    name: "Page",
    group: "Layout",
    description: "top-level container; accent sets the colour theme",
    children: true,
    props: { gap, width: { type: "enum", values: ["full", "wide", "narrow"] }, accent, radius, density },
  },
  { name: "Stack", group: "Layout", description: "vertical stack", children: true, props: { gap, align, justify } },
  { name: "Row", group: "Layout", description: "horizontal row; wrap for responsive", children: true, props: { gap, align, justify, wrap: { type: "boolean" } } },
  {
    name: "Grid",
    group: "Layout",
    description: "responsive grid",
    children: true,
    props: { cols: { type: "number", default: 3, description: "columns on wide screens (1–6)" }, gap },
  },
  {
    name: "Cell",
    group: "Layout",
    description: "grid cell spanning columns/rows",
    children: true,
    props: { span: { type: "number" }, rows: { type: "number" }, gap },
  },
  {
    name: "Box",
    group: "Layout",
    description: "free layout: direction, alignment, padding, surface",
    children: true,
    props: {
      dir: { type: "enum", values: ["col", "row"], default: "col", aliases: { column: "col", vertical: "col", horizontal: "row" } },
      gap,
      align,
      justify,
      pad: { type: "enum", values: ["none", "sm", "md", "lg", "xl"] },
      surface: { type: "enum", values: ["none", "card", "sunk", "tint", "outline", "inverse", "accent", "gradient"] },
      wrap: { type: "boolean" },
      fill: { type: "boolean", description: "children share the space equally" },
      grow: { type: "boolean" },
      w: { type: "number", description: "fixed width in px" },
      text: { type: "enum", values: ["start", "center", "end"] },
      accent,
    },
  },
  { name: "Spacer", group: "Layout", description: "pushes siblings apart", props: {} },
  {
    name: "Card",
    group: "Layout",
    description: "surface for related content",
    children: true,
    props: { v: { type: "enum", values: ["card", "sunk", "outline", "clear"], default: "card" }, gap, accent },
    aliases: { variant: "v" },
  },
  {
    name: "Header",
    group: "Layout",
    description: "title with optional subtitle",
    args: ["title", "subtitle?"],
    props: {
      title: { type: "string", required: true },
      subtitle: { type: "string" },
      eyebrow: { type: "string", description: "small label above" },
      size: { type: "enum", values: ["sm", "md", "lg", "xl"] },
      align: { type: "enum", values: ["start", "center"] },
    },
  },
  { name: "Separator", group: "Layout", props: {} },
  { name: "Tabs", group: "Layout", children: { of: ["Tab"] }, props: { v: { type: "enum", values: ["line", "pills"], default: "line" }, bind } },
  { name: "Tab", group: "Layout", args: ["label"], children: true, props: { label: { type: "string", required: true }, icon } },
  { name: "Accordion", group: "Layout", children: { of: ["Item"] }, props: { multiple: { type: "boolean" } } },
  {
    name: "Item",
    group: "Layout",
    description: "collapsible accordion section",
    args: ["title"],
    children: true,
    props: { title: { type: "string", required: true }, open: { type: "boolean" } },
  },
  {
    name: "Carousel",
    group: "Layout",
    description: "horizontal strip of cards with arrows; nav adds page indicators",
    children: true,
    props: {
      per: { type: "number", description: "items visible at once" },
      nav: { type: "enum", values: ["none", "dots", "bars", "count"], default: "none" },
      arrows: { type: "enum", values: ["always", "hover", "none"], default: "always" },
      autoplay: { type: "number", description: "seconds per page" },
    },
  },
  {
    name: "Slides",
    group: "Layout",
    description: "presentation; v:viewer adds a title bar, thumbnail rail and present button",
    children: { of: ["Slide"] },
    props: {
      title: { type: "string" },
      subtitle: { type: "string" },
      v: { type: "enum", values: ["deck", "viewer"], default: "deck" },
      ratio: { type: "string", description: "16:9 (default), 4:3 or auto" },
    },
  },
  {
    name: "Report",
    group: "Layout",
    description: "PDF-style document of paper pages: thumbnails, zoom, Download PDF",
    children: { of: ["Sheet"] },
    props: { title: { type: "string" }, subtitle: { type: "string" }, size: { type: "enum", values: ["a4", "letter"], default: "a4" } },
  },
  {
    name: "Sheet",
    group: "Layout",
    description: "one report page; any content",
    children: true,
    props: {
      layout: { type: "enum", values: ["top", "center", "split"] },
      bg: { type: "enum", values: ["plain", "inverse", "accent", "gradient"] },
      image: { ...loads, description: "background photo URL (cover pages)" },
    },
  },
  {
    name: "Slide",
    group: "Layout",
    description: "one slide; any content",
    children: true,
    props: {
      layout: { type: "enum", values: ["center", "top", "split"] },
      bg: { type: "enum", values: ["plain", "inverse", "accent", "gradient"] },
      image: { ...loads, description: "background photo URL" },
    },
  },

  // Content
  {
    name: "Text",
    group: "Content",
    description: "Markdown text (a string child is a Text)",
    args: ["content"],
    props: { content: { type: "string", required: true }, size, muted: { type: "boolean" }, align: { type: "enum", values: ["start", "center", "end"] } },
  },
  {
    name: "Callout",
    group: "Content",
    args: ["content"],
    props: {
      content: { type: "string", required: true },
      title: { type: "string" },
      tone: { ...tone, default: "info" },
      v: { type: "enum", values: ["soft", "bar"], default: "soft" },
      icon,
    },
  },
  { name: "Tag", group: "Content", args: ["label"], props: { label: { type: "string", required: true }, tone: { ...tone, default: "neutral" }, icon, pill: { type: "boolean" } } },
  { name: "Tags", group: "Content", children: { of: ["Tag"] }, props: {} },
  { name: "Icon", group: "Content", args: ["name"], props: { name: { ...icon, required: true }, tone, size, plain: { type: "boolean" } } },
  {
    name: "Image",
    group: "Content",
    args: ["src", "alt?"],
    props: {
      src: { ...loads, required: true },
      alt: { type: "string" },
      caption: { type: "string" },
      ratio: { type: "string", description: "e.g. 16:9, 4:3, 1:1" },
      zoom: { type: "boolean", description: "click opens a lightbox" },
    },
  },
  {
    name: "Gallery",
    group: "Content",
    description: "photo grid; a click opens a lightbox with prev/next",
    args: ["images"],
    props: {
      images: { type: "array", items: { type: "string", format: "url" }, required: true, description: "image URLs" },
      captions: { type: "array", items: { type: "string" } },
      cols: { type: "number", default: 3 },
      ratio: { type: "string", description: "thumbnail ratio, default 1:1" },
      v: { type: "enum", values: ["grid", "strip"], default: "grid" },
    },
  },
  {
    name: "Media",
    group: "Content",
    description: "image card: photo, tag, title (places, products, articles)",
    args: ["src"],
    props: {
      src: { ...loads, required: true },
      title: { type: "string" },
      subtitle: { type: "string" },
      tag: { type: "string" },
      meta: { type: "string" },
      v: { type: "enum", values: ["below", "overlay", "cover"], default: "below", description: "caption position" },
      ratio: { type: "string" },
      href: url,
      alt: { type: "string" },
      zoom: { type: "boolean", description: "click opens a lightbox" },
      do: action,
    },
  },
  {
    name: "Tile",
    group: "Content",
    description: "row with icon, title/subtitle and a value on the right; body adds a paragraph",
    args: ["title", "subtitle?"],
    props: {
      title: { type: "string", required: true },
      subtitle: { type: "string" },
      icon,
      value: { type: "string", description: "+/- values are coloured" },
      mono: { type: "boolean", description: "do not colour signed values" },
      note: { type: "string", description: "under the value" },
      body: { type: "string", description: "Markdown paragraph" },
      tone,
      image: loads,
      href: url,
      v: { type: "enum", values: ["sunk", "card", "plain"], default: "sunk" },
      do: action,
    },
  },
  {
    name: "Source",
    group: "Content",
    description: "citation card",
    args: ["title", "url"],
    props: { title: { type: "string", required: true }, url: { type: "string", required: true }, site: { type: "string" }, icon, image: { ...loads, description: "logo URL" } },
  },
  { name: "Quote", group: "Content", args: ["text", "by?"], props: { text: { type: "string", required: true }, by: { type: "string" } } },
  {
    name: "Timeline",
    group: "Content",
    description: "steps/itinerary from a table |Title|Detail|Meta|State(done/current)",
    args: ["data"],
    props: { data: { type: "data", required: true }, numbered: { type: "boolean", default: true } },
  },
  {
    name: "Code",
    group: "Content",
    description: "code block with highlighting and copy",
    args: ["code"],
    props: { code: { type: "string", required: true }, lang: { type: "string" }, title: { type: "string" }, numbered: { type: "boolean" } },
  },
  {
    name: "Math",
    group: "Content",
    description: "TeX formula",
    args: ["tex"],
    props: { tex: { type: "string", required: true }, inline: { type: "boolean" } },
  },
  {
    name: "Diagram",
    group: "Content",
    description: "Mermaid diagram source",
    args: ["source"],
    props: { source: { type: "string", required: true }, title: { type: "string" } },
  },
  {
    name: "Video",
    group: "Content",
    description: "YouTube, Vimeo or an mp4/webm URL",
    args: ["src"],
    props: { src: { ...loads, required: true }, title: { type: "string" }, poster: loads, ratio: { type: "string" } },
  },
  {
    name: "Avatar",
    group: "Content",
    description: "person: photo or initials, name, role",
    args: ["name", "subtitle?"],
    props: { name: { type: "string", required: true }, subtitle: { type: "string" }, src: loads, size },
  },
  {
    name: "KeyValue",
    group: "Data",
    description: "label/value pairs from a table |Key|Value",
    args: ["data"],
    props: { data: { type: "data", required: true }, cols: { type: "number" } },
  },
  {
    name: "Pricing",
    group: "Data",
    description: "plan cards from |Plan|Price|Period|Features (; separated)|Note",
    args: ["data"],
    props: { data: { type: "data", required: true }, highlight: { type: "string", description: "plan to feature" }, cta: { type: "string" }, do: action },
  },
  {
    name: "Frame",
    group: "Layout",
    description: "free-form box: layout and look all from style",
    children: true,
    props: { style: { type: "object", description: "see Custom design" } },
  },
  {
    name: "Hero",
    group: "Layout",
    description: "big intro: eyebrow, title, subtitle, image, call to action",
    args: ["title", "subtitle?"],
    props: { title: { type: "string", required: true }, subtitle: { type: "string" }, eyebrow: { type: "string" }, image: loads, cta: { type: "string" }, href: url, do: action, align: { type: "enum", values: ["start", "center"] } },
  },
  {
    name: "FollowUps",
    group: "Content",
    description: "suggested next questions; a click sends one",
    args: ["items"],
    props: { items: { type: "array", items: { type: "string" }, required: true } },
  },

  // Data
  {
    name: "Table",
    group: "Data",
    args: ["data"],
    description: "long tables page automatically",
    props: {
      data: { type: "data", required: true },
      pageSize: { type: "number", description: "rows per page, max 200; 0 = one page" },
      sort: { type: "boolean", description: "every column sortable" },
      sortable: { type: "array", items: { type: "string" }, description: "only these columns sortable" },
      order: { type: "string", description: "initial sort: \"Col\" or \"-Col\" (descending)" },
      search: { type: "boolean", description: "search box" },
      filter: { type: "array", items: { type: "string" }, description: "columns with filter chips" },
      tags: { type: "array", items: { type: "string" }, description: "columns shown as tags" },
      striped: { type: "boolean" },
    },
  },
  {
    name: "Stat",
    group: "Data",
    description: "one KPI",
    args: ["label", "value", "delta?"],
    props: {
      label: { type: "string", required: true },
      value: { type: "string", required: true },
      delta: { type: "string" },
      note: { type: "string" },
      icon,
      spark: { type: "array", items: { type: "number" }, description: "sparkline values" },
      invert: { type: "boolean", description: "lower is better (churn, cost)" },
    },
  },
  { name: "Stats", group: "Data", description: "KPI row from a table |Label|Value|Delta|Note", args: ["data"], props: { data: { type: "data", required: true } } },
  {
    name: "Progress",
    group: "Data",
    args: ["value", "label?"],
    props: { value: { type: "number", required: true }, label: { type: "string" }, max: { type: "number", default: 100 }, note: { type: "string" }, tone },
  },
  {
    name: "Chart",
    group: "Data",
    description: "chart from a table: first column = x, other columns = series",
    args: ["data"],
    props: {
      data: { type: "data", required: true },
      type: { type: "enum", values: ["bar", "hbar", "line", "area", "pie", "donut", "scatter"], default: "bar", aliases: { column: "bar", doughnut: "donut" } },
      title: { type: "string" },
      subtitle: { type: "string" },
      x: { type: "string" },
      y: { type: "string", description: "y-axis label" },
      height: { type: "number" },
      select: { type: "enum", values: ["point", "range"], default: "point" },
      bind,
      stacked: { type: "boolean" },
      zoom: { type: "boolean" },
      legend: { type: "boolean" },
    },
  },

  // Forms
  {
    name: "Form",
    group: "Forms",
    description: "validates on submit; Step children make a step form",
    args: ["name"],
    children: true,
    props: {
      name: { type: "string", required: true },
      id: { type: "string", description: "stable id your app routes on" },
      validate: { type: "enum", values: ["submit", "blur", "change"], default: "submit", description: "when fields are checked" },
      success: { type: "string", description: "message shown after a valid submit" },
      submit: { type: "string", description: "submit label; added if no primary Button" },
      draft: { type: "string", description: "partial-save button label" },
    },
  },
  {
    name: "Step",
    group: "Forms",
    description: "one step of a step form; validated before Continue",
    args: ["title"],
    children: true,
    props: { title: { type: "string", required: true }, hint: { type: "string" } },
  },
  {
    name: "Dialog",
    group: "Forms",
    description: "modal or side drawer; open with Button(opens:id) or trigger:",
    args: ["title"],
    children: true,
    props: {
      title: { type: "string", required: true },
      subtitle: { type: "string" },
      v: { type: "enum", values: ["modal", "drawer"], default: "modal" },
      side: { type: "enum", values: ["right", "left", "bottom"], default: "right" },
      size: { type: "enum", values: ["sm", "md", "lg", "xl"], default: "md" },
      trigger: { type: "string", description: "label of its own open button" },
      icon,
    },
  },
  {
    name: "Input",
    group: "Forms",
    args: ["name", "label"],
    props: {
      name: { type: "string", required: true },
      label: { type: "string", required: true },
      type: { type: "enum", values: ["text", "email", "number", "password", "url", "tel", "date"], default: "text" },
      placeholder: { type: "string" },
      value: { type: "string", description: "initial value" },
      min: { type: "number" },
      max: { type: "number" },
      minLength: { type: "number" },
      maxLength: { type: "number" },
      pattern: { type: "string", description: "regex the value must match" },
      match: { type: "string", description: "name of a field it must equal" },
      protocols: { type: "array", items: { type: "string" }, description: "allowed URL protocols, default http/https" },
      error: { type: "string", description: "custom error message" },
      bind,
      size,
      hint: { type: "string", description: "help text under the field" },
      required: { type: "boolean" },
    },
  },
  {
    name: "TextArea",
    group: "Forms",
    args: ["name", "label"],
    props: {
      name: { type: "string", required: true },
      label: { type: "string", required: true },
      placeholder: { type: "string" },
      value: { type: "string" },
      rows: { type: "number", default: 4 },
      minLength: { type: "number" },
      maxLength: { type: "number" },
      error: { type: "string" },
      bind,
      size,
      hint: { type: "string", description: "help text under the field" },
      required: { type: "boolean" },
    },
  },
  {
    name: "Select",
    group: "Forms",
    args: ["name", "label", "options"],
    props: {
      name: { type: "string", required: true },
      label: { type: "string", required: true },
      options: { type: "array", items: { type: "string" }, required: true },
      placeholder: { type: "string" },
      value: { type: "any", description: "initial option; a list with multiple" },
      error: { type: "string" },
      bind,
      size,
      hint: { type: "string" },
      multiple: { type: "boolean" },
      required: { type: "boolean" },
    },
  },
  {
    name: "Combobox",
    group: "Forms",
    description: "searchable select; multiple shows chips",
    args: ["name", "label", "options"],
    props: {
      name: { type: "string", required: true },
      label: { type: "string", required: true },
      options: { type: "array", items: { type: "string" }, required: true },
      placeholder: { type: "string" },
      value: { type: "any", description: "initial option; a list with multiple" },
      error: { type: "string" },
      bind,
      size,
      hint: { type: "string" },
      multiple: { type: "boolean" },
      required: { type: "boolean" },
    },
  },
  {
    name: "RadioGroup",
    group: "Forms",
    description: "pick one; v:cards (icons/images, hints), v:segmented toggle bar",
    args: ["name", "label", "options"],
    props: {
      name: { type: "string", required: true },
      label: { type: "string", required: true },
      options: { type: "array", items: { type: "string" }, required: true },
      hints: { type: "array", items: { type: "string" }, description: "one line per option" },
      icons: { type: "array", items: { type: "string" }, description: "icon per option (cards)" },
      images: { type: "array", items: { type: "string", format: "url" }, description: "image URL per option (cards)" },
      cols: { type: "number", description: "card columns" },
      value: { type: "string", description: "initially selected option" },
      v: { type: "enum", values: ["list", "cards", "segmented"], default: "list" },
      dir: { type: "enum", values: ["col", "row"] },
      error: { type: "string" },
      bind,
      size,
      hint: { type: "string" },
      required: { type: "boolean" },
    },
  },
  {
    name: "CheckboxGroup",
    group: "Forms",
    description: "pick many; v:cards (icons/images, hints), v:chips toggle pills",
    args: ["name", "label", "options"],
    props: {
      name: { type: "string", required: true },
      label: { type: "string", required: true },
      options: { type: "array", items: { type: "string" }, required: true },
      hints: { type: "array", items: { type: "string" }, description: "one line per option" },
      icons: { type: "array", items: { type: "string" }, description: "icon per option (cards)" },
      images: { type: "array", items: { type: "string", format: "url" }, description: "image URL per option (cards)" },
      cols: { type: "number", description: "card columns" },
      value: { type: "array", items: { type: "string" }, description: "initially checked options" },
      min: { type: "number", description: "fewest that must be picked" },
      max: { type: "number", description: "most that can be picked" },
      error: { type: "string" },
      v: { type: "enum", values: ["list", "cards", "chips"], default: "list" },
      dir: { type: "enum", values: ["col", "row"] },
      bind,
      size,
      hint: { type: "string" },
      required: { type: "boolean" },
    },
  },
  {
    name: "TagInput",
    group: "Forms",
    description: "free-form tags (Enter adds); options are suggestions",
    args: ["name", "label"],
    props: {
      name: { type: "string", required: true },
      label: { type: "string", required: true },
      options: { type: "array", items: { type: "string" } },
      value: { type: "array", items: { type: "string" } },
      type: { type: "enum", values: ["text", "email", "url"], default: "text", description: "each tag is checked" },
      placeholder: { type: "string" },
      min: { type: "number" },
      max: { type: "number" },
      error: { type: "string" },
      bind,
      size,
      hint: { type: "string" },
      required: { type: "boolean" },
    },
  },
  {
    name: "Checkbox",
    group: "Forms",
    args: ["name", "label"],
    props: { name: { type: "string", required: true }, label: { type: "string", required: true }, bind, checked: { type: "boolean" }, required: { type: "boolean" }, error: { type: "string" } },
  },
  {
    name: "DatePicker",
    group: "Forms",
    args: ["name", "label"],
    props: {
      name: { type: "string", required: true },
      label: { type: "string", required: true },
      value: { type: "any", description: "\"2026-10-01\", or [start, end] with range" },
      min: { type: "string" },
      max: { type: "string" },
      bind,
      hint: { type: "string" },
      required: { type: "boolean" },
      error: { type: "string" },
      size,
      range: { type: "boolean", description: "start and end dates" },
      presets: { type: "boolean", description: "quick ranges (last 7 days…)" },
      time: { type: "boolean", description: "also pick a time" },
    },
  },
  {
    name: "TimePicker",
    group: "Forms",
    args: ["name", "label"],
    props: {
      name: { type: "string", required: true },
      label: { type: "string", required: true },
      step: { type: "number", description: "minutes, default 30" },
      min: { type: "string", description: "\"09:00\"" },
      max: { type: "string" },
      value: { type: "string" },
      placeholder: { type: "string" },
      error: { type: "string" },
      bind,
      required: { type: "boolean" },
      hint: { type: "string" },
      size,
    },
  },
  {
    name: "Slider",
    group: "Forms",
    args: ["name", "label"],
    props: {
      name: { type: "string", required: true },
      label: { type: "string", required: true },
      min: { type: "number" },
      max: { type: "number" },
      step: { type: "number" },
      value: { type: "number" },
      unit: { type: "string", description: "shown after the value, e.g. \"%\"" },
      bind,
      hint: { type: "string" },
    },
  },
  {
    name: "Switch",
    group: "Forms",
    args: ["name", "label"],
    props: { name: { type: "string", required: true }, label: { type: "string", required: true }, bind, checked: { type: "boolean" } },
  },
  {
    name: "Button",
    group: "Forms",
    description: "do: runs steps, opens:dialog, close, href link; else sends its label",
    args: ["label"],
    props: {
      label: { type: "string", required: true },
      do: action,
      opens: { type: "node", of: ["Dialog"], description: "id of a Dialog to open" },
      close: { type: "boolean", description: "closes the dialog it is in" },
      type: { type: "enum", values: ["button", "submit", "reset", "draft"], description: "in a Form, primary buttons submit" },
      v: { type: "enum", values: ["primary", "accent", "secondary", "ghost", "link", "danger"], default: "primary" },
      icon,
      href: url,
      size,
      full: { type: "boolean" },
      iconOnly: { type: "boolean", description: "hides the label (kept as tooltip): icon buttons, swatches" },
      disabled: { type: "boolean" },
    },
    aliases: { variant: "v" },
  },
  { name: "Buttons", group: "Forms", description: "a row of buttons", children: { of: ["Button"] }, props: { align: { type: "enum", values: ["start", "end"] } } },
];

/** Named component unions (none in the default catalog: a Page takes any component). */
export const unions: Readonly<Record<string, readonly string[]>> = {};



/**
 * Composition guidance for the model: how to turn an answer into a great screen with this catalog.
 * Short on purpose; it is part of every system prompt.
 */
export const guide = `Design:
- Lead with Header(title, one-line subtitle), then the key numbers, then detail, then FollowUps. Answer in UI, not prose.
- Put related items side by side: Grid(cols:2-4) or Row(wrap). Avoid long single columns.
- Dashboards: Grid(Stat(label, value, delta, note:, icon:, spark:[…]), …, cols:4) for KPIs (invert when lower is better); charts in Cards; Cell(span:2) for the main chart. In a one-column answer a chart goes straight on the page: Chart(t, title:, subtitle:).
- Metrics: Stats(table) or Tile(title, subtitle, icon:, value:"+12%", note:) in Grid(cols:2); signed values are coloured.
- Explanations, pros/cons, risks: Tile(title, subtitle, icon:, body:"…", tone:) in Grid(cols:2); tone:danger/warning for risks.
- Places, products, people, articles: Media(src, title:, subtitle:, tag:, v:overlay) in Grid(cols:3) or Carousel(per:3, nav:dots).
- Photo sets: Gallery([urls], captions:[…]) opens a lightbox; one big photo: Image(src, zoom).
- Sequences, itineraries, roadmaps: Timeline(table). Citations: Source(title, url) in Grid(cols:3). Notes: Callout(v:bar).
- Actions that need input open a Dialog: Button("Invite", opens:invite) + invite = Dialog("Invite teammates", Form(…)); v:drawer for filters/details. Cancel = Button("Cancel", v:ghost, close).
- Validation lives on fields: required, type:email|url|number|tel, minLength, maxLength, pattern:, match:"password", protocols:["https"], error:"…". Long forms: Form(…, Step("Account", …), Step("Profile", …)).
- Forms: group fields in Cards with Header(size:sm) inside one Form; Grid(cols:2) for short fields; RadioGroup(v:cards) for one plan, CheckboxGroup(v:cards or chips) for several; v:segmented for 2–4 short choices; Combobox for long lists; TagInput for free keywords.
- Tables with 8+ rows: sort (or sortable:["Col"]), order:"-Col", search, filter:["Col"], tags:["Status"]; pageSize:0 keeps every row on one page.
- Group long answers in Tabs. Presentations: Slides(Slide(…)…, v:viewer), one idea per slide, first slide layout:center with image: or bg:inverse. Reports and documents: Report(Sheet(…)…, title:), a cover sheet then 3–8 content sheets (Header, Stats, Chart, Table, Callout).
- Landing pages: Hero(title, subtitle, image:, cta:) then Pricing(table, highlight:"Pro"). Specs and details: KeyValue(table). Code(code, lang:), Math(tex), Video(url), Avatar(name, role) where they fit.
- Anything else: Box(dir:row, gap:, pad:, surface:, align:, justify:). Page accent: fits the topic.
- Custom design only when components cannot express it: Frame(…, style:{…}) is a free-form box; layout components, Card, Text, Header, Image, Tag, Stat and Button take style:{…} too. Keys: layout:row|column|grid|overlay, gap, pad, align, justify, wrap, cols, w, h, maxW, pos:absolute, x, y, fill (colour; linear(…) gradient only if asked), image, stroke, radius, shadow, opacity, rotate, font:serif|mono, size, weight, color, tracking, upper, hover:lift. Colours: accent, fg, muted, surface, sunk, success… (accent/15 = 15%) or #hex; numbers are px.
- Keep text short; numbers in text and stats formatted ($4.2M, +12%, 3.4k); chart tables hold plain numbers.`;

/** The canonical prompt example: one small dashboard that exercises the main idioms. */
export const examples: readonly string[] = [
  `root = Page(head, kpis, Grid(trend, mix, cols:2), drivers, more, gap:lg, accent:blue)
head = Header("Q3 revenue", "All regions · updated Oct 1")
kpis = Stats(kpiData)
trend = Card(Chart(rev, type:area, title:"Monthly revenue", y:"USD"))
mix = Card(Chart(channels, type:donut, title:"By channel"))
drivers = Grid(Tile("Enterprise", "Largest segment", icon:building, value:"+14%", note:"QoQ"), Tile("Churn", "Down from 3.1%", icon:users, value:"-0.4pt", note:"QoQ"), cols:2)
more = FollowUps(["Compare with Q2", "Show top customers"])
kpiData = |Label|Value|Delta|Note
|Revenue|$1.2M|+8%|vs Q2
|Customers|3,410|+2.1%|vs Q2
rev = |Month|Revenue
|Jul|380000
|Aug|402000
|Sep|431000
channels = |Channel|Share
|Organic|46
|Paid|31
|Partners|23`,
];

/** The default library, compiled for the core engine. */
export const library: Library = defineLibrary({ components, unions });

/**
 * The system prompt for the default components, for any framework (React, Vue, Svelte, Solid, the
 * DOM renderer). Byte-stable, so provider prompt caching hits. Call it where you call the model.
 *
 *   import { prompt } from "@gistui/catalog";
 *   const system = prompt().text;                    // a whole answer is a GistUI program
 *   const chat = prompt({ mode: "inline" }).text;    // chat text with ```gistui blocks
 */
export function prompt(opts: PromptOptions = {}): GeneratedPrompt {
  return generatePrompt(library, { libraryExamples: examples, examples: "one", libraryGuide: guide, ...opts });
}
