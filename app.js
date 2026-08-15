"use strict";

// Add or remove entries here. A model is shown only if its JSON file exists
// and parses successfully, so this package still works while some files are absent.
const MODEL_FILES = [
  { id: "gemini2.5", label: "Gemini 2.5", file: "./data/samples_gemini2.5.json" },
  { id: "gemini3.1", label: "Gemini 3.1", file: "./data/samples_gemini3.1.json" },
  { id: "gemini3.5", label: "Gemini 3.5", file: "./data/samples_gemini3.5.json" },
  { id: "opus4.6", label: "Claude Opus 4.6", file: "./data/samples_opus4.6.json" },
  { id: "sonnet4.6", label: "Claude Sonnet 4.6", file: "./data/samples_sonnet4.6.json" },
];

const els = {
  modelSelect: document.querySelector("#modelSelect"),
  sampleSelect: document.querySelector("#sampleSelect"),
  searchInput: document.querySelector("#searchInput"),
  syncScroll: document.querySelector("#syncScroll"),
  wrapText: document.querySelector("#wrapText"),
  searchCount: document.querySelector("#searchCount"),
  status: document.querySelector("#status"),
  dataset: document.querySelector("#dataset"),
  sampleId: document.querySelector("#sampleId"),
  bestTurn: document.querySelector("#bestTurn"),
  targetTokens: document.querySelector("#targetTokens"),
  extractedTokens: document.querySelector("#extractedTokens"),
  lengthError: document.querySelector("#lengthError"),
  summaryRecall: document.querySelector("#summaryRecall"),
  question: document.querySelector("#question"),
  targetTrace: document.querySelector("#targetTrace"),
  extractedTrace: document.querySelector("#extractedTrace"),
  copyTarget: document.querySelector("#copyTarget"),
  copyExtracted: document.querySelector("#copyExtracted"),
  prevSample: document.querySelector("#prevSample"),
  nextSample: document.querySelector("#nextSample"),
  samplePosition: document.querySelector("#samplePosition"),
};

const state = {
  models: new Map(),
  modelId: null,
  sampleIndex: 0,
  syncLock: false,
  searchTimer: null,
};

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function formatInteger(value) {
  return Number.isFinite(Number(value)) ? Number(value).toLocaleString() : "—";
}

function formatDecimal(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(3) : "—";
}

function normalizeSamples(raw, sourceLabel) {
  if (!Array.isArray(raw)) {
    throw new Error(`${sourceLabel}: top-level JSON value must be an array.`);
  }

  return raw.map((sample, index) => {
    if (!sample || typeof sample !== "object") {
      throw new Error(`${sourceLabel}: sample ${index} is not an object.`);
    }
    return sample;
  });
}

async function tryLoadModel(model) {
  try {
    const response = await fetch(model.file, { cache: "no-store" });
    if (!response.ok) return null;
    const raw = await response.json();
    return normalizeSamples(raw, model.file);
  } catch (error) {
    console.warn(`Skipping ${model.file}:`, error);
    return null;
  }
}

async function init() {
  els.status.textContent = "Loading data…";

  for (const model of MODEL_FILES) {
    const samples = await tryLoadModel(model);
    if (samples !== null) {
      state.models.set(model.id, { ...model, samples });
    }
  }

  if (state.models.size === 0) {
    els.status.textContent = "";
    showFatalError(
      "No valid data files were found. Put your JSON arrays in the data/ folder using the filenames configured in app.js, then serve this folder over HTTP."
    );
    return;
  }

  populateModelSelect();

  const params = new URLSearchParams(location.search);
  const requestedModel = params.get("model");
  const initialModel = state.models.has(requestedModel)
    ? requestedModel
    : state.models.keys().next().value;

  switchModel(initialModel, false);

  const requestedSample = Number(params.get("sample"));
  if (Number.isInteger(requestedSample) && requestedSample >= 0) {
    const max = currentSamples().length - 1;
    state.sampleIndex = Math.min(requestedSample, Math.max(0, max));
    els.sampleSelect.value = String(state.sampleIndex);
    renderCurrentSample(false);
  }

  els.status.textContent = "";
  bindEvents();
}

function populateModelSelect() {
  els.modelSelect.innerHTML = "";
  for (const model of state.models.values()) {
    const option = document.createElement("option");
    option.value = model.id;
    option.textContent = model.label;
    els.modelSelect.append(option);
  }
  els.modelSelect.disabled = false;
}

function currentModel() {
  return state.models.get(state.modelId);
}

function currentSamples() {
  return currentModel()?.samples ?? [];
}

