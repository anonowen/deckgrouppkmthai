var DECK_URL = "https://asia.pokemon-card.com/th/deck-build/recipe/";
var PROXY = "https://corsproxy.io/?url=";

export var DECKLIST_REGEX = /^[A-Za-z0-9]{6}-[A-Za-z0-9]{6}-[A-Za-z0-9]{6}$/;

export function validateCode(code) {
  return DECKLIST_REGEX.test((code || "").trim());
}

export function deckUrl(code) {
  return DECK_URL + code + "/";
}

async function fetchHtml(url) {
  var res = await fetch(url, { headers: { Accept: "text/html" } });
  if (!res.ok) throw new Error("HTTP " + res.status);
  return res.text();
}

function parseCards(html) {
  // Try __NEXT_DATA__ (Next.js SSR data)
  var nextMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (nextMatch) {
    try {
      var data = JSON.parse(nextMatch[1]);
      var cards = extractCardsFromNextData(data);
      if (cards && cards.length > 0) return cards;
    } catch (_) {}
  }

  // Fallback: parse HTML with DOMParser
  var parser = new DOMParser();
  var doc = parser.parseFromString(html, "text/html");
  return extractCardsFromDom(doc);
}

function extractCardsFromNextData(data) {
  // Try common Next.js pageProps paths
  var pageProps = data && data.props && data.props.pageProps;
  if (!pageProps) return null;

  var sources = [
    pageProps.deck,
    pageProps.recipe,
    pageProps.deckData,
    pageProps.data,
  ];

  for (var src of sources) {
    if (!src) continue;
    var cards = src.cards || src.cardList || src.pokemon || src.pokemons;
    if (Array.isArray(cards) && cards.length > 0) {
      return cards.map(function(c) {
        return {
          name: c.name || c.cardName || c.card_name || "",
          count: Number(c.count || c.quantity || c.num || 1),
          type: c.type || c.cardType || "",
        };
      });
    }
  }
  return null;
}

function extractCardsFromDom(doc) {
  var cards = [];

  // asia.pokemon-card.com structure: <li class="card"> with .cardName + .cardCount,
  // grouped under <h3>การ์ดโปเกมอน</h3> etc.
  var listBlocks = doc.querySelectorAll("div.list, .textList .list");
  if (listBlocks.length > 0) {
    listBlocks.forEach(function(block) {
      var heading = block.querySelector("h3");
      var section = heading ? heading.textContent.replace(/\(.*\)/, "").trim() : "";
      var items = block.querySelectorAll("li.card");
      items.forEach(function(li) {
        var nameEl = li.querySelector(".cardName a, .cardName");
        var countEl = li.querySelector(".cardCount");
        var name = nameEl ? nameEl.textContent.trim() : "";
        var count = countEl ? parseInt(countEl.textContent.trim(), 10) || 1 : 1;
        if (name) cards.push({ name: name, count: count, type: section });
      });
    });
    if (cards.length > 0) return cards;
  }

  // Fallback: generic table rows
  var rows = doc.querySelectorAll("tr");
  rows.forEach(function(row) {
    var cells = row.querySelectorAll("td");
    if (cells.length >= 2) {
      var nameEl = row.querySelector("a") || cells[0];
      var name = nameEl ? nameEl.textContent.trim() : "";
      var countText = cells[cells.length - 1].textContent.trim();
      var count = parseInt(countText, 10) || 1;
      if (name && name.length > 1) {
        cards.push({ name: name, count: count, type: "" });
      }
    }
  });

  // Last resort: any cardName-class elements (count unknown → 1)
  if (cards.length === 0) {
    var nameEls = doc.querySelectorAll("[class*='card-name'], [class*='cardName']");
    nameEls.forEach(function(el) {
      var name = el.textContent.trim();
      if (name) cards.push({ name: name, count: 1, type: "" });
    });
  }

  return cards;
}

// Non-attacker ex Pokemon — utility/support roles, never the deck name even at 4 copies.
// Add to this list as new utility ex appear.
var NON_ATTACKER_EX = new Set([
  "เนียสex",
  "คิจิคิกิสึex",
  "ลาทิอาสex",
]);

