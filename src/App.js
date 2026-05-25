import React, { useState } from "react";
import "./App.css";
import { validateCode, fetchDeckInfo, deckUrl } from "./deckFetcher";

function App() {
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

  return (
    <div className="app">
      <div className="container">
        <h1 className="title">🃏 Deck Group</h1>
        <p className="subtitle">ค้นหาชื่อเด็คจาก Deck Code</p>

        {!result ? (
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
        ) : (
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
        )}
      </div>
    </div>
  );
}

export default App;