function currentSample() {
  return currentSamples()[state.sampleIndex] ?? null;
}

function switchModel(modelId, updateUrl = true) {
  if (!state.models.has(modelId)) return;
  state.modelId = modelId;
  state.sampleIndex = 0;
  els.modelSelect.value = modelId;
  populateSampleSelect();
  renderCurrentSample(updateUrl);
}

function sampleLabel(sample, index) {
  const dataset = sample.dataset ?? "Unknown dataset";
  const id = sample.sample_id ?? sample.idx ?? index;
  return `${index + 1}. ${dataset} — ${id}`;
}

function populateSampleSelect() {
  const samples = currentSamples();
  els.sampleSelect.innerHTML = "";

  if (samples.length === 0) {
    const option = document.createElement("option");
    option.textContent = "No samples";
    els.sampleSelect.append(option);
    els.sampleSelect.disabled = true;
    return;
  }

  samples.forEach((sample, index) => {
    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = sampleLabel(sample, index);
    els.sampleSelect.append(option);
  });

  els.sampleSelect.disabled = false;
  els.sampleSelect.value = String(state.sampleIndex);
}

function renderCurrentSample(updateUrl = true) {
  const sample = currentSample();
  const samples = currentSamples();

  if (!sample) {
    clearSampleView();
    return;
  }

  const best = sample.best_turn ?? {};

  els.dataset.textContent = sample.dataset ?? "—";
  els.sampleId.textContent = sample.sample_id ?? sample.idx ?? "—";
  els.bestTurn.textContent = best.turn_idx ?? "—";
  els.targetTokens.textContent = formatInteger(sample.ground_truth_tokens);
  els.extractedTokens.textContent = formatInteger(best.scratchpad_tokens);
  els.lengthError.textContent = formatDecimal(best.length_error);
  els.summaryRecall.textContent = formatDecimal(best.summary_token_recall);
  renderRichText(els.question, sample.question ?? "—", { compact: true, search: false });

  renderTrace(els.targetTrace, sample.ground_truth_cot ?? "");
  renderTrace(els.extractedTrace, best.scratchpad_content ?? "");

  els.targetTrace.scrollTop = 0;
  els.extractedTrace.scrollTop = 0;
  els.samplePosition.textContent = `${state.sampleIndex + 1} / ${samples.length}`;
  els.prevSample.disabled = state.sampleIndex <= 0;
  els.nextSample.disabled = state.sampleIndex >= samples.length - 1;
  els.sampleSelect.value = String(state.sampleIndex);

  if (updateUrl) updateAddressBar();
  updateSearchCount();
}

function clearSampleView() {
  [els.dataset, els.sampleId, els.bestTurn, els.targetTokens, els.extractedTokens, els.lengthError, els.summaryRecall]
    .forEach((el) => { el.textContent = "—"; });
  renderRichText(els.question, "No samples in this file.", { compact: true, search: false });
  els.targetTrace.textContent = "";
  els.extractedTrace.textContent = "";
  els.samplePosition.textContent = "0 / 0";
  els.prevSample.disabled = true;
  els.nextSample.disabled = true;
}

const KNOWN_CODE_LANGUAGES = new Set([
  "bash", "c", "c#", "c++", "cpp", "css", "go", "html", "java",
  "javascript", "js", "json", "jsx", "kotlin", "latex", "markdown", "md",
  "php", "python", "py", "r", "ruby", "rust", "scala", "shell", "sh",
  "sql", "swift", "text", "toml", "ts", "tsx", "typescript", "xml",
  "yaml", "yml"
]);

function highlightText(text, query) {
  if (!query) return escapeHtml(text);

  const regex = new RegExp(escapeRegExp(query), "gi");
  let cursor = 0;
  let html = "";
  let match;

  while ((match = regex.exec(text)) !== null) {
    html += escapeHtml(text.slice(cursor, match.index));
    html += `<mark>${escapeHtml(match[0])}</mark>`;
    cursor = match.index + match[0].length;
    if (match[0].length === 0) regex.lastIndex += 1;
  }

  html += escapeHtml(text.slice(cursor));
  return html;
}

