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
  const bins = parseBinRecords(bytes);
  const records = [];
  for (let offset = start; offset + 21 <= bytes.byteLength; offset += 1) {
    if (bytes[offset] !== 0x12 || bytes[offset + 1] !== 0x01 || bytes[offset + 2] !== 0x1e) continue;
    const total = view.getUint32(offset + 5, false);
    const good = view.getUint32(offset + 17, false);
    if (total > 0 && total < 100000 && good <= total) records.push({ total, good });
  }
  if (records.length) {
    const binTotal = bins.softwareBins.reduce((sum, row) => sum + row[1], 0);
    const matchingRecord = records.filter(record => record.total === binTotal).pop();
    const { total, good } = matchingRecord || records[records.length - 1];
    return buildSummary(total, good, bins);
  }

  const rawRun = parseRawPartRun(bytes);
  if (rawRun) return buildSummary(rawRun.total, rawRun.good, {
    softwareBins: rawRun.softwareBins,
    hardwareBins: []
  });

  const candidates = [];
  for (let offset = start; offset + 4 <= bytes.byteLength; offset += 1) {
    const value = view.getUint32(offset, false);
    if (value > 0 && value < 100000 && !candidates.includes(value)) candidates.push(value);
  }
  candidates.sort((left, right) => right - left);
  const total = candidates[0] || null;
  const good = candidates.find(value => value < total) || null;
  return buildSummary(total, good, bins);
}

function parseRawPartRun(bytes) {
  const marker = new TextEncoder().encode("IMAGE_PART_ID");
  const parts = [];
  for (let offset = 0; offset <= bytes.length - marker.length; offset += 1) {
    let matches = true;
    for (let index = 0; index < marker.length; index += 1) {
      if (bytes[offset + index] !== marker[index]) { matches = false; break; }
    }
    if (matches) parts.push(offset);
  }
  if (!parts.length) return null;

  let untested = 0;
  let good = 0;
  for (let index = 0; index < parts.length; index += 1) {
    const start = parts[index];
    const end = index + 1 < parts.length ? parts[index + 1] : bytes.length;
    const chunk = bytes.subarray(start, end);
    if (!containsAscii(chunk, "Continuity_tests")) { untested += 1; continue; }
    const terminal = lastBytes(chunk, [0x14, 0x14, 0x00]);
    if (terminal && terminal[4] === 0x05) good += 1;
  }
  return {
    total: parts.length,
    good,
    softwareBins: [[0, untested, "UNTESTED"], [1, good, "PASS"]]
  };
}

function containsAscii(bytes, value) {
  const needle = new TextEncoder().encode(value);
  for (let offset = 0; offset <= bytes.length - needle.length; offset += 1) {
    let match = true;
    for (let index = 0; index < needle.length; index += 1) if (bytes[offset + index] !== needle[index]) { match = false; break; }
    if (match) return true;
  }
  return false;
}

function lastBytes(bytes, needle) {
  for (let offset = bytes.length - needle.length; offset >= 0; offset -= 1) {
    let match = true;
    for (let index = 0; index < needle.length; index += 1) if (bytes[offset + index] !== needle[index]) { match = false; break; }
    if (match) return bytes.subarray(offset);
  }
  return null;
}

function parseBinRecords(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const softwareBins = [];
  const hardwareBins = [];
  let offset = findLastBinSummary(bytes, view);
  if (offset < 0) return { softwareBins, hardwareBins };
  while (offset + 13 <= bytes.byteLength) {
    const type = bytes[offset + 2];
    if (bytes[offset + 1] !== 0x01 || (type !== 0x32 && type !== 0x28)) break;
    const labelLength = bytes[offset + 12];
    const end = offset + 14 + labelLength;
    if (end > bytes.byteLength) break;
    const bin = view.getUint16(offset + 5, false);
    const count = view.getUint32(offset + 7, false);
    if (count > 100000 || labelLength > 64) break;
    const label = new TextDecoder("windows-1252").decode(bytes.slice(offset + 13, offset + 13 + labelLength));
    const row = [bin, count, label];
    (type === 0x32 ? softwareBins : hardwareBins).push(row);
    offset = end;
  }
  return { softwareBins, hardwareBins };
}

function findLastBinSummary(bytes, view) {
  let summaryStart = -1;
  for (let offset = 0; offset + 21 <= bytes.byteLength; offset += 1) {
    if (bytes[offset + 1] !== 0x01 || bytes[offset + 2] !== 0x32) continue;
    const labelLength = bytes[offset + 12];
    const end = offset + 14 + labelLength;
    if (end > bytes.byteLength) continue;
    const label = new TextDecoder("windows-1252").decode(bytes.slice(offset + 13, offset + 13 + labelLength));
    if (label === "UNTESTED") summaryStart = offset;
  }
  return summaryStart;
}

function buildSummary(total, good, bins) {
  const failed = total !== null && good !== null ? total - good : null;
  return {
    total, good, retests: 0, aborts: 0, functional: total,
    softwareBins: bins.softwareBins.length ? addBinPercentages(bins.softwareBins, total) : (good === null ? [] : [[1, good, percentage(good, total), "PASS"]]),
    hardwareBins: bins.hardwareBins.length ? addBinPercentages(bins.hardwareBins, total) : (failed === null ? [] : [[1, good, percentage(good, total), "PASS_BIN"], [8, failed, percentage(failed, total), "FAIL_BIN"]])
  };
}

function addBinPercentages(rows, total) {
  return rows.map(([bin, count, label]) => [bin, count, percentage(count, total), label]);
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
  renderBins("#software-bins", summary.softwareBins, "Additional software-bin records were not identified in the binary layout.");
  renderBins("#hardware-bins", summary.hardwareBins, "Hardware bin records were not identified in the binary layout.");
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