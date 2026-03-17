import { getStore } from "@netlify/blobs";

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

const PROVIDER_URLS = {
  "edison": "https://www.edison.it/offerte",
  "enel": "https://www.enel.it/it/luce-gas",
  "eni plenitude": "https://eniplenitude.com/offerte",
  "plenitude": "https://eniplenitude.com/offerte",
  "sorgenia": "https://www.sorgenia.it/offerte-luce-gas",
  "a2a": "https://www.a2aenergia.eu/offerte",
  "iren": "https://iren.it/offerte-luce-gas",
  "hera": "https://www.heracomm.it/offerte",
  "octopus": "https://octopusenergy.it/tariffe",
  "e.on": "https://www.eon-energia.com/offerte.html",
  "wekiwi": "https://www.wekiwi.it/offerte",
  "illumia": "https://www.illumia.it/offerte",
  "acea": "https://www.aceaenergia.it/offerte",
  "nen": "https://nen.it",
  "engie": "https://www.engie.it/offerte",
  "fastweb": "https://www.fastweb.it/internet/",
  "iliad": "https://www.iliad.it/fibra/",
  "tim": "https://www.tim.it/fisso-e-mobile/fibra",
  "vodafone": "https://www.vodafone.it/internet/offerte-internet-casa.html",
  "windtre": "https://www.windtre.it/offerte-fibra/",
  "sky": "https://www.sky.it/offerte/sky-wifi",
  "tiscali": "https://casa.tiscali.it/",
  "aruba": "https://www.aruba.it/fibra.aspx",
  "eolo": "https://www.eolo.it/home/offerte.html",
  "linkem": "https://www.linkem.com/offerte",
};

function guessProviderLink(name) {
  const lower = (name || "").toLowerCase();
  for (const [key, url] of Object.entries(PROVIDER_URLS)) {
    if (lower.includes(key)) return url;
  }
  return null;
}

async function fetchPageText(url) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "it-IT,it;q=0.9,en;q=0.8",
      },
    });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
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
      .replace(/&euro;/g, "\u20AC")
      .replace(/&[a-z]+;/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
    return text.slice(0, 12000);
  } catch (err) {
    console.error(`Failed to fetch ${url}: ${err.message}`);
    return null;
  }
}

