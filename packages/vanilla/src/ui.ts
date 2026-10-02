/**
 * `@gistui/vanilla/ui`: the default components as plain DOM, over the shared catalog, styles, headless
 * logic and widgets. Import the stylesheet once: `import "@gistui/styles/styles.css"`.
 * Components not ported yet render their children in a plain box.
 */

// The catalog without prompt text: descriptions, the design guide and examples stay on the server.
import { components as specs, unions } from "@gistui/catalog/render";
import { defineLibrary } from "@gistui/core";
import { libraryOf } from "./library";
import { lazyGroup } from "./lazy";
import type { DomRenderer } from "./types";
import { h } from "./dom";
import { iconEl } from "./ui/icon";
import { Form, Step } from "./ui/form";
import { Button, Buttons, Checkbox, Input, NativeSelect, Switch, TextArea } from "./ui/forms";
import { Dialog } from "./ui/overlay";
import { Chart, Progress, Stat, Stats, Table } from "./ui/data";
import { Callout, FollowUps, Icon, Image, Quote, Tag, Tags, Text } from "./ui/content";
import { Box, Card, Carousel, Cell, Frame, Grid, Header, Page, Row, Separator, Spacer, Stack, Tab, Tabs } from "./ui/layout";

// Zag's select and its positioning engine are their own chunk. A look-alike trigger shows while it
// loads; if it cannot be loaded, a native <select> takes over so the form still works.
const selects = lazyGroup(() => import("./ui/select"));
const selectPlaceholder: DomRenderer = (ctx) => {
  const label = h("span", { class: "gistui-field__label" }, String(ctx.props.label ?? ""));
  const trigger = h("button", { type: "button", "data-part": "trigger", disabled: true }, h("span", { "data-part": "value-text", "data-placeholder-shown": "" }, String(ctx.props.placeholder || "Select…")), h("span", { "data-part": "indicator", "aria-hidden": "true" }, iconEl("chevron-down")));
  return { el: h("div", { class: "gistui-field gistui-select", "data-gistui": "Select", "data-size": ctx.props.size as string | undefined }, label, trigger) };
};
const Select = selects.get("Select", selectPlaceholder, NativeSelect);
/** Starts loading the select chunk early. */
export const preloadSelect = (): Promise<unknown> => selects.load();

// Less common choice controls load in their own chunks (first load stays small).
const choice = lazyGroup(() => import("./ui/choice"));
const combo = lazyGroup(() => import("./ui/combobox"));
const comboPlaceholder: DomRenderer = (ctx) => ({
  el: h(
    "div",
    { class: "gistui-field gistui-combobox", "data-gistui": "Combobox", "data-size": ctx.props.size as string | undefined },
    h("span", { class: "gistui-field__label" }, String(ctx.props.label ?? "")),
    h("div", { class: "gistui-combobox__control" }, iconEl("search", "gistui-combobox__search"), h("input", { class: "gistui-input", placeholder: String(ctx.props.placeholder ?? "Search…"), disabled: true })),
  ),
});

const extras = lazyGroup(() => import("./ui/extras"));
const rich = lazyGroup(() => import("./ui/rich"));
const accordion = lazyGroup(() => import("./ui/accordion"));
const gallery = lazyGroup(() => import("./ui/lightbox"));
const slides = lazyGroup(() => import("./ui/slides"));
const pickers = lazyGroup(() => import("./ui/datepicker"));

const renderers: Record<string, DomRenderer> = {
  Page,
  Stack,
  Row,
  Grid,
  Cell,
  Box,
  Frame,
  Card,
  Header,
  Separator,
  Spacer,
  Tabs,
  Tab,
  Carousel,
  Text,
  Callout,
  Tag,
  Tags,
  Image,
  Icon,
  Quote,
  FollowUps,
  Table,
  Stat,
  Stats,
  Progress,
  Chart,
  Form,
  Step,
  Input,
  TextArea,
  Checkbox,
  Switch,
  Button,
  Buttons,
  Dialog,
  Select,
  RadioGroup: choice.get("RadioGroup"),
  CheckboxGroup: choice.get("CheckboxGroup"),
  TagInput: choice.get("TagInput"),
  Combobox: combo.get("Combobox", comboPlaceholder),
  DatePicker: pickers.get("DatePicker"),
  TimePicker: pickers.get("TimePicker"),
  Slider: extras.get("Slider"),
  Code: extras.get("Code"),
  Math: extras.get("MathView"),
  Diagram: extras.get("Diagram"),
  Video: extras.get("Video"),
  Avatar: extras.get("Avatar"),
  KeyValue: extras.get("KeyValue"),
  Pricing: extras.get("Pricing"),
  Hero: extras.get("Hero"),
  Tile: rich.get("Tile"),
  Media: rich.get("Media"),
  Source: rich.get("Source"),
  Timeline: rich.get("Timeline"),
  Accordion: accordion.get("Accordion"),
  Item: accordion.get("Item"),
  Gallery: gallery.get("Gallery"),
  Slides: slides.get("Slides"),
  Slide: slides.get("Slide"),
  Sheet: slides.get("Sheet"),
  Report: slides.get("Report"),
};

export const ui = libraryOf(defineLibrary({ components: specs, unions }), new Map(Object.entries(renderers)));
export { preloadDesign } from "./design";
export { preloadChart } from "./ui/data";
export { preloadFormSchema } from "./ui/form";
export { preloadLightbox } from "./ui/lightbox-open";
