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
  // Università: nessuna fonte statica — Claude usa web_search autonomamente
  universita: [],
};

const PROVIDER_LINKS = {
  "edison": "https://selectra.net/energia/fornitori/edison/offerte",
  "enel": "https://selectra.net/energia/fornitori/enel/offerte",
  "eni": "https://selectra.net/energia/fornitori/eni-plenitude/offerte",
  "plenitude": "https://selectra.net/energia/fornitori/eni-plenitude/offerte",
  "sorgenia": "https://selectra.net/energia/fornitori/sorgenia",
  "a2a": "https://selectra.net/energia/fornitori/a2a/offerte",
  "iren": "https://selectra.net/energia/fornitori/iren/offerte",
  "hera": "https://selectra.net/energia/fornitori/hera/offerte",
  "octopus": "https://selectra.net/energia/fornitori/octopus-energy/offerte",
  "e.on": "https://selectra.net/energia/fornitori/eon/offerte",
  "wekiwi": "https://selectra.net/energia/fornitori/wekiwi/offerte",
  "illumia": "https://selectra.net/energia/fornitori/illumia/offerte",
  "acea": "https://selectra.net/energia/fornitori/acea/offerte",
  "nen": "https://selectra.net/energia/fornitori/nen/offerte",
  "engie": "https://selectra.net/energia/fornitori/engie/offerte",
  "green network": "https://selectra.net/energia/fornitori/green-network/offerte",
  "vivi": "https://selectra.net/energia/fornitori/vivi-energia/offerte",
  "argos": "https://selectra.net/energia/fornitori/argos/offerte",
  "pulsee": "https://selectra.net/energia/fornitori/pulsee/offerte",
  "iberdrola": "https://selectra.net/energia/fornitori/iberdrola/offerte",
  "estra": "https://selectra.net/energia/fornitori/estra/offerte",
  "tate": "https://selectra.net/energia/fornitori/tate/offerte",
  "poste energia": "https://selectra.net/energia/fornitori/poste-italiane/offerte",
  "poste italiane": "https://selectra.net/energia/fornitori/poste-italiane/offerte",
  "segnoverde": "https://selectra.net/energia/fornitori/segnoverde",
  "dolomiti": "https://selectra.net/energia/fornitori/dolomiti-energia/offerte",
  "fastweb": "https://selectra.net/internet/operatori/fastweb/casa",
  "iliad": "https://selectra.net/internet/operatori/iliad/casa",
  "tim": "https://selectra.net/internet/operatori/tim/casa",
  "vodafone": "https://selectra.net/internet/operatori/vodafone/casa",
  "windtre": "https://selectra.net/internet/operatori/windtre/casa",
  "sky": "https://selectra.net/internet/operatori/sky/wifi",
  "tiscali": "https://selectra.net/internet/operatori/tiscali/casa",
  "aruba": "https://selectra.net/internet/operatori/aruba-fibra/casa",
  "eolo": "https://selectra.net/internet/operatori/eolo/casa",
  "linkem": "https://selectra.net/internet/operatori/linkem/casa",
  "poste casa": "https://selectra.net/internet/operatori/poste-italiane/casa",
  "virgin fibra": "https://selectra.net/internet/operatori/virgin-fibra/casa",
  "dimensione": "https://selectra.net/internet/operatori/dimensione/casa",
};