async function extractWithClaude(category, textsWithSources) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

  const schemas = {
    energia: `Array of objects with EXACTLY these fields:
  - name: string (provider name, e.g. "Edison", "Sorgenia", "Enel Energia". Use the COMPANY name, not the offer name)
  - offerName: string (the specific offer name, e.g. "Web Luce", "Next Energy Sunlight", "Click Luce")
  - tipo: string (MUST be exactly one of: "Fisso 12m", "Fisso 24m", "Variabile")
  - prezzo: number (price in euro/kWh, e.g. 0.102. MUST be a decimal < 1, NOT the annual estimate. For variable offers use the spread value)
  - fisso: number (monthly fixed cost in euro, e.g. 12.5. Use 0 if not mentioned)
  - verde: boolean (true if 100% renewable/green energy)
  - note: string (brief description, max 50 chars)`,

    gas: `Array of objects with EXACTLY these fields:
  - name: string (provider name, e.g. "Edison", "Sorgenia". Use the COMPANY name)
  - offerName: string (the specific offer name, e.g. "Web Gas", "Next Energy Smart Gas")
  - tipo: string (MUST be exactly one of: "Fisso 12m", "Fisso 24m", "Variabile")
  - prezzo: number (price in euro/Smc, e.g. 0.42. MUST be a decimal, NOT annual estimate)
  - fisso: number (monthly fixed cost in euro. Use 0 if not mentioned)
  - note: string (brief description, max 50 chars)`,

    internet: `Array of objects with EXACTLY these fields:
  - name: string (provider + offer name, e.g. "Iliad Fibra", "Fastweb Casa Light")
  - tipo: string ("FTTH" | "FTTC" | "FWA")
  - prezzo: number (monthly price in euro, e.g. 19.99)
  - velocita: string (download speed, e.g. "2.5 Gbps", "1 Gbps". Use Gbps where >= 1000 Mbps)
  - vincolo: string ("No" | "24 mesi" | "18 mesi" | "12 mesi" | "6 mesi" | "36 mesi")
  - note: string (brief description, max 50 chars)`,
  };

  const sourceBlock = textsWithSources
    .filter((s) => s.text)
    .map((s, i) => `--- SOURCE ${i + 1}: ${s.url} ---\n${s.text}`)
    .join("\n\n");

  if (!sourceBlock.trim()) return null;

  const prompt = `Sei un estrattore di dati per un comparatore italiano di offerte ${category === "energia" ? "luce/energia elettrica" : category}.

COMPITO: Analizza i testi e estrai le offerte ${category}.

REGOLE CRITICHE:
1. Restituisci SOLO un JSON array valido. Niente markdown, niente backtick, niente commenti.
2. Il campo "prezzo" deve essere il PREZZO UNITARIO (euro/kWh per energia, euro/Smc per gas, euro/mese per internet), NON la stima annua.
3. NON duplicare: se la stessa offerta (stesso provider + stesso tipo fisso/variabile) appare su piu fonti, includila UNA sola volta.
4. Se un dato non e chiaro, usa il valore piu ragionevole. NON inventare offerte.
5. Includi minimo 5, massimo 12 offerte. Privilegia offerte rilevanti e recenti.
6. Ordina per prezzo crescente.
7. Per internet, Fastweb offre FTTH fino a 2.5 Gbps - non confondere con le offerte FWA. Includi SEMPRE le offerte FTTH principali se disponibili.
8. Distingui chiaramente tra offerte a prezzo FISSO (bloccato 12-24 mesi) e VARIABILE (indicizzate PUN/PSV + spread).

SCHEMA:
${schemas[category]}

TESTI:
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

  if (!res.ok) throw new Error(`Claude API error ${res.status}: ${await res.text()}`);

  const data = await res.json();
  const raw = data.content?.[0]?.text?.trim();
  if (!raw) throw new Error("Empty response from Claude");

  const cleaned = raw.replace(/^```json?\s*/i, "").replace(/\s*```$/i, "").trim();
  const parsed = JSON.parse(cleaned);
  if (!Array.isArray(parsed) || parsed.length === 0) throw new Error("Invalid result: not a non-empty array");

  return parsed;
}

export default async function handler(req) {
  console.log("\uD83D\uDD04 Starting daily price update...");

  const store = getStore("prices");
  const results = {};
  const errors = [];

  for (const [category, urls] of Object.entries(SOURCES)) {
    console.log(`\uD83D\uDCE5 Fetching ${category} from ${urls.length} sources...`);

    const textsWithSources = await Promise.all(
      urls.map(async (url) => ({ url, text: await fetchPageText(url) }))
    );

    const validSources = textsWithSources.filter((s) => s.text);
    console.log(`  \u2705 ${validSources.length}/${urls.length} sources fetched`);

    if (validSources.length === 0) {
      errors.push(`${category}: all sources failed`);
      continue;
    }

    try {
      const extracted = await extractWithClaude(category, textsWithSources);

      // Deduplicate by name + tipo + prezzo combination
      const seen = new Set();
      const deduped = extracted.filter((o) => {
        const key = `${(o.name || "").toLowerCase().trim()}|${(o.tipo || "").toLowerCase().trim()}|${o.prezzo}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      // Add provider links
      const withLinks = deduped.map((o) => ({
        ...o,
        link: guessProviderLink(o.name) || null,
      }));

      results[category] = withLinks;
      console.log(`  \uD83E\uDDE0 Claude extracted ${extracted.length} -> deduped to ${withLinks.length} for ${category}`);
    } catch (err) {
      errors.push(`${category}: ${err.message}`);
      console.error(`  \u274C ${category} failed: ${err.message}`);
    }
  }

  if (Object.keys(results).length > 0) {
    const payload = { lastUpdated: new Date().toISOString(), data: results };
    await store.setJSON("latest", payload);
    const dateKey = new Date().toISOString().split("T")[0];
    await store.setJSON(`archive-${dateKey}`, payload);
    console.log(`\uD83D\uDCBE Saved: ${JSON.stringify(Object.keys(results))}`);
  }

  const summary = {
    success: Object.keys(results).length > 0,
    categoriesUpdated: Object.keys(results),
    offersCount: Object.fromEntries(Object.entries(results).map(([k, v]) => [k, v.length])),
    errors,
    timestamp: new Date().toISOString(),
  };

  console.log("\uD83D\uDCCA Summary:", JSON.stringify(summary, null, 2));
  return new Response(JSON.stringify(summary, null, 2), { status: 200, headers: { "Content-Type": "application/json" } });
}

export const config = { schedule: "0 6 * * *" };
