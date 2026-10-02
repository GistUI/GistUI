<script lang="ts">
  import { gistField, type GistUIComponentProps } from "../src/index";
  let p: GistUIComponentProps = $props();
  const field = gistField(() => p.ctx);
</script>

<label class="my-input">
  {field.current.label}
  <input
    name={field.current.name}
    value={String(field.current.value ?? "")}
    disabled={field.current.locked}
    aria-invalid={field.current.error ? "true" : undefined}
    oninput={(e) => field.current.setValue(e.currentTarget.value)}
  />
  {#if field.current.error}<p class="my-error">{field.current.error}</p>{/if}
</label>
