# Rendering benchmark: GistUI vs OpenUI

Run 2026-10-04. Chrome (Playwright), production builds, React 19, median of 3 runs, a fresh page for each run.

## Realistic stream (≈100 tokens/s), CPU unthrottled

| Screen | Main thread, OpenUI | Main thread, GistUI | OpenUI / GistUI | Script, OpenUI | Script, GistUI | Blocking (>50 ms tasks), OpenUI / GistUI | Worst frame, OpenUI / GistUI | First content, OpenUI / GistUI | Done after last chunk, OpenUI / GistUI |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| simple-table | 69 ms | 52 ms | **1.3×** | 44 | 26 | 0 / 0 ms | 17 / 17 ms | 122 / 102 ms | 0 / 1 ms |
| dashboard | 2,204 ms | 492 ms | **4.5×** | 1,936 | 186 | 0 / 0 ms | 17 / 17 ms | 362 / 261 ms | 4 / 8 ms |
| pricing-page | 2,252 ms | 911 ms | **2.5×** | 1,639 | 325 | 0 / 0 ms | 17 / 17 ms | 429 / 93 ms | 2 / 4 ms |
| all-seven | 22,096 ms | 3,667 ms | **6.0×** | 20,713 | 1,047 | 0 / 0 ms | 17 / 17 ms | 397 / 341 ms | 12 / 10 ms |

## Realistic stream (≈100 tokens/s), CPU slowed 4×

| Screen | Main thread, OpenUI | Main thread, GistUI | OpenUI / GistUI | Script, OpenUI | Script, GistUI | Blocking (>50 ms tasks), OpenUI / GistUI | Worst frame, OpenUI / GistUI | First content, OpenUI / GistUI | Done after last chunk, OpenUI / GistUI |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| simple-table | 205 ms | 154 ms | **1.3×** | 134 | 85 | 0 / 0 ms | 17 / 17 ms | 131 / 106 ms | 0 / 3 ms |
| dashboard | 4,712 ms | 612 ms | **7.7×** | 4,317 | 213 | 0 / 0 ms | 33 / 17 ms | 362 / 265 ms | 20 / 6 ms |
| pricing-page | 1,516 ms | 639 ms | **2.4×** | 1,176 | 193 | 0 / 0 ms | 17 / 17 ms | 435 / 97 ms | 2 / 3 ms |
| all-seven | 39,399 ms | 2,310 ms | **17.1×** | 37,003 | 565 | 13 / 0 ms | 50 / 33 ms | 397 / 345 ms | 52 / 11 ms |

## Fast stream (≈1,000 tokens/s), CPU unthrottled

| Screen | Main thread, OpenUI | Main thread, GistUI | OpenUI / GistUI | Script, OpenUI | Script, GistUI | Blocking (>50 ms tasks), OpenUI / GistUI | Worst frame, OpenUI / GistUI | First content, OpenUI / GistUI | Done after last chunk, OpenUI / GistUI |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| simple-table | 60 ms | 62 ms | **1.0×** | 35 | 30 | 0 / 0 ms | 17 / 17 ms | 21 / 13 ms | 0 / 1 ms |
| chart-with-data | 124 ms | 78 ms | **1.6×** | 81 | 37 | 0 / 0 ms | 17 / 17 ms | 27 / 15 ms | 9 / 1 ms |
| contact-form | 126 ms | 103 ms | **1.2×** | 82 | 46 | 0 / 0 ms | 17 / 33 ms | 27 / 14 ms | 2 / 2 ms |
| settings-panel | 226 ms | 102 ms | **2.2×** | 153 | 45 | 0 / 0 ms | 17 / 17 ms | 25 / 15 ms | 1 / 1 ms |
| dashboard | 535 ms | 213 ms | **2.5×** | 442 | 92 | 0 / 0 ms | 17 / 17 ms | 40 / 29 ms | 4 / 3 ms |
| e-commerce-product | 393 ms | 183 ms | **2.2×** | 301 | 71 | 0 / 0 ms | 17 / 17 ms | 37 / 19 ms | 2 / 2 ms |
| pricing-page | 396 ms | 208 ms | **1.9×** | 271 | 79 | 0 / 0 ms | 17 / 17 ms | 52 / 13 ms | 279 / 2 ms |
| all-seven | 3,917 ms | 695 ms | **5.6×** | 3,645 | 234 | 0 / 0 ms | 17 / 17 ms | 51 / 36 ms | 14 / 9 ms |

