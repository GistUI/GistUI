/**
 * `@gistui/react/ui`: the default components, as React templates over the shared catalog, styles,
 * headless logic and widgets. Import the stylesheet once: `import "@gistui/styles/styles.css"`.
 */

// The catalog without prompt text: descriptions, the design guide and examples stay on the server.
import { components as specs, unions } from "@gistui/catalog/render";
import type { GeneratedPrompt, PromptOptions } from "@gistui/core";
import { lazyGroup } from "./hooks";
import { preloadLightbox } from "./ui/zoom";
import { preloadDesign } from "./design";
import { defineLibrary } from "@gistui/core";
import type { ComponentRenderer } from "./library";
import { libraryOf } from "./library-base";
import { Callout, FollowUps, Icon, Image, Markdown, Quote, Tag, Tags, Text } from "./ui/content";
import { Chart, preloadChart, Progress, Stat, Stats, tables } from "./ui/data";

import { Button, Buttons, Checkbox, Input, preloadSelect, Select, Switch, TextArea } from "./ui/forms";
import { Form, preloadFormSchema, Step } from "./ui/form";
import { Dialog } from "./ui/overlay";
import { Box, Card, Carousel, Cell, Frame, Grid, Header, Page, Row, Separator, Spacer, Stack, Tab, Tabs } from "./ui/layout";


// Less common, heavier components load in their own chunks (plan §1: first load ≤ 60 KB gzip).
const slides = lazyGroup(() => import("./ui/slides"));
const rich = lazyGroup(() => import("./ui/rich"));
const choice = lazyGroup(() => import("./ui/choice"));
const accordion = lazyGroup(() => import("./ui/accordion"));
const gallery = lazyGroup(() => import("./ui/lightbox"));
const extras = lazyGroup(() => import("./ui/extras"));
const pickers = lazyGroup(() => import("./ui/datepicker"));
// Tables are their own chunk too (the group lives in ./ui/data, which also uses it as Chart's fallback).
const Table = tables.get("Table");
const DatePicker = pickers.get("DatePicker");
const TimePicker = pickers.get("TimePicker");
const Slider = extras.get("Slider");
const Code = extras.get("Code");
const MathView = extras.get("MathView");
const Diagram = extras.get("Diagram");
const Video = extras.get("Video");
const Avatar = extras.get("Avatar");
const KeyValue = extras.get("KeyValue");
const Pricing = extras.get("Pricing");
const Hero = extras.get("Hero");
const Accordion = accordion.get("Accordion");
const Item = accordion.get("Item");
const Gallery = gallery.get("Gallery");
const Slides = slides.get("Slides");
const Slide = slides.get("Slide");
const Report = slides.get("Report");
const Sheet = slides.get("Sheet");
const Media = rich.get("Media");
const Source = rich.get("Source");
const Tile = rich.get("Tile");
const Timeline = rich.get("Timeline");
const CheckboxGroup = choice.get("CheckboxGroup");
const Combobox = choice.get("Combobox");
const RadioGroup = choice.get("RadioGroup");
const TagInput = choice.get("TagInput");

/** Loads every lazily loaded component now (tests, or an app that wants them warm). */
export function preloadAll(): Promise<unknown> {
  return Promise.all([preloadChart(), tables.load(), slides.load(), rich.load(), accordion.load(), gallery.load(), extras.load(), pickers.load(), preloadDesign(), preloadLightbox(), preloadFormSchema(), choice.load().then((m) => m.preloadCombobox()), preloadSelect()]);
}

export const renderers: Readonly<Record<string, ComponentRenderer<any>>> = {
  Page,
  Stack,
  Row,
  Grid,
  Cell,
  Box,
  Spacer,
  Carousel,
  Slides,
  Slide,
  Report,
  Sheet,
  Card,
  Header,
  Separator,
  Tabs,
  Tab,
  Accordion,
  Item,
  Text,
  Callout,
  Tag,
  Tags,
  Image,
  Gallery,
  Icon,
  Media,
  Tile,
  Source,
  Quote,
  Timeline,
  FollowUps,
  Table,
  Stat,
  Stats,
  Progress,
  Chart,
  Form,
  Step,
  Dialog,
  Input,
  TextArea,
  Select,
  Combobox,
  RadioGroup,
  CheckboxGroup,
  TagInput,
  Checkbox,
  Switch,
  Button,
  Buttons,
  DatePicker,
  TimePicker,
  Slider,
  Code,
  Math: MathView,
  Diagram,
  Video,
  Avatar,
  KeyValue,
  Pricing,
  Hero,
  Frame,
};

/** The default library: every catalog component with its React template. */
export const ui = libraryOf(
  defineLibrary({ components: specs, unions }),
  new Map(
    specs.map((spec) => {
      const component = renderers[spec.name];
      if (!component) throw new Error(`@gistui/react/ui: no template for ${spec.name}`);
      return [spec.name, component] as const;
    }),
  ),
  [],
  (opts) => {
    if (!promptSlot.current) {
      throw new Error('ui.prompt() needs the prompt text: import "@gistui/react/prompt" (on the server), or use its prompt()');
    }
    return promptSlot.current(opts);
  },
);

/** Set by `@gistui/react/prompt`, which holds the catalog's prompt text. */
export const promptSlot: { current: ((opts?: PromptOptions) => GeneratedPrompt) | null } = { current: null };

export { preloadChart };
// Your own form fields: join the Form around them (validation, errors, bind:$var).
export { useGistField, type GistField } from "./ui/field";
export { useGistButton, type GistButton } from "./ui/forms";
export { FieldError, useField, type FieldKind } from "./ui/form";
export { CheckboxGroup, Combobox, RadioGroup, TagInput };
export { Dialog, Gallery, Report, Sheet, Step };
export { Avatar, Code, DatePicker, Diagram, Frame, Hero, KeyValue, MathView, Pricing, Slider, TimePicker, Video };

export { Lightbox, useLightbox, preloadLightbox } from "./ui/zoom";
export type { LightboxItem } from "./ui/lightbox";
export { Accordion, Box, Button, Buttons, Callout, Card, Carousel, Cell, Chart, Checkbox, FollowUps, Form, Grid, Header, Icon, Image, Input, Item, Markdown, Media, Page, Progress, Quote, Row, Select, Separator, Slide, Slides, Source, Spacer, Stack, Stat, Stats, Switch, Tab, Table, Tabs, Tag, Tags, Text, TextArea, Tile, Timeline };
export { IconSvg } from "./ui/icon";
