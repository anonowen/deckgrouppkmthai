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

  // Look for table rows with card data
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

  // Also look for card name elements
  if (cards.length === 0) {
    var nameEls = doc.querySelectorAll("[class*='card-name'], [class*='cardName']");
    nameEls.forEach(function(el) {
      var name = el.textContent.trim();
      if (name) cards.push({ name: name, count: 1, type: "" });
    });
  }

  return cards;
}

function detectDeckName(cards) {
  if (!cards || cards.length === 0) return null;

  // Priority: VSTAR > ex (stage2 line) > ex > VMAX > V > GX
  var priority = ["VSTAR", "ex", "VMAX", "VSTAR", "V", "GX"];

  // Filter featured Pokemon by suffix keywords
  var featured = cards.filter(function(c) {
    return priority.some(function(kw) {
      return c.name.toLowerCase().includes(kw.toLowerCase());
    });
  });

  if (featured.length === 0) return null;

  // Sort by count desc, then by priority keyword order
  featured.sort(function(a, b) {
    if (b.count !== a.count) return b.count - a.count;
    var ai = priority.findIndex(function(kw) { return a.name.toLowerCase().includes(kw.toLowerCase()); });
    var bi = priority.findIndex(function(kw) { return b.name.toLowerCase().includes(kw.toLowerCase()); });
    return ai - bi;
  });

  // Take top 1-2 unique featured Pokemon
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
