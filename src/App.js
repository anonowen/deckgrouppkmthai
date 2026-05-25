import React, { useState, useMemo } from "react";
import "./App.css";
import { validateCode, fetchDeckInfo, deckUrl } from "./deckFetcher";
import { parseDeckCsv, toCsv, runWithConcurrency, downloadCsv } from "./csvUtils";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, CartesianGrid,
} from "recharts";

var CHART_COLORS = [
  "#7c6af7", "#a78bfa", "#f472b6", "#fb923c", "#facc15",
  "#4ade80", "#22d3ee", "#60a5fa", "#f87171", "#c084fc",
  "#34d399", "#fbbf24", "#fb7185", "#818cf8", "#2dd4bf",
];

function DeckStats({ results }) {
  var data = useMemo(function() {
    var counts = {};
    for (var r of results) {
      var name = r.deckName || "Unown(ไม่สามารถระบุได้)";
      counts[name] = (counts[name] || 0) + 1;
    }
    return Object.keys(counts)
      .map(function(name) { return { name: name, count: counts[name] }; })
      .sort(function(a, b) { return b.count - a.count; });
  }, [results]);

  if (data.length === 0) return null;

  var total = data.reduce(function(a, b) { return a + b.count; }, 0);

  return (
    <div className="stats-section">
      <h3 className="stats-heading">📊 สถิติเด็ค ({total} ผู้เล่น, {data.length} เด็ค)</h3>

      <div className="charts-row">
        <div className="chart-box">
          <div className="chart-label">จำนวนผู้เล่นต่อเด็ค</div>
          <ResponsiveContainer width="100%" height={Math.max(220, data.length * 32)}>
            <BarChart data={data} layout="vertical" margin={{ top: 10, right: 20, bottom: 10, left: 10 }}>
              <CartesianGrid stroke="#2d3350" strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" stroke="#8b92b8" allowDecimals={false} />
              <YAxis type="category" dataKey="name" stroke="#8b92b8" width={180} tick={{ fontSize: 12 }} />
              <Tooltip
                contentStyle={{ background: "#12162a", border: "1px solid #3a3f5c", borderRadius: 8 }}
                cursor={{ fill: "rgba(124, 106, 247, 0.1)" }}
              />
              <Bar dataKey="count" radius={[0, 6, 6, 0]}>
                {data.map(function(_, i) {
                  return <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />;
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-box">
          <div className="chart-label">สัดส่วนเด็ค</div>
          <ResponsiveContainer width="100%" height={320}>
            <PieChart>
              <Pie
                data={data}
                dataKey="count"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={110}
                label={function(e) { return e.count; }}
              >
                {data.map(function(_, i) {
                  return <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />;
                })}
              </Pie>
              <Tooltip
                contentStyle={{ background: "#12162a", border: "1px solid #3a3f5c", borderRadius: 8 }}
                formatter={function(v, n) {
                  var pct = ((v / total) * 100).toFixed(1);
                  return [v + " (" + pct + "%)", n];
                }}
              />
              <Legend wrapperStyle={{ fontSize: 12, color: "#c5cae9" }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

function App() {
  var [mode, setMode] = useState("single"); // "single" | "batch"

  return (
    <div className="app">
      <div className={"container" + (mode === "batch" ? " wide" : "")}>
        <h1 className="title">🃏 Deck Group</h1>
        <p className="subtitle">ค้นหาชื่อเด็คจาก Deck Code</p>

        <div className="mode-tabs">
          <button
            className={"mode-tab" + (mode === "single" ? " active" : "")}
            onClick={function() { setMode("single"); }}
          >Single</button>
          <button
            className={"mode-tab" + (mode === "batch" ? " active" : "")}
            onClick={function() { setMode("batch"); }}
          >Batch (CSV)</button>
        </div>

        {mode === "single" ? <SingleMode /> : <BatchMode />}
      </div>
    </div>
  );
}

function SingleMode() {
  var [playerName, setPlayerName] = useState("");
  var [playerId, setPlayerId] = useState("");
  var [deckCode, setDeckCode] = useState("");
  var [loading, setLoading] = useState(false);
  var [result, setResult] = useState(null);
  var [error, setError] = useState(null);

  var trimmedCode = deckCode.trim();
  var codeValid = validateCode(trimmedCode);
  var canSubmit = playerName.trim() && trimmedCode && codeValid && !loading;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      var info = await fetchDeckInfo(trimmedCode);
      setResult({
        playerName: playerName.trim(),
        playerId: playerId.trim(),
        deckCode: trimmedCode,
        deckName: info.deckName,
        cards: info.cards,
      });
    } catch (err) {
      setError(err.message || "เกิดข้อผิดพลาด");
    } finally {
      setLoading(false);
    }
  }

  function handleReset() {
    setResult(null);
    setError(null);
    setPlayerName("");
    setPlayerId("");
    setDeckCode("");
  }

  if (result) {
    return (
      <div className="card result">
        <div className="result-header">
          <div>
            <div className="player-name">{result.playerName}</div>
            {result.playerId && <div className="player-id">ID: {result.playerId}</div>}
          </div>
          <button className="btn-ghost" onClick={handleReset}>← กลับ</button>
        </div>

        <div className="deck-name-box">
          <div className="deck-label">ชื่อเด็ค</div>
          <div className="deck-name">
            {result.deckName || <span className="no-name">ตรวจไม่พบ (ใส่ด้วยตัวเอง)</span>}
          </div>
        </div>

        <div className="code-row">
          <span className="muted">Code:</span>{" "}
          <a href={deckUrl(result.deckCode)} target="_blank" rel="noopener noreferrer">
            {result.deckCode}
          </a>
        </div>

        {result.cards && result.cards.length > 0 && (
          <details className="card-list">
            <summary>การ์ดทั้งหมด ({result.cards.length} ชนิด)</summary>
            <div className="cards-grid">
              {result.cards.map(function(c, i) {
                return (
                  <div key={i} className="card-row">
                    <span className="card-count">{c.count}</span>
                    <span className="card-name">{c.name}</span>
                  </div>
                );
              })}
            </div>
          </details>
        )}
      </div>
    );
  }

  return (
    <form className="card" onSubmit={handleSubmit}>
      <div className="field">
        <label>ชื่อผู้เล่น *</label>
        <input
          placeholder="ชื่อ-นามสกุล"
          value={playerName}
          onChange={function(e) { setPlayerName(e.target.value); }}
          disabled={loading}
        />
      </div>

      <div className="field">
        <label>Player ID</label>
        <input
          placeholder="รหัสผู้เล่น (ถ้ามี)"
          value={playerId}
          onChange={function(e) { setPlayerId(e.target.value); }}
          disabled={loading}
        />
      </div>

      <div className="field">
        <label>Deck Code *</label>
        <input
          placeholder="kYTLyg-aPzQVA-iPNLGy"
          value={deckCode}
          onChange={function(e) { setDeckCode(e.target.value); }}
          disabled={loading}
        />
        {trimmedCode && !codeValid && (
          <p className="hint error">⚠️ รูปแบบไม่ถูกต้อง — ต้องเป็น XXXXXX-XXXXXX-XXXXXX</p>
        )}
        {trimmedCode && codeValid && (
          <p className="hint success">
            ✓ ถูกต้อง —{" "}
            <a href={deckUrl(trimmedCode)} target="_blank" rel="noopener noreferrer">
              เปิดดู deck
            </a>
          </p>
        )}
      </div>

      {error && <p className="hint error">{error}</p>}

      <button type="submit" className="btn-primary" disabled={!canSubmit}>
        {loading ? "⏳ กำลังดึงข้อมูล..." : "🔍 ค้นหาเด็ค"}
      </button>
    </form>
  );
}

function BatchMode() {
  var [entries, setEntries] = useState([]);   // parsed input rows
  var [results, setResults] = useState([]);   // processed rows {playerName,playerId,deckCode,deckName,error}
  var [loading, setLoading] = useState(false);
  var [progress, setProgress] = useState({ done: 0, total: 0 });
  var [fileName, setFileName] = useState("");
  var [parseError, setParseError] = useState(null);

  function handleFile(e) {
    var file = e.target.files && e.target.files[0];
    if (!file) return;
    setFileName(file.name);
    setParseError(null);
    setResults([]);
    var reader = new FileReader();
    reader.onload = function() {
      try {
        var parsed = parseDeckCsv(String(reader.result));
        setEntries(parsed);
        if (parsed.length === 0) setParseError("ไม่พบข้อมูลใน CSV");
      } catch (err) {
        setParseError("อ่าน CSV ไม่ได้: " + (err.message || err));
        setEntries([]);
      }
    };
    reader.readAsText(file, "utf-8");
  }

  async function handleProcess() {
    if (entries.length === 0 || loading) return;
    setLoading(true);
    setProgress({ done: 0, total: entries.length });
    setResults([]);

    var out = await runWithConcurrency(entries, 4, async function(entry) {
      if (!validateCode(entry.deckCode)) {
        throw new Error("รูปแบบ deck code ไม่ถูกต้อง");
      }
      var info = await fetchDeckInfo(entry.deckCode);
      return info;
    }, function(done, total) { setProgress({ done: done, total: total }); });

    var rows = entries.map(function(e, i) {
      var r = out[i];
      if (r.ok) {
        return {
          playerName: e.playerName,
          playerId: e.playerId,
          deckCode: e.deckCode,
          deckName: r.value.deckName || "",
          error: null,
        };
      }
      return {
        playerName: e.playerName,
        playerId: e.playerId,
        deckCode: e.deckCode,
        deckName: "",
        error: r.error.message || String(r.error),
      };
    });
    setResults(rows);
    setLoading(false);
  }

  function handleExport() {
    if (results.length === 0) return;
    var csv = toCsv(
      ["playerName", "playerId", "deckCode", "deckName", "error"],
      results.map(function(r) { return [r.playerName, r.playerId, r.deckCode, r.deckName, r.error || ""]; })
    );
    var base = fileName.replace(/\.csv$/i, "") || "deckgroup";
    downloadCsv(base + "-results.csv", csv);
  }

  function handleClear() {
    setEntries([]);
    setResults([]);
    setFileName("");
    setParseError(null);
    setProgress({ done: 0, total: 0 });
  }

  return (
    <div className="card">
      <div className="field">
        <label>อัพโหลด CSV *</label>
        <input type="file" accept=".csv,text/csv" onChange={handleFile} disabled={loading} />
        <p className="hint muted-hint">
          คอลัมน์: <code>playerName,playerId,deckCode</code> (มี header หรือไม่ก็ได้)
        </p>
      </div>

      {parseError && <p className="hint error">{parseError}</p>}

      {entries.length > 0 && (
        <>
          <div className="batch-toolbar">
            <button className="btn-primary" onClick={handleProcess} disabled={loading} style={{ width: "auto" }}>
              {loading ? "⏳ กำลังประมวลผล..." : "🔍 ประมวลผล " + entries.length + " เด็ค"}
            </button>
            <button className="btn-ghost" onClick={handleClear} disabled={loading}>ล้าง</button>
            {results.length > 0 && (
              <button className="btn-ghost" onClick={handleExport} disabled={loading}>⬇ Export CSV</button>
            )}
            {loading && (
              <span className="progress">{progress.done}/{progress.total}</span>
            )}
          </div>

          {results.length > 0 && (
            <>
            <div style={{ overflowX: "auto" }}>
              <table className="results-table">
                <thead>
                  <tr>
                    <th>Player</th>
                    <th>Player ID</th>
                    <th>Deck Code</th>
                    <th>Deck Name</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map(function(r, i) {
                    return (
                      <tr key={i} className={r.error ? "row-error" : ""}>
                        <td>{r.playerName}</td>
                        <td>{r.playerId}</td>
                        <td className="code-cell">
                          {validateCode(r.deckCode) ? (
                            <a href={deckUrl(r.deckCode)} target="_blank" rel="noopener noreferrer">
                              {r.deckCode}
                            </a>
                          ) : (
                            r.deckCode
                          )}
                        </td>
                        <td className="deck-cell">
                          {r.error ? <span className="no-name">⚠ {r.error}</span> :
                            (r.deckName || <span className="no-name">ตรวจไม่พบ</span>)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <DeckStats results={results} />
            </>
          )}
        </>
      )}
    </div>
  );
}

export default App;
