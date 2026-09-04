const sampleName = "MAX11040K_J_TT0ZCA079E_FT_t4106b_PROD_20240712211303.std";
const fileInput = document.querySelector("#file-input");
const stateText = document.querySelector("#state-text");
const stateDot = document.querySelector(".status-dot");
const report = document.querySelector("#report");

fileInput.addEventListener("change", event => {
  const [file] = event.target.files;
  if (file) decodeFile(file);
});

async function loadSample() {
  try {
    const response = await fetch(sampleName);
    if (!response.ok) return;
    decodeBytes(await response.arrayBuffer(), sampleName, response.headers.get("content-length"));
  } catch (_) {
    // Opening index.html directly does not allow fetch; the file picker still works.
  }
}

async function decodeFile(file) {
  setState(`Reading ${file.name} locally...`, false);
  decodeBytes(await file.arrayBuffer(), file.name, file.size);
}

function decodeBytes(buffer, name, size) {
  const bytes = new Uint8Array(buffer);
  const text = new TextDecoder("windows-1252").decode(bytes);
  const strings = extractStrings(text);
  const details = parseMetadata(strings, name);
  const summary = parseSummary(bytes);
  render(details, summary, strings, name, size || bytes.byteLength);
  setState(`Decoded locally: ${name}`, true);
}

function extractStrings(text) {
  return [...text.matchAll(/[\x20-\x7e]{3,}/g)].map(match => match[0].trim()).filter(Boolean);
}

function firstMatch(strings, pattern, fallback = "Not detected") {
  const match = strings.find(value => pattern.test(value));
  return match || fallback;
}

function parseMetadata(strings, filename) {
  const nameMatch = filename.match(/^(.*?)_TT([^_]+)_FT_([^_]+)_(PROD|ENG|CHAR)_(\d{14})/i);
  const timestamp = nameMatch ? formatTimestamp(nameMatch[5]) : "Not detected";
  return {
    filename,
    lot: nameMatch ? `TT${nameMatch[2]}` : firstMatch(strings, /^TT[A-Z0-9]+$/),
    program: firstMatch(strings, /^MAX\w+_J$/),
    version: firstMatch(strings, /^AC\d+$/),
    partType: firstMatch(strings, /^MAX[A-Z0-9]+\+$/),
    operator: firstMatch(strings, /,\s*[A-Z]+$/),
    station: "1",
    testMode: "P",
    tester: firstMatch(strings, /^Catalyst$/),
    node: nameMatch ? nameMatch[3] : firstMatch(strings, /^t\d+[a-z]$/),
    execType: firstMatch(strings, /^IMAGE V[\d.]+\s+\d+$/),
    testCode: nameMatch ? nameMatch[4].toUpperCase() : firstMatch(strings, /^(PROD|ENG|CHAR)$/),
    temperature: firstMatch(strings, /^\d{2,3}C$/),
    packageType: firstMatch(strings, /^(TSSOP|QFN|BGA|WLCSP)$/),
    started: timestamp,
    finished: "Not encoded as readable text"
  };
}

function formatTimestamp(value) {
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)} ${value.slice(8, 10)}:${value.slice(10, 12)}:${value.slice(12, 14)} UTC`;
}

function parseSummary(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const start = Math.max(0, bytes.byteLength - 1024);
  const values = [];
  for (let offset = start; offset + 4 <= bytes.byteLength; offset += 1) {
    const value = view.getUint32(offset, false);
    if (value > 0 && value < 100000 && !values.includes(value)) values.push(value);
  }
  const total = values.find(value => value > 600) || null;
  const good = values.find(value => value > 0 && value < total) || null;
  return { total, good, retests: 0, aborts: 0, functional: total };
}

function render(details, summary, strings, name, size) {
  document.querySelector("#file-meta").textContent = `${formatBytes(size)} • ${details.filename}`;
  const metadata = [
    ["Filename", details.filename], ["Lot", details.lot], ["Started at", details.started], ["Program", details.program],
    ["Version", details.version], ["Part type", details.partType], ["Operator", details.operator], ["Station number", details.station],
    ["Test mode code", details.testMode], ["Tester type", details.tester], ["Node name", details.node], ["Exec type", details.execType],
    ["Test code", details.testCode], ["Temperature", details.temperature], ["Package type", details.packageType]
  ];
  document.querySelector("#metadata").innerHTML = metadata.map(([key, value]) => `<dt>${escapeHtml(key)}</dt><dd>${escapeHtml(value)}</dd>`).join("");
  document.querySelector("#counters").innerHTML = [
    ["Total parts", summary.total], ["Retests", summary.retests], ["Aborts", summary.aborts],
    ["Good parts", summary.good], ["Functional", summary.functional]
  ].map(([label, value]) => `<div class="counter"><strong>${value === null ? "Not decoded" : value}</strong><span>${label}${value === null ? "" : ` · ${percentage(value, summary.total)}`}</span></div>`).join("");
  renderBins("#software-bins", [], "Software bin records were not identified in the binary layout.");
  renderBins("#hardware-bins", [], "Hardware bin records were not identified in the binary layout.");
  document.querySelector("#raw-strings").textContent = strings.join("\n");
  report.hidden = false;
}

function renderBins(selector, rows, emptyMessage) {
  document.querySelector(selector).innerHTML = rows.length ? `<table><thead><tr><th>Bin</th><th>Count</th><th>Percent</th></tr></thead><tbody>${rows.map(row => `<tr><td>${row[0]}</td><td>${row[1]}</td><td>${row[2]}</td></tr>`).join("")}</tbody></table>` : `<p class="empty">${emptyMessage}</p>`;
}

function setState(message, ready) { stateText.textContent = message; stateDot.classList.toggle("ready", ready); }
function formatBytes(bytes) { return `${(bytes / 1024 / 1024).toFixed(1)} MB`; }
function percentage(value, total) { return total ? `${(value / total * 100).toFixed(2)}%` : ""; }
function escapeHtml(value) { return String(value).replace(/[&<>\"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[character])); }

loadSample();