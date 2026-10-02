# Live run: gptoss120b

GistUI answers written by the model (`bench/genui/raw/gptoss120b`), scored by `bench/genui/score.ts` on 2026-09-30; the other formats are the bench's committed runs of the same model on the same briefs and repeats. GistUI generation cost: $0.01.

| format | runs | complete | renderable | mean output tokens | failure classes |
|---|---:|---:|---:|---:|---|
| gistui | 9 | 55.6% | 100.0% | 610 | hallucinated-component 1, signature-mismatch 2, reference-graph 3, required-field 1, enum-mismatch 2, malformed-syntax 2 |
| gistui + autofix | 9 | 100.0% | 100.0% | 610 |  |
| openui | 9 | 88.9% | 100.0% | 691 | enum-mismatch 1 |

GistUI prompt used for this run: 3,061 tokens (current prompt: 3,838) (o200k).
