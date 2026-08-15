# EchoCoT Extraction Explorer

A dependency-free static frontend for browsing EchoCoT extraction samples.

## Files

```text
index.html
style.css
app.js
data/
  samples_gemini3.5.json
  samples_opus4.6.json       # add your file here
  samples_sonnet4.6.json     # add your file here
```

The app automatically shows only model files that exist and contain valid JSON arrays.

## Expected JSON schema

Each file should contain a top-level array. Each sample may contain:

```json
{
  "idx": 0,
  "dataset": "LiveCodeBench",
  "sample_id": "3209",
  "question": "...",
  "ground_truth_cot": "...",
  "ground_truth_tokens": 4910,
  "best_turn": {
    "turn_idx": 1,
    "scratchpad_content": "...",
    "scratchpad_tokens": 4428,
    "length_error": 0.098,
    "summary_token_recall": 0.889
  }
}
```

## Local test

Do not open `index.html` directly via `file://`, because browsers may block `fetch()` for local JSON files.

From this folder, run:

```bash
python3 -m http.server 8000
```

Then open:

```text
http://localhost:8000/
```

## GitHub Pages / Anonymous Science

All links are relative (`./...`), so the site can be hosted below a repository/path prefix. Upload the whole folder to the repository used for GitHub Pages. Anonymous Science can then mirror the project website.

## Adding another model

1. Put the JSON file in `data/`.
2. Add one entry to `MODEL_FILES` near the top of `app.js`.

No backend or build step is required.
