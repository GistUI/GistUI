# Live run: gpt5nano

GistUI answers written by the model (`bench/genui/raw/gpt5nano`), scored by `bench/genui/score.ts` on 2026-10-04; the other formats are the bench's committed runs of the same model on the same briefs and repeats. GistUI generation cost: $0.05.

| format | runs | complete | renderable | mean output tokens | failure classes |
|---|---:|---:|---:|---:|---|
| gistui | 184 | 22.8% | 100.0% | 605 | reference-graph 117, malformed-syntax 30, hallucinated-component 47, required-field 22, signature-mismatch 49, enum-mismatch 7 |
| gistui + autofix | 184 | 98.4% | 100.0% | 605 | coverage-floor 3 |
| openui | 184 | 22.3% | 99.5% | 850 | reference-graph 129, hallucinated-component 34, enum-mismatch 44, signature-mismatch 35, required-field 12, root-missing 1 |

GistUI prompt used for this run: 3,874 tokens (o200k).
