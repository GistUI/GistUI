# Live run: gemini37

GistUI answers written by the model (`bench/genui/raw/gemini37`), scored by `bench/genui/score.ts` on 2026-10-02; the other formats are the bench's committed runs of the same model on the same briefs and repeats. GistUI generation cost: $1.56.

| format | runs | complete | renderable | mean output tokens | failure classes |
|---|---:|---:|---:|---:|---|
| gistui | 184 | 87.5% | 100.0% | 1,443 | reference-graph 9, enum-mismatch 1, hallucinated-component 5, signature-mismatch 10, malformed-syntax 1, required-field 2 |
| gistui + autofix | 184 | 100.0% | 100.0% | 1,443 |  |
| openui | 184 | 98.9% | 100.0% | 1,637 | enum-mismatch 1, reference-graph 1 |
| a2ui | 184 | 94.0% | 96.7% | 3,217 | malformed-syntax 10, renderer-rejected 2, root-missing 6, enum-mismatch 1 |
| jsonrender | 184 | 92.9% | 100.0% | 3,756 | reference-graph 12, required-field 1 |

GistUI prompt used for this run: 3,061 tokens (current prompt: 3,738) (o200k).