function renderInlineMarkdown(text, query) {
  // Safe lightweight inline Markdown: `code` and **bold**.
  // We intentionally do not interpret single '*' because reasoning traces often
  // contain multiplication such as 2*i, which should remain literal text.
  let html = "";
  let cursor = 0;

  while (cursor < text.length) {
    const codeAt = text.indexOf("`", cursor);
    const boldAt = text.indexOf("**", cursor);
    const candidates = [
      codeAt >= 0 ? { at: codeAt, type: "code" } : null,
      boldAt >= 0 ? { at: boldAt, type: "bold" } : null,
    ].filter(Boolean).sort((a, b) => a.at - b.at);

    if (candidates.length === 0) {
      html += highlightText(text.slice(cursor), query);
      break;
    }

    const token = candidates[0];
    if (token.at > cursor) html += highlightText(text.slice(cursor, token.at), query);

    if (token.type === "code") {
      const close = text.indexOf("`", token.at + 1);
      if (close < 0) {
        html += highlightText(text.slice(token.at), query);
        break;
      }
      html += `<code class="inline-code">${highlightText(text.slice(token.at + 1, close), query)}</code>`;
      cursor = close + 1;
      continue;
    }

    const close = text.indexOf("**", token.at + 2);
    if (close < 0) {
      html += highlightText(text.slice(token.at), query);
      break;
    }
    html += `<strong>${highlightText(text.slice(token.at + 2, close), query)}</strong>`;
    cursor = close + 2;
  }

  return html;
}

