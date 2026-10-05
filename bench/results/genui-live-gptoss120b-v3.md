# Live run: gptoss120b-v3

GistUI answers written by the model (`bench/genui/raw/gptoss120b-v3`), scored by `bench/genui/score.ts` on 2026-10-05; the other formats are the bench's committed runs of the same model on the same briefs and repeats. GistUI generation cost: $0.18.

| format | runs | complete | renderable | mean output tokens | failure classes |
|---|---:|---:|---:|---:|---|
| gistui | 182 | 87.9% | 100.0% | 587 | malformed-syntax 1, signature-mismatch 13, required-field 9, enum-mismatch 6, reference-graph 6 |
| gistui + autofix | 182 | 100.0% | 100.0% | 587 |  |
| openui | 182 | 84.6% | 100.0% | 601 | signature-mismatch 13, enum-mismatch 17, reference-graph 7, required-field 1, hallucinated-component 2 |

GistUI prompt used for this run: 3,874 tokens (o200k).
