import { GistChildren, type GistUIComponentProps } from "@gistui/solid";

/** Your own Solid component in place of GistUI's Card; <GistChildren /> places the card's content. */
export function MyCard(_: GistUIComponentProps) {
  return (
    <section style={{ padding: "20px", "border-radius": "20px", border: "2px dashed #2c4f7c", background: "color-mix(in srgb, #2c4f7c 6%, transparent)" }}>
      <GistChildren />
    </section>
  );
}
