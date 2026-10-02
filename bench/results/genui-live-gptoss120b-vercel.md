# Live run: gptoss120b-vercel

GistUI answers written by the model (`bench/genui/raw/gptoss120b-vercel`), scored by `bench/genui/score.ts` on 2026-10-02; the other formats are the bench's committed runs of the same model on the same briefs and repeats. GistUI generation cost: $0.17.

| format | runs | complete | renderable | mean output tokens | failure classes |
|---|---:|---:|---:|---:|---|
| gistui | 161 | 73.3% | 100.0% | 581 | enum-mismatch 26, reference-graph 14, required-field 7, signature-mismatch 11, malformed-syntax 2 |
| gistui + autofix | 161 | 100.0% | 100.0% | 581 |  |
| openui | 150 | 90.7% | 100.0% | 638 | enum-mismatch 10, signature-mismatch 4, reference-graph 1 |

GistUI prompt used for this run: 3,823 tokens (current prompt: 3,838) (o200k).