## Fast stream (≈1,000 tokens/s), CPU slowed 4×

| Screen | Main thread, OpenUI | Main thread, GistUI | OpenUI / GistUI | Script, OpenUI | Script, GistUI | Blocking (>50 ms tasks), OpenUI / GistUI | Worst frame, OpenUI / GistUI | First content, OpenUI / GistUI | Done after last chunk, OpenUI / GistUI |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| simple-table | 113 ms | 127 ms | **0.9×** | 70 | 73 | 0 / 0 ms | 50 / 33 ms | 54 / 45 ms | 2 / 42 ms |
| chart-with-data | 291 ms | 264 ms | **1.1×** | 207 | 109 | 14 / 0 ms | 67 / 50 ms | 62 / 41 ms | 79 / 62 ms |
| contact-form | 197 ms | 188 ms | **1.0×** | 129 | 94 | 0 / 0 ms | 33 / 50 ms | 55 / 53 ms | 10 / 7 ms |
| settings-panel | 299 ms | 180 ms | **1.7×** | 212 | 93 | 0 / 0 ms | 50 / 50 ms | 53 / 68 ms | 1 / 3 ms |
| dashboard | 711 ms | 446 ms | **1.6×** | 588 | 186 | 3 / 0 ms | 33 / 50 ms | 39 / 43 ms | 19 / 22 ms |
| e-commerce-product | 863 ms | 548 ms | **1.6×** | 672 | 228 | 0 / 0 ms | 50 / 50 ms | 56 / 46 ms | 9 / 6 ms |
| pricing-page | 685 ms | 393 ms | **1.7×** | 474 | 154 | 0 / 0 ms | 17 / 33 ms | 62 / 47 ms | 272 / 3 ms |
| all-seven | 4,492 ms | 1,269 ms | **3.5×** | 3,895 | 441 | 8 / 0 ms | 50 / 34 ms | 57 / 44 ms | 60 / 11 ms |

## Parsers alone, like for like

Bun 1.3.11. Each parser produces an up-to-date result after every chunk. Median time to stream the whole screen.

| Screen | Chars, OpenUI / GistUI | One shot | 4-char chunks | 10-char chunks | 40-char chunks |
|---|---:|---:|---:|---:|---:|
| simple-table | 406 / 294 | 0.1 / 0.1 ms (0.8×) | 1.2 / 0.4 ms (3.4×) | 0.5 / 0.1 ms (4.4×) | 0.1 / 0.1 ms (2.1×) |
| chart-with-data | 795 / 514 | 0.1 / 0.1 ms (0.7×) | 2.1 / 0.4 ms (5.2×) | 0.8 / 0.3 ms (3.2×) | 0.2 / 0.1 ms (2.4×) |
| contact-form | 1,163 / 641 | 0.1 / 0.1 ms (1.4×) | 4.9 / 1 ms (5.0×) | 2 / 0.6 ms (3.3×) | 0.5 / 0.2 ms (2.5×) |
| settings-panel | 2,324 / 1,131 | 0.1 / 0.1 ms (1.3×) | 13.2 / 0.6 ms (23.6×) | 4.9 / 0.5 ms (10.0×) | 1.4 / 0.2 ms (7.6×) |
| dashboard | 3,303 / 2,158 | 0.2 / 0.1 ms (1.1×) | 25.5 / 0.8 ms (34.0×) | 10.8 / 0.7 ms (14.9×) | 2.7 / 0.3 ms (9.3×) |
| e-commerce-product | 4,178 / 2,543 | 0.2 / 0.1 ms (1.8×) | 52.1 / 2.6 ms (20.4×) | 21.2 / 1.3 ms (16.2×) | 5.3 / 0.4 ms (12.3×) |
| pricing-page | 4,726 / 3,076 | 0.2 / 0.1 ms (1.7×) | 53.3 / 1 ms (56.0×) | 21.3 / 0.7 ms (31.2×) | 5.6 / 0.4 ms (14.0×) |
| all-seven | 17,983 / 10,738 | 0.8 / 0.5 ms (1.6×) | 1,033.8 / 6 ms (172.4×) | 422.9 / 4.1 ms (103.3×) | 106.7 / 2 ms (53.3×) |
