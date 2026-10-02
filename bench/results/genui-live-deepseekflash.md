# Live run: deepseekflash

GistUI answers written by the model (`bench/genui/raw/deepseekflash`), scored by `bench/genui/score.ts` on 2026-10-02; the other formats are the bench's committed runs of the same model on the same briefs and repeats. GistUI generation cost: $0.07.

| format | runs | complete | renderable | mean output tokens | failure classes |
|---|---:|---:|---:|---:|---|
| gistui | 69 | 81.2% | 91.3% | 241 | enum-mismatch 6, hallucinated-component 1, root-missing 6, truncation 1 |
| gistui + autofix | 69 | 91.3% | 91.3% | 241 | root-missing 6, truncation 1 |
| openui | 69 | 91.3% | 100.0% | 408 | enum-mismatch 4, signature-mismatch 2, reference-graph 1 |

GistUI prompt used for this run: 3,061 tokens (current prompt: 3,738) (o200k).
