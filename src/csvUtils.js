// Minimal CSV parser/serializer (no external deps).
// Handles: header row, quoted fields, escaped quotes ("" inside ""),
// CR/LF line endings, trailing newlines.

export function parseCsv(text) {
  var rows = [];
  var cur = [];
  var field = "";
  var inQuotes = false;
  var i = 0;

  while (i < text.length) {
    var ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += ch; i++; continue;
    }

    if (ch === '"') { inQuotes = true; i++; continue; }
    if (ch === ",") { cur.push(field); field = ""; i++; continue; }
    if (ch === "\r") { i++; continue; }
    if (ch === "\n") {
      cur.push(field); field = "";
      if (cur.length > 1 || cur[0] !== "") rows.push(cur);
      cur = []; i++; continue;
    }
    field += ch; i++;
  }
  if (field.length > 0 || cur.length > 0) {
    cur.push(field);
    if (cur.length > 1 || cur[0] !== "") rows.push(cur);
  }
  return rows;
}

// Parse CSV into list of {playerName, playerId, deckCode}.
// Accepts header row (case-insensitive) OR positional rows.
export function parseDeckCsv(text) {
  var rows = parseCsv(text);
  if (rows.length === 0) return [];

  var header = rows[0].map(function(s) { return s.trim().toLowerCase(); });
  var hasHeader = header.some(function(h) {
    return h === "deckcode" || h === "deck code" || h === "code" || h === "รหัสเด็ค" ||
           h === "playername" || h === "player name" || h === "name" || h === "player" ||
           h === "ชื่อ" || h === "ชื่อผู้เล่น";
  });

  var nameIdx = 0, idIdx = 1, codeIdx = 2;
  var dataRows;

  if (hasHeader) {
    function find(names) {
      for (var n of names) {
        var i = header.indexOf(n);
        if (i !== -1) return i;
      }
      return -1;
    }
    var ni = find(["playername", "player name", "player", "name", "ชื่อ", "ชื่อผู้เล่น"]);
    var ii = find(["playerid", "player id", "id", "รหัส"]);
    var ci = find(["deckcode", "deck code", "code", "รหัสเด็ค"]);
    if (ni !== -1) nameIdx = ni;
    if (ii !== -1) idIdx = ii;
    if (ci !== -1) codeIdx = ci;
    dataRows = rows.slice(1);
  } else {
    if (rows[0].length === 2) { codeIdx = 1; idIdx = -1; }
    dataRows = rows;
  }

  return dataRows.map(function(r) {
    return {
      playerName: (r[nameIdx] || "").trim(),
      playerId: idIdx >= 0 ? (r[idIdx] || "").trim() : "",
      deckCode: (r[codeIdx] || "").trim(),
    };
  }).filter(function(e) { return e.playerName || e.deckCode; });
}

function csvField(v) {
  var s = v == null ? "" : String(v);
  if (s.indexOf(",") !== -1 || s.indexOf('"') !== -1 || s.indexOf("\n") !== -1) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

export function toCsv(headers, rows) {
  var lines = [headers.map(csvField).join(",")];
  for (var r of rows) lines.push(r.map(csvField).join(","));
  return lines.join("\n");
}

// Bounded-concurrency runner; returns results in input order.
export async function runWithConcurrency(items, limit, worker, onProgress) {
  var results = new Array(items.length);
  var nextIndex = 0;
  var done = 0;
  async function take() {
    while (true) {
      var idx = nextIndex++;
      if (idx >= items.length) return;
      try { results[idx] = { ok: true, value: await worker(items[idx], idx) }; }
      catch (e) { results[idx] = { ok: false, error: e }; }
      done++;
      if (onProgress) onProgress(done, items.length);
    }
  }
  var workers = [];
  for (var i = 0; i < Math.min(limit, items.length); i++) workers.push(take());
  await Promise.all(workers);
  return results;
}

export function downloadCsv(filename, csvText) {
  var blob = new Blob(["﻿" + csvText], { type: "text/csv;charset=utf-8" });
  var url = URL.createObjectURL(blob);
  var a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
