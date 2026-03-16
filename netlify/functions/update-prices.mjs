// ═══════════════════════════════════════════════════════════════════
// NETLIFY SCHEDULED FUNCTION — AI-Powered Price Scraper
// Runs daily at 06:00 UTC via Netlify cron
// ═══════════════════════════════════════════════════════════════════
//
// SETUP: Add these environment variables in Netlify Dashboard → Site → Environment:
//   ANTHROPIC_API_KEY = your Claude API key (sk-ant-...)
//
// SCHEDULE: In netlify.toml add:
//   [functions."update-prices"]
//   schedule = "0 6 * * *"
//
// ═══════════════════════════════════════════════════════════════════

import { getStore } from "@netlify/blobs";

// ─── Sources to scrape ───────────────────────────────────────────
// Multiple sources = resilience. If one goes down, the others fill in.
const SOURCES = {
  energia: [
    "https://selectra.net/energia/guida/confronto/migliore-offerta-luce",
    "https://selectra.net/energia/guida/confronto/tariffe-luce-gas",
    "https://www.sostariffe.it/energia-elettrica/",
  ],
  gas: [
    "https://selectra.net/energia/guida/confronto/migliore-offerta-gas",
    "https://selectra.net/energia/guida/confronto/tariffe-luce-gas",
    "https://www.sostariffe.it/gas/",
  ],
  internet: [
    "https://selectra.net/internet/guida/offerte/fibra-ottica",
    "https://selectra.net/internet/guida/offerte/wifi-casa",
    "https://selectra.net/internet/score",
  ],
};

// ─── Fetch page text content (strips HTML, keeps meaningful text) ─
async function fetchPageText(url) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "it-IT,it;q=0.9,en;q=0.8",
      },
    });
    clearTimeout(timeout);

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const html = await res.text();

    // Strip HTML to get meaningful text content only
    // Remove scripts, styles, SVGs, noscript, then tags, then compress whitespace
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<header[\s\S]*?<\/header>/gi, " ")
      .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
      .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&euro;/g, "€")
      .replace(/&[a-z]+;/gi, " ")
      .replace(/\s+/g, " ")
      .trim();

    // Truncate to ~12000 chars to stay within Claude's sweet spot
    return text.slice(0, 12000);
  } catch (err) {
    console.error(`Failed to fetch ${url}: ${err.message}`);
    return null;
  }
}