function guessProviderLink(name) {
  const lower = (name || "").toLowerCase();
  for (const [key, url] of Object.entries(PROVIDER_LINKS)) {
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
    if (!res.ok) throw new Error("HTTP " + res.status);
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
    console.error("Failed to fetch " + url + ": " + err.message);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// UNIVERSITÀ: Claude usa web_search per ricercare autonomamente
// le rette sui siti ufficiali degli atenei italiani.
// Niente scraping manuale — Claude naviga il web da solo.
// ─────────────────────────────────────────────────────────────
async function extractUniversitaWithResearch() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

  var prompt = `Sei un ricercatore specializzato in costi universitari italiani.
Devi compilare una tabella delle rette universitarie A.A. 2025/2026.

USA LA RICERCA WEB per trovare i dati aggiornati sui siti ufficiali delle universita.
Cerca le pagine "contribuzione studentesca" o "tasse e contributi" di ogni ateneo.

DEVI restituire dati per ESATTAMENTE queste 10 facolta (usa questi nomi IDENTICI):
- Economia
- Giurisprudenza
- Ingegneria
- Medicina
- Architettura
- Scienze Politiche
- Lettere e Filosofia
- Psicologia
- Informatica
- Scienze della Comunicazione

Per ogni facolta, includi 5-7 universita scelte tra queste:
PRIVATE: Bocconi (Milano), LUISS (Roma), Cattolica (Milano), IULM (Milano), San Raffaele (Milano), Humanitas (Milano), Campus Bio-Medico (Roma)
PUBBLICHE: Statale Milano, La Sapienza (Roma), Bologna, Padova, Politecnico Milano, Politecnico Torino, Torino, Federico II (Napoli), IUAV (Venezia), Trento, Bicocca (Milano)

Non tutte le universita hanno tutte le facolta. Includi solo quelle che esistono realmente.

Per le PUBBLICHE:
- min = retta minima (fascia ISEE piu bassa, spesso 156 euro per la no-tax area)
- med = retta media (ISEE intorno a 25.000-30.000 euro)
- max = retta massima (ISEE oltre 80.000 euro o senza ISEE)

Per le PRIVATE:
- min = retta minima pubblicata (o con borsa di studio massima)
- med = retta standard senza agevolazioni
- max = retta massima per il corso piu costoso della facolta

FORMATO DI RISPOSTA: Restituisci SOLO un JSON array valido. Niente markdown, niente backtick, niente commenti, niente testo prima o dopo il JSON.

Ogni oggetto deve avere ESATTAMENTE questi campi:
- facolta: string (DEVE essere uno dei 10 nomi elencati sopra, IDENTICO)
- uni: string (nome breve, es. "Bocconi", "Politecnico Milano", "La Sapienza")
- citta: string (es. "Milano", "Roma")
- min: number (retta minima in euro)
- med: number (retta media in euro)
- max: number (retta massima in euro)
- tipo: string ("Pubblica" | "Privata")

L'array deve contenere almeno 50 oggetti totali (5-7 per ognuna delle 10 facolta).
Ordina per facolta e poi per retta media crescente.

JSON ARRAY:`;

  console.log("  Calling Claude with web_search for universita research...");

  var res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 16000,
      temperature: 0,
      tools: [
        {
          type: "web_search_20250305",
          name: "web_search",
          max_uses: 15,
        }
      ],
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) throw new Error("Claude API error " + res.status + ": " + (await res.text()));

  var data = await res.json();

  // Estrai il testo dalla risposta (contiene blocchi web_search_tool_result + text)
  var raw = "";
  if (data.content) {
    for (var j = 0; j < data.content.length; j++) {
      if (data.content[j].type === "text" && data.content[j].text) {
        raw += data.content[j].text;
      }
    }
  }
  raw = raw.trim();

  if (!raw) throw new Error("Empty response from Claude for universita");

  var cleaned = raw.replace(/^```json?\s*/i, "").replace(/\s*```$/i, "").trim();
  var parsed = JSON.parse(cleaned);
  if (!Array.isArray(parsed) || parsed.length === 0) throw new Error("Invalid universita result: not a non-empty array");

  console.log("  Claude researched " + parsed.length + " university entries via web_search");
  return parsed;
}