// Deck-name rules — evaluated top-to-bottom, first match wins.
// Rule types:
//   { type: "sum",       cards: [name,...], min: N, name: "..." } — sum of counts ≥ N
//   { type: "threshold", card: name,         min: N, name: "..." } — single card count ≥ N
//   { type: "exact",     card: name,                 name: "..." } — card present (count ≥ 1)
// Card names must match the website's exact text including any "<...>" suffix.
var DECK_RULES = [
  // Combined sum
  { type: "sum", cards: ["คามิชชู", "บาจินคิ"], min: 6, name: "เทศกาล" },
  { type: "sum", cards: ["ฉะเดธ", "ยาบาโซฉะ", "จุปเป็ตตะ", "คาเงะโบสึ"], min: 12, name: "จำแลงแฝงกาย" },

  // Threshold (single card)
  { type: "threshold", card: "อิวาพาเลซ", min: 2, name: "อิวาพาเลซ" },
  { type: "threshold", card: "ยาโดคิง", min: 3, name: "ยาโดคิง" },
  { type: "threshold", card: "อี้เนะอินุ", min: 2, name: "อี้เนะอินุ" },
  { type: "threshold", card: "กาจิกุมะ พระจันทร์สีเลือด", min: 2, name: "กาจิกุมะ พระจันทร์สีเลือด" },
  { type: "threshold", card: "บาคุฟูน <ของฮิบิกิ>", min: 3, name: "บาคุฟูน <ของฮิบิกิ>" },

  // Exact (presence ≥ 1)
  { type: "exact", card: "วาไนเดอร์ <ของแก๊งร็อกเกต>", name: "วาไนเดอร์ <ของแก๊งร็อกเกต>" },
  { type: "exact", card: "ฟูดิน", name: "ฟูดิน" },
  { type: "exact", card: "ดอนคาราซึ <ของแก๊งร็อกเกต>", name: "ดอนคาราซึ <ของแก๊งร็อกเกต>" },
];

function applyRules(cards) {
  // Build name → total count map
  var counts = {};
  for (var c of cards) {
    counts[c.name] = (counts[c.name] || 0) + c.count;
  }

  for (var rule of DECK_RULES) {
    if (rule.type === "sum") {
      var total = 0;
      for (var n of rule.cards) total += counts[n] || 0;
      if (total >= rule.min) return rule.name;
    } else if (rule.type === "threshold") {
      if ((counts[rule.card] || 0) >= rule.min) return rule.name;
    } else if (rule.type === "exact") {
      if ((counts[rule.card] || 0) >= 1) return rule.name;
    }
  }
  return null;
}

function autoDetect(cards) {
  // Only Pokemon section
  var pokemon = cards.filter(function(c) {
    if (!c.type) return true;
    return c.type.indexOf("โปเกมอน") !== -1 || c.type.toLowerCase().indexOf("pokemon") !== -1;
  });
  var pool = pokemon.length > 0 ? pokemon : cards;

  // Strip ace spec marker "<...>" so blacklist match works on base name
  function baseName(n) { return n.replace(/\s*<[^>]*>\s*/g, "").trim(); }

  // Priority suffixes — order = tiebreaker
  var priority = ["VSTAR", "VMAX", "ex", "V", "GX"];

  function matchedPriority(name) {
    var lower = name.toLowerCase();
    for (var i = 0; i < priority.length; i++) {
      if (lower.indexOf(priority[i].toLowerCase()) !== -1) return i;
    }
    return -1;
  }

  // Filter featured: priority keyword AND not in non-attacker blacklist
  var featured = pool.filter(function(c) {
    if (matchedPriority(c.name) === -1) return false;
    if (NON_ATTACKER_EX.has(baseName(c.name))) return false;
    return true;
  });
  if (featured.length === 0) return null;

  // Sort: count desc → priority asc → original order
  featured.sort(function(a, b) {
    if (b.count !== a.count) return b.count - a.count;
    return matchedPriority(a.name) - matchedPriority(b.name);
  });

  // Take top 1-2 unique
  var seen = new Set();
  var top = [];
  for (var c of featured) {
    if (!seen.has(c.name) && top.length < 2) {
      seen.add(c.name);
      top.push(c.name);
    }
  }
  return top.join(" + ");
}

function detectDeckName(cards) {
  if (!cards || cards.length === 0) return null;
  // Rules first, then auto fallback
  return applyRules(cards) || autoDetect(cards);
}

export async function fetchDeckInfo(code) {
  var url = deckUrl(code);
  var html = null;

  // Try direct fetch first
  try {
    html = await fetchHtml(url);
  } catch (_) {}

  // Fallback: CORS proxy
  if (!html) {
    try {
      html = await fetchHtml(PROXY + encodeURIComponent(url));
    } catch (e) {
      throw new Error("ไม่สามารถดึงข้อมูลเด็คได้ อาจเป็นปัญหา CORS หรือ network");
    }
  }

  var cards = parseCards(html);
  var deckName = detectDeckName(cards);

  return { cards: cards, deckName: deckName };
}
