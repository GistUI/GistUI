# Live run: gptoss120b-v3

GistUI answers written by the model (`bench/genui/raw/gptoss120b-v3`), scored by `bench/genui/score.ts` on 2026-10-02; the other formats are the bench's committed runs of the same model on the same briefs and repeats. GistUI generation cost: $0.20.

| format | runs | complete | renderable | mean output tokens | failure classes |
|---|---:|---:|---:|---:|---|
| gistui | 184 | 78.8% | 100.0% | 559 | enum-mismatch 18, reference-graph 17, required-field 5, signature-mismatch 13, malformed-syntax 3, hallucinated-component 1 |
| gistui + autofix | 184 | 100.0% | 100.0% | 559 |  |
| openui | 184 | 84.2% | 100.0% | 597 | signature-mismatch 13, enum-mismatch 18, reference-graph 7, required-field 1, hallucinated-component 2 |

GistUI prompt used for this run: 3,821 tokens (current prompt: 3,838) (o200k).
