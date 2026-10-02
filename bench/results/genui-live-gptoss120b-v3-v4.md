# Live run: gptoss120b-v3@v4

GistUI answers written by the model (`bench/genui/raw/gptoss120b-v3@v4`), scored by `bench/genui/score.ts` on 2026-10-02; the other formats are the bench's committed runs of the same model on the same briefs and repeats. GistUI generation cost: $0.18.

| format | runs | complete | renderable | mean output tokens | failure classes |
|---|---:|---:|---:|---:|---|
| gistui | 184 | 79.9% | 100.0% | 552 | reference-graph 15, signature-mismatch 6, malformed-syntax 4, required-field 4, enum-mismatch 18 |
| gistui + autofix | 184 | 100.0% | 100.0% | 552 |  |
| openui | 184 | 84.2% | 100.0% | 597 | signature-mismatch 13, enum-mismatch 18, reference-graph 7, required-field 1, hallucinated-component 2 |

GistUI prompt used for this run: 3,791 tokens (current prompt: 3,738) (o200k).