async function extractWithClaude(category, textsWithSources) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

  const schemas = {
    energia: "Array of objects with EXACTLY these fields:\n  - name: string (provider name, e.g. \"Edison\", \"Sorgenia\", \"Enel Energia\". Use the COMPANY name, not the offer name)\n  - offerName: string (the specific offer name, e.g. \"Web Luce\", \"Next Energy Sunlight\", \"Click Luce\")\n  - tipo: string (MUST be exactly one of: \"Fisso 12m\", \"Fisso 24m\", \"Variabile\")\n  - prezzo: number (price in euro/kWh, e.g. 0.102. MUST be a decimal < 1, NOT the annual estimate. For variable offers use the spread value)\n  - fisso: number (monthly fixed cost in euro, e.g. 12.5. Use 0 if not mentioned)\n  - verde: boolean (true if 100% renewable/green energy)\n  - note: string (brief description, max 50 chars)",

    gas: "Array of objects with EXACTLY these fields:\n  - name: string (provider name, e.g. \"Edison\", \"Sorgenia\". Use the COMPANY name)\n  - offerName: string (the specific offer name, e.g. \"Web Gas\", \"Next Energy Smart Gas\")\n  - tipo: string (MUST be exactly one of: \"Fisso 12m\", \"Fisso 24m\", \"Variabile\")\n  - prezzo: number (price in euro/Smc, e.g. 0.42. MUST be a decimal, NOT annual estimate)\n  - fisso: number (monthly fixed cost in euro. Use 0 if not mentioned)\n  - note: string (brief description, max 50 chars)",

    internet: "Array of objects with EXACTLY these fields:\n  - name: string (provider + offer name, e.g. \"Iliad Fibra\", \"Fastweb Casa Light\")\n  - tipo: string (\"FTTH\" | \"FTTC\" | \"FWA\")\n  - prezzo: number (monthly price in euro, e.g. 19.99)\n  - velocita: string (download speed, e.g. \"2.5 Gbps\", \"1 Gbps\". Use Gbps where >= 1000 Mbps)\n  - vincolo: string (\"No\" | \"24 mesi\" | \"18 mesi\" | \"12 mesi\" | \"6 mesi\" | \"36 mesi\")\n  - note: string (brief description, max 50 chars)",
  };

  var sourceBlock = textsWithSources
    .filter(function (s) { return s.text; })
    .map(function (s, i) { return "--- SOURCE " + (i + 1) + ": " + s.url + " ---\n" + s.text; })
    .join("\n\n");

  if (!sourceBlock.trim()) return null;

  var categoryLabel = category === "energia" ? "luce/energia elettrica" : category;

 var prompt = "Sei un estrattore di dati per un comparatore italiano di offerte " + categoryLabel + ".\n\nCOMPITO: Analizza i testi e estrai le offerte " + categoryLabel + ".\n\nREGOLE CRITICHE:\n1. Restituisci SOLO un JSON array valido. Niente markdown, niente backtick, niente commenti.\n2. Il campo \"prezzo\" deve essere il PREZZO UNITARIO (euro/kWh per energia, euro/Smc per gas, euro/mese per internet), NON la stima annua.\n3. NON duplicare: se la stessa offerta appare su piu fonti, includila UNA sola volta.\n4. Se un dato non e chiaro, usa il valore piu ragionevole. NON inventare offerte.\n5. Includi minimo 8, massimo 18 offerte. ASSICURATI DI INCLUDERE, se presenti nel testo, anche operatori come Pulsee, Iberdrola, Argos, SegnoVerde, Poste, Estra, Dimensione o Virgin Fibra.\n6. Ordina per prezzo crescente.\n7. Per internet, Fastweb offre FTTH fino a 2.5 Gbps - non confondere con le offerte FWA. Includi SEMPRE le offerte FTTH principali.\n8. Distingui chiaramente tra offerte a prezzo FISSO (bloccato 12-24 mesi) e VARIABILE (indicizzate PUN/PSV + spread).\n\nSCHEMA:\n" + schemas[category] + "\n\nTESTI:\n" + sourceBlock + "\n\nJSON ARRAY:";

  var res = await fetch("https://api.anthropic.com/v1/messages", {
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

  if (!res.ok) throw new Error("Claude API error " + res.status + ": " + (await res.text()));

  var data = await res.json();
  var raw = data.content && data.content[0] && data.content[0].text ? data.content[0].text.trim() : "";
  if (!raw) throw new Error("Empty response from Claude");

  var cleaned = raw.replace(/^```json?\s*/i, "").replace(/\s*```$/i, "").trim();
  var parsed = JSON.parse(cleaned);
  if (!Array.isArray(parsed) || parsed.length === 0) throw new Error("Invalid result: not a non-empty array");

  return parsed;
}

export default async function handler(req) {
  console.log("Starting daily price update...");

  var store = getStore("prices");
  var results = {};
  var errors = [];

  for (var _i = 0, _a = Object.entries(SOURCES); _i < _a.length; _i++) {
    var category = _a[_i][0];
    var urls = _a[_i][1];

    console.log("Processing " + category + "...");

    try {
      // ─── UNIVERSITÀ: percorso speciale con web_search ───
      if (category === "universita") {
        console.log("  Using Claude web_search for autonomous research...");
        var extracted = await extractUniversitaWithResearch();

        // Deduplica per uni + facolta
        var seen = new Set();
        var deduped = extracted.filter(function (o) {
          var key = (o.uni || "").toLowerCase().trim() + "|" + (o.facolta || "").toLowerCase().trim();
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });

        // Raggruppa per facoltà (il frontend si aspetta { "Economia": [...], "Medicina": [...] })
        var grouped = {};
        deduped.forEach(function (o) {
          var fac = o.facolta || "Altro";
          if (!grouped[fac]) grouped[fac] = [];
          grouped[fac].push({ uni: o.uni, citta: o.citta, min: o.min, med: o.med, max: o.max, tipo: o.tipo });
        });

        results[category] = grouped;
        console.log("  Researched " + deduped.length + " entries across " + Object.keys(grouped).length + " facolta");
        continue;
      }

      // ─── ENERGIA / GAS / INTERNET: percorso classico con scraping ───
      console.log("  Fetching from " + urls.length + " sources...");

      var textsWithSources = await Promise.all(
        urls.map(async function (url) { return { url: url, text: await fetchPageText(url) }; })
      );

      var validSources = textsWithSources.filter(function (s) { return s.text; });
      console.log("  " + validSources.length + "/" + urls.length + " sources fetched");

      if (validSources.length === 0) {
        errors.push(category + ": all sources failed");
        continue;
      }

      var extracted = await extractWithClaude(category, textsWithSources);

      // Deduplicate by name + tipo + prezzo
      var seen = new Set();
      var deduped = extracted.filter(function (o) {
        var key = (o.name || "").toLowerCase().trim() + "|" + (o.tipo || "").toLowerCase().trim() + "|" + o.prezzo;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      // Add provider links
      var withLinks = deduped.map(function (o) {
        return Object.assign({}, o, { link: guessProviderLink(o.name) || null });
      });

      results[category] = withLinks;
      console.log("  Claude extracted " + extracted.length + " -> deduped to " + withLinks.length + " for " + category);
    } catch (err) {
      errors.push(category + ": " + err.message);
      console.error("  " + category + " failed: " + err.message);
    }
  }

  if (Object.keys(results).length > 0) {
    var payload = { lastUpdated: new Date().toISOString(), data: results };
    await store.setJSON("latest", payload);
    var dateKey = new Date().toISOString().split("T")[0];
    await store.setJSON("archive-" + dateKey, payload);
    console.log("Saved: " + JSON.stringify(Object.keys(results)));
  }

  var summary = {
    success: Object.keys(results).length > 0,
    categoriesUpdated: Object.keys(results),
    offersCount: Object.fromEntries(Object.entries(results).map(function (e) {
      var val = e[1];
      var count = Array.isArray(val) ? val.length : Object.keys(val).length + " facolta";
      return [e[0], count];
    })),
    errors: errors,
    timestamp: new Date().toISOString(),
  };

  console.log("Summary: " + JSON.stringify(summary, null, 2));
  return new Response(JSON.stringify(summary, null, 2), { status: 200, headers: { "Content-Type": "application/json" } });
}

export var config = { schedule: "0 6 * * *" };
