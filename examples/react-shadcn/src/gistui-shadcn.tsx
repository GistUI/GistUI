/**
 * GistUI rendered with your shadcn/ui components.
 *
 * The model still writes GistUI (`Input("email", "Email", type:email, required)`), so the prompt and
 * its accuracy do not change. These adapters map each component's props to shadcn's, and join
 * GistUI's behaviour through two hooks:
 *   - `useGistField`: the Form validates the field (required, type, lengths, pattern…), shows its
 *     error, and `bind:$var` works;
 *   - `useGistButton`: `do:` actions, submit and draft in a Form, `opens:` a Dialog, links.
 *
 * Every other component (Header, Chart, Table…) stays GistUI's, themed with shadcn's CSS variables
 * (`shadcnTokens`), so both look like one design system.
 */

import { useId, type ReactNode } from "react";
import type { ComponentProps, GistUITokens } from "@gistui/react";
import { IconSvg, ui, useGistButton, useGistField } from "@gistui/react/ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const str = (v: unknown): string | undefined => (typeof v === "string" && v !== "" ? v : undefined);
const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

/** Label, control, then the error (or the hint): the same order and ARIA as GistUI's fields. */
function Field({ id, label, required, error, hint, children }: { id: string; label: string | undefined; required: boolean; error: string | undefined; hint?: string | undefined; children: ReactNode }) {
  return (
    <div className="grid gap-2">
      {label && (
        <Label htmlFor={id}>
          {label}
          {required && <span className="text-destructive">*</span>}
        </Label>
      )}
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : (
        hint && <p className="text-sm text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}

function ShadcnCard({ props, children }: ComponentProps) {
  const v = str(props.v) ?? "card";
  return (
    <Card data-gistui="Card" className={cn("gap-0 py-0", v === "sunk" && "border-0 bg-muted shadow-none", v === "outline" && "shadow-none", v === "clear" && "border-0 bg-transparent shadow-none")}>
      <CardContent className="flex flex-col gap-4 p-6">{children}</CardContent>
    </Card>
  );
}

const VARIANTS = { primary: "default", accent: "default", secondary: "outline", ghost: "ghost", link: "link", danger: "destructive" } as const;

function ShadcnButton(p: ComponentProps) {
  const b = useGistButton(p);
  const variant = VARIANTS[b.variant as keyof typeof VARIANTS] ?? "default";
  const size = b.iconOnly ? "icon" : b.size === "sm" ? "sm" : b.size === "lg" ? "lg" : "default";
  const inner = (
    <>
      {b.icon && <IconSvg name={b.icon} />}
      {!b.iconOnly && b.label}
    </>
  );
  if (b.href) {
    return (
      <Button asChild variant={variant} size={size} className={cn(b.full && "w-full")}>
        <a href={b.href} target="_blank" rel="noopener noreferrer">
          {inner}
        </a>
      </Button>
    );
  }
  return (
    <>
      <Button variant={variant} size={size} className={cn(b.full && "w-full")} aria-label={b.iconOnly ? b.label : undefined} title={b.iconOnly ? b.label : undefined} {...b.buttonProps}>
        {inner}
      </Button>
      {b.dialog}
    </>
  );
}

const INPUT_TYPES = new Set(["text", "email", "number", "password", "url", "tel", "date"]);

function ShadcnInput(p: ComponentProps) {
  const id = useId();
  const field = useGistField(p);
  const type = str(p.props.type) ?? "text";
  const value = field.bound
    ? { value: field.value == null ? "" : String(field.value), onChange: (e: React.ChangeEvent<HTMLInputElement>) => field.setValue(type === "number" && e.target.value !== "" ? Number(e.target.value) : e.target.value) }
    : { defaultValue: str(p.props.value) ?? (typeof p.props.value === "number" ? String(p.props.value) : undefined) };
  return (
    <Field id={id} label={field.label} required={field.required} error={field.error} hint={str(p.props.hint)}>
      <Input
        id={id}
        name={field.name}
        type={INPUT_TYPES.has(type) ? type : "text"}
        placeholder={str(p.props.placeholder)}
        min={num(p.props.min)}
        max={num(p.props.max)}
        disabled={field.locked}
        aria-invalid={field.error ? true : undefined}
        aria-describedby={field.error ? `${id}-error` : undefined}
        {...value}
      />
    </Field>
  );
}

function ShadcnTextArea(p: ComponentProps) {
  const id = useId();
  const field = useGistField(p);
  const value = field.bound
    ? { value: field.value == null ? "" : String(field.value), onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => field.setValue(e.target.value) }
    : { defaultValue: str(p.props.value) };
  return (
    <Field id={id} label={field.label} required={field.required} error={field.error} hint={str(p.props.hint)}>
      <Textarea id={id} name={field.name} rows={num(p.props.rows) ?? 4} placeholder={str(p.props.placeholder)} disabled={field.locked} aria-invalid={field.error ? true : undefined} {...value} />
    </Field>
  );
}

// Radix's Select picks one value; GistUI's own Select handles `multiple`.
const BuiltinSelect = ui.components.get("Select")!;

function ShadcnSelect(p: ComponentProps) {
  if (p.props.multiple === true) return <BuiltinSelect {...p} />;
  return <SingleSelect {...p} />;
}

function SingleSelect(p: ComponentProps) {
  const id = useId();
  const field = useGistField(p);
  const options = Array.isArray(p.props.options) ? p.props.options.map(String) : [];
  const value = field.bound ? { value: field.value == null ? "" : String(field.value), onValueChange: (v: string) => field.setValue(v) } : { defaultValue: str(p.props.value) };
  return (
    <Field id={id} label={field.label} required={field.required} error={field.error} hint={str(p.props.hint)}>
      {/* `name` makes Radix render a hidden native select, which the Form reads and validates. */}
      <Select name={field.name} disabled={field.locked} {...value}>
        <SelectTrigger id={id} className="w-full" aria-invalid={field.error ? true : undefined}>
          <SelectValue placeholder={str(p.props.placeholder) ?? "Select…"} />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o} value={o}>
              {o}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

function ShadcnCheckbox(p: ComponentProps) {
  const id = useId();
  const field = useGistField(p, "bool");
  const value = field.bound ? { checked: field.value === true, onCheckedChange: (c: boolean | "indeterminate") => field.setValue(c === true) } : { defaultChecked: p.props.checked === true };
  return (
    <div className="grid gap-2">
      <div className="flex items-center gap-2">
        {/* With `name`, Radix renders a hidden checkbox input that the Form reads. */}
        <Checkbox id={id} name={field.name} disabled={field.locked} aria-invalid={field.error ? true : undefined} {...value} />
        <Label htmlFor={id}>{field.label}</Label>
      </div>
      {field.error && (
        <p role="alert" className="text-sm text-destructive">
          {field.error}
        </p>
      )}
    </div>
  );
}

/** GistUI's built-in components, with these six rendered by shadcn/ui. */
export const shadcnUI = ui.extend({
  Card: ShadcnCard,
  Button: ShadcnButton,
  Input: ShadcnInput,
  TextArea: ShadcnTextArea,
  Select: ShadcnSelect,
  Checkbox: ShadcnCheckbox,
});

/** GistUI's theme from shadcn's CSS variables, so the built-in components match. */
export const shadcnTokens: GistUITokens = {
  font: "inherit",
  radius: 10,
  bg: "var(--background)",
  surface: "var(--card)",
  surfaceSunk: "var(--muted)",
  surfaceHover: "var(--accent)",
  fg: "var(--foreground)",
  fgMuted: "var(--muted-foreground)",
  border: "var(--border)",
  borderStrong: "var(--input)",
  primary: "var(--primary)",
  primaryFg: "var(--primary-foreground)",
  accent: "var(--primary)",
  accentFg: "var(--primary-foreground)",
  danger: "var(--destructive)",
  chart: ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"],
};