// ─── Call Claude to extract structured data from raw text ─────────
async function extractWithClaude(category, textsWithSources) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

  const schemas = {
    energia: `Array of objects with EXACTLY these fields:
  - name: string (provider name, e.g. "Enel Energia", "Edison", "Sorgenia")
  - tipo: string ("Fisso 12m" | "Fisso 24m" | "Variabile")
  - prezzo: number (price in €/kWh, e.g. 0.067. MUST be a decimal number, NOT the annual estimate)
  - fisso: number (monthly fixed cost in €, e.g. 12.5. Use 0 if not mentioned)
  - verde: boolean (true if 100% renewable/green energy)
  - note: string (brief description, max 60 chars)`,

    gas: `Array of objects with EXACTLY these fields:
  - name: string (provider name)
  - tipo: string ("Fisso 12m" | "Fisso 24m" | "Variabile")
  - prezzo: number (price in €/Smc, e.g. 0.42. MUST be a decimal number, NOT annual estimate)
  - fisso: number (monthly fixed cost in €. Use 0 if not mentioned)
  - note: string (brief description, max 60 chars)`,

    internet: `Array of objects with EXACTLY these fields:
  - name: string (offer name including provider, e.g. "Iliad Fibra")
  - tipo: string ("FTTH" | "FTTC" | "FWA")
  - prezzo: number (monthly price in €, e.g. 19.99)
  - velocita: string (e.g. "2.5 Gbps", "1 Gbps")
  - vincolo: string ("No" | "24 mesi" | "18 mesi" etc.)
  - note: string (brief description, max 60 chars)`,
  };

  // Build the source texts block
  const sourceBlock = textsWithSources
    .filter((s) => s.text)
    .map((s, i) => `--- SOURCE ${i + 1}: ${s.url} ---\n${s.text}`)
    .join("\n\n");

  if (!sourceBlock.trim()) {
    console.error(`No source text available for ${category}`);
    return null;
  }

  const prompt = `Sei un estrattore di dati per un comparatore italiano di offerte ${category === "energia" ? "luce/energia elettrica" : category}.

COMPITO: Analizza i testi seguenti (presi da siti comparatori italiani) e estrai TUTTE le offerte ${category} che trovi.

REGOLE CRITICHE:
1. Restituisci SOLO un JSON array valido, niente altro. Niente markdown, niente backtick, niente commenti.
2. Il campo "prezzo" deve essere il PREZZO UNITARIO (€/kWh per energia, €/Smc per gas, €/mese per internet), NON la stima annua.
3. Se trovi lo stesso provider con più offerte, includi ogni offerta come riga separata.
4. Se un dato non è chiaro, usa il valore più ragionevole. NON inventare offerte.
5. Includi minimo 5 offerte, massimo 12. Privilegia le offerte più rilevanti e recenti.
6. Ordina per prezzo crescente.

SCHEMA RICHIESTO:
${schemas[category]}

TESTI DA ANALIZZARE:
${sourceBlock}

JSON ARRAY:`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4000,
      temperature: 0,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Claude API error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const raw = data.content?.[0]?.text?.trim();

  if (!raw) throw new Error("Empty response from Claude");

  // Clean potential markdown fences
  const cleaned = raw.replace(/^```json?\s*/i, "").replace(/\s*```$/i, "").trim();

  // Validate JSON
  const parsed = JSON.parse(cleaned);
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error(`Invalid result for ${category}: not a non-empty array`);
  }

  return parsed;
}

// ─── Main handler ────────────────────────────────────────────────
export default async function handler(req) {
  console.log("🔄 Starting daily price update...");

  const store = getStore("prices");
  const results = {};
  const errors = [];

  for (const [category, urls] of Object.entries(SOURCES)) {
    console.log(`📥 Fetching ${category} from ${urls.length} sources...`);

    // Fetch all sources in parallel
    const textsWithSources = await Promise.all(
      urls.map(async (url) => ({
        url,
        text: await fetchPageText(url),
      }))
    );

    const validSources = textsWithSources.filter((s) => s.text);
    console.log(`  ✅ ${validSources.length}/${urls.length} sources fetched`);

    if (validSources.length === 0) {
      errors.push(`${category}: all sources failed`);
      continue;
    }

    try {
      const extracted = await extractWithClaude(category, textsWithSources);
      results[category] = extracted;
      console.log(`  🧠 Claude extracted ${extracted.length} offers for ${category}`);
    } catch (err) {
      errors.push(`${category}: ${err.message}`);
      console.error(`  ❌ ${category} extraction failed: ${err.message}`);
    }
  }

  // Only save if we got at least one category
  if (Object.keys(results).length > 0) {
    const payload = {
      lastUpdated: new Date().toISOString(),
      data: results,
    };

    await store.setJSON("latest", payload);
    console.log(`💾 Saved to Netlify Blobs: ${JSON.stringify(Object.keys(results))}`);

    // Also keep a dated backup
    const dateKey = new Date().toISOString().split("T")[0]; // "2026-03-16"
    await store.setJSON(`archive-${dateKey}`, payload);
  }

  const summary = {
    success: Object.keys(results).length > 0,
    categoriesUpdated: Object.keys(results),
    offersCount: Object.fromEntries(
      Object.entries(results).map(([k, v]) => [k, v.length])
    ),
    errors,
    timestamp: new Date().toISOString(),
  };

  console.log("📊 Summary:", JSON.stringify(summary, null, 2));

  return new Response(JSON.stringify(summary, null, 2), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

// Netlify scheduled function config
export const config = {
  schedule: "0 6 * * *", // Every day at 06:00 UTC (08:00 Italy)
};
