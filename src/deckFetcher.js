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

// Archetype DB — exact name match against any cards in the deck.
// Longer required-list wins over shorter. Add new entries here as new decks appear.
var ARCHETYPES = [
  { name: "เนียสex + คิจิคิกิสึex", required: ["เนียสex", "คิจิคิกิสึex"] },
];

function matchArchetype(cards) {
  var names = new Set(cards.map(function(c) { return c.name; }));
  var best = null;
  for (var arch of ARCHETYPES) {
    var ok = arch.required.every(function(n) { return names.has(n); });
    if (ok && (!best || arch.required.length > best.required.length)) {
      best = arch;
    }
  }
  return best ? best.name : null;
}

function detectDeckName(cards) {
  if (!cards || cards.length === 0) return null;

  // 1. Try archetype DB first
  var arch = matchArchetype(cards);
  if (arch) return arch;

  // 2. Fallback: count-based featured ex/V detection within Pokemon section
  var pokemon = cards.filter(function(c) {
    if (!c.type) return true;
    return c.type.indexOf("โปเกมอน") !== -1 || c.type.toLowerCase().indexOf("pokemon") !== -1;
  });
  var pool = pokemon.length > 0 ? pokemon : cards;

  // Priority suffixes — order = tiebreaker
  var priority = ["VSTAR", "VMAX", "ex", "V", "GX"];

  function matchedPriority(name) {
    var lower = name.toLowerCase();
    for (var i = 0; i < priority.length; i++) {
      if (lower.indexOf(priority[i].toLowerCase()) !== -1) return i;
    }
    return -1;
  }

  // Filter featured: must end with or contain a priority keyword
  var featured = pool.filter(function(c) { return matchedPriority(c.name) !== -1; });
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