function normalizeProseStructure(text) {
  let normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // Some API traces flatten Markdown section labels into a single huge line.
  // Recover visual paragraph boundaries without modifying the source JSON.
  normalized = normalized.replace(
    /[ \t]+(?=\*\*(?:Step\s+\d+(?:\s*[:.\-])?|Final\s+Answer\b|Answer\b|Conclusion\b|Solution\b|Explanation\b|Verification\b|Check\b))/gi,
    "\n\n"
  );

  normalized = normalized.replace(/[ \t]+(?=#{1,4}\s+)/g, "\n\n");
  return normalized;
}

function renderParagraph(block, query) {
  const lines = block.split("\n");
  const body = lines.map((line) => renderInlineMarkdown(line, query)).join("<br>");
  return `<p class="prose-block">${body}</p>`;
}

function renderList(block, query, ordered) {
  const pattern = ordered ? /^\s*\d+[.)]\s+(.+)$/ : /^\s*[-+*]\s+(.+)$/;
  const items = block.split("\n").map((line) => line.match(pattern)?.[1]).filter(Boolean);
  const tag = ordered ? "ol" : "ul";
  return `<${tag} class="prose-list">${items.map((item) => `<li>${renderInlineMarkdown(item, query)}</li>`).join("")}</${tag}>`;
}

function renderProse(text, query) {
  const normalized = normalizeProseStructure(text).trim();
  if (!normalized) return "";

  const blocks = normalized.split(/\n\s*\n+/).filter((block) => block.trim());
  const html = [];

  for (const rawBlock of blocks) {
    const block = rawBlock.trim();

    const heading = block.match(/^(#{1,4})\s+(.+)$/s);
    if (heading) {
      const level = Math.min(4, heading[1].length + 1);
      html.push(`<h${level} class="prose-heading">${renderInlineMarkdown(heading[2].trim(), query)}</h${level}>`);
      continue;
    }

    const lines = block.split("\n").filter((line) => line.trim());
    if (lines.length > 0 && lines.every((line) => /^\s*[-+*]\s+/.test(line))) {
      html.push(renderList(block, query, false));
      continue;
    }
    if (lines.length > 0 && lines.every((line) => /^\s*\d+[.)]\s+/.test(line))) {
      html.push(renderList(block, query, true));
      continue;
    }

    html.push(renderParagraph(block, query));
  }

  return html.join("");
}

function parseCodeFence(raw) {
  const normalized = raw.replace(/\r\n/g, "\n");
  const firstBreak = normalized.indexOf("\n");

  if (firstBreak >= 0) {
    const firstLine = normalized.slice(0, firstBreak).trim();
    const rest = normalized.slice(firstBreak + 1);
    if (/^[A-Za-z0-9_+#.\-]{1,24}$/.test(firstLine)) {
      return { language: firstLine, code: rest };
    }
  }

  // Tolerate data where the language and first statement appear on the same line,
  // e.g. ```python import sys ...
  const sameLine = normalized.match(/^([A-Za-z0-9_+#.\-]{1,24})[ \t]+([\s\S]+)$/);
  if (sameLine && KNOWN_CODE_LANGUAGES.has(sameLine[1].toLowerCase())) {
    return { language: sameLine[1], code: sameLine[2] };
  }

  return { language: "", code: normalized };
}

function renderRichText(element, text, options = {}) {
  const query = options.search === false ? "" : els.searchInput.value.trim();
  const source = String(text ?? "");
  const parts = source.split("```");
  const html = [];

  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i];

    if (i % 2 === 0) {
      const prose = renderProse(part, query);
      if (prose) html.push(prose);
      continue;
    }

    const { language, code } = parseCodeFence(part);
    const languageLabel = language
      ? `<div class="code-language">${escapeHtml(language)}</div>`
      : "";

    html.push(
      `<div class="code-block">${languageLabel}` +
      `<pre><code>${highlightText(code.replace(/^\n|\n$/g, ""), query)}</code></pre></div>`
    );
  }

  element.innerHTML = html.join("") || '<p class="prose-block">&nbsp;</p>';
  element.classList.toggle("compact-formatted", Boolean(options.compact));
}

function renderTrace(element, text) {
  renderRichText(element, text);
}

function countMatches(text, query) {
  if (!query) return 0;
  const regex = new RegExp(escapeRegExp(query), "gi");
  return (text.match(regex) ?? []).length;
}

function updateSearchCount() {
  const sample = currentSample();
  const query = els.searchInput.value.trim();
  if (!sample || !query) {
    els.searchCount.textContent = "";
    return;
  }

  const best = sample.best_turn ?? {};
  const targetCount = countMatches(sample.ground_truth_cot ?? "", query);
  const extractedCount = countMatches(best.scratchpad_content ?? "", query);
  els.searchCount.textContent = `${targetCount} target / ${extractedCount} extracted matches`;
}

function rerenderSearch() {
  const sample = currentSample();
  if (!sample) return;
  const best = sample.best_turn ?? {};
  renderTrace(els.targetTrace, sample.ground_truth_cot ?? "");
  renderTrace(els.extractedTrace, best.scratchpad_content ?? "");
  updateSearchCount();
}

function updateAddressBar() {
  const url = new URL(location.href);
  url.searchParams.set("model", state.modelId);
  url.searchParams.set("sample", String(state.sampleIndex));
  history.replaceState(null, "", url);
}

function goToSample(index) {
  const max = currentSamples().length - 1;
  if (max < 0) return;
  state.sampleIndex = Math.max(0, Math.min(index, max));
  renderCurrentSample();
}

function syncScroll(source, target) {
  if (!els.syncScroll.checked || state.syncLock) return;
  const sourceRange = source.scrollHeight - source.clientHeight;
  const targetRange = target.scrollHeight - target.clientHeight;
  if (sourceRange <= 0 || targetRange <= 0) return;

  state.syncLock = true;
  const ratio = source.scrollTop / sourceRange;
  target.scrollTop = ratio * targetRange;
  requestAnimationFrame(() => { state.syncLock = false; });
}

async function copyText(text, button) {
  try {
    await navigator.clipboard.writeText(text);
    const old = button.textContent;
    button.textContent = "Copied";
    setTimeout(() => { button.textContent = old; }, 900);
  } catch {
    button.textContent = "Copy failed";
    setTimeout(() => { button.textContent = "Copy"; }, 1200);
  }
}

function bindEvents() {
  els.modelSelect.addEventListener("change", () => switchModel(els.modelSelect.value));
  els.sampleSelect.addEventListener("change", () => goToSample(Number(els.sampleSelect.value)));
  els.prevSample.addEventListener("click", () => goToSample(state.sampleIndex - 1));
  els.nextSample.addEventListener("click", () => goToSample(state.sampleIndex + 1));

  els.searchInput.addEventListener("input", () => {
    clearTimeout(state.searchTimer);
    state.searchTimer = setTimeout(rerenderSearch, 100);
  });

  els.wrapText.addEventListener("change", () => {
    els.targetTrace.classList.toggle("wrap", els.wrapText.checked);
    els.extractedTrace.classList.toggle("wrap", els.wrapText.checked);
  });

  els.targetTrace.addEventListener("scroll", () => syncScroll(els.targetTrace, els.extractedTrace));
  els.extractedTrace.addEventListener("scroll", () => syncScroll(els.extractedTrace, els.targetTrace));

  els.copyTarget.addEventListener("click", () => {
    const sample = currentSample();
    copyText(sample?.ground_truth_cot ?? "", els.copyTarget);
  });

  els.copyExtracted.addEventListener("click", () => {
    const sample = currentSample();
    copyText(sample?.best_turn?.scratchpad_content ?? "", els.copyExtracted);
  });

  document.addEventListener("keydown", (event) => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
    if (event.key === "ArrowLeft") goToSample(state.sampleIndex - 1);
    if (event.key === "ArrowRight") goToSample(state.sampleIndex + 1);
  });
}

function showFatalError(message) {
  const main = document.querySelector("main");
  main.innerHTML = `<div class="error-box"><strong>Data loading error</strong><br>${escapeHtml(message)}</div>`;
}

init();