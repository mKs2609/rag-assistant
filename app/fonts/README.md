# Fonts

Served from here rather than fetched from Google during the build. `next/font/google`
downloads font files at build time, and a failed download fails the build outright with an
error naming an internal Turbopack module, which reads as a missing dependency rather than
a network problem.

Latin subsets only, matching what the app asked for before.

| File | Family | Weights | Licence |
| --- | --- | --- | --- |
| `fraunces-variable.woff2` | Fraunces | 300 to 600, variable | SIL OFL 1.1 |
| `ibm-plex-sans-variable.woff2` | IBM Plex Sans | 400 to 600, variable | SIL OFL 1.1 |
| `ibm-plex-mono-400.woff2` | IBM Plex Mono | 400 | SIL OFL 1.1 |
| `ibm-plex-mono-500.woff2` | IBM Plex Mono | 500 | SIL OFL 1.1 |

Both families are published under the SIL Open Font License 1.1, which permits
redistribution with the software. Taken from the files Google Fonts serves for those
weights.
