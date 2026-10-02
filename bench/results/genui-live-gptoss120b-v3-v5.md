# Live run: gptoss120b-v3@v5

GistUI answers written by the model (`bench/genui/raw/gptoss120b-v3@v5`), scored by `bench/genui/score.ts` on 2026-10-02; the other formats are the bench's committed runs of the same model on the same briefs and repeats. GistUI generation cost: $0.19.

| format | runs | complete | renderable | mean output tokens | failure classes |
|---|---:|---:|---:|---:|---|
| gistui | 184 | 87.0% | 100.0% | 526 | malformed-syntax 1, reference-graph 12, signature-mismatch 3, required-field 5, enum-mismatch 12 |
| gistui + autofix | 184 | 100.0% | 100.0% | 526 |  |
| openui | 184 | 84.2% | 100.0% | 597 | signature-mismatch 13, enum-mismatch 18, reference-graph 7, required-field 1, hallucinated-component 2 |

GistUI prompt used for this run: 3,838 tokens (current prompt: 3,738) (o200k).
