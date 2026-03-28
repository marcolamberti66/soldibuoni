import { getStore } from "@netlify/blobs";

// ═══════════════════════════════════════════════════════════════════
// UPDATE-KNOWLEDGE: Aggiorna Università, RC Auto, Fondi Pensione
//
// OTTIMIZZAZIONE: Usa Haiku (10x più economico di Sonnet)
// Per generare dati da conoscenze interne, Haiku è sufficiente.
//
// SCHEDULE: Ogni lunedì alle 07:00 (1 ora dopo update-prices)
// ═══════════════════════════════════════════════════════════════════

async function askClaude(prompt, maxTokens) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

  var res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: maxTokens || 8000,
      temperature: 0,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) throw new Error("Claude API error " + res.status + ": " + (await res.text()));

  var data = await res.json();
  var raw = data.content && data.content[0] && data.content[0].text ? data.content[0].text.trim() : "";
  if (!raw) throw new Error("Empty response from Claude");

  var cleaned = raw.replace(/^```json?\s*/i, "").replace(/\s*```$/i, "").trim();
  return JSON.parse(cleaned);
}

async function getUniversita() {
  console.log("  Asking Claude for universita data...");

  var prompt = `Compila una tabella delle rette universitarie italiane A.A. 2025/2026.

Restituisci dati per ESATTAMENTE queste 10 facolta (usa questi nomi IDENTICI):
Economia, Giurisprudenza, Ingegneria, Medicina, Architettura, Scienze Politiche, Lettere e Filosofia, Psicologia, Informatica, Scienze della Comunicazione

Per OGNI facolta includi 5-7 universita scelte SOLO tra queste (solo quelle che offrono realmente quella facolta):

PRIVATE: Bocconi (Milano), LUISS (Roma), Cattolica (Milano), IULM (Milano), San Raffaele (Milano), Humanitas (Milano), Campus Bio-Medico (Roma)
PUBBLICHE: Statale Milano, La Sapienza (Roma), Bologna, Padova, Politecnico Milano, Politecnico Torino, Torino, Federico II (Napoli), IUAV (Venezia), Trento, Bicocca (Milano)

REGOLE RETTE PUBBLICHE:
- min: no-tax area = 156 euro (ISEE sotto 13.000)
- med: ISEE 25.000-30.000 = tipicamente 1000-1500 euro (Politecnici un po' di piu)
- max: senza ISEE = tipicamente 2400-3800 euro (Politecnici fino a 3800)

REGOLE RETTE PRIVATE:
- Bocconi: min 5900, med 9000-9200, max 12500-13000
- LUISS: min 5500, med 8000-8500, max 11000-12000
- Cattolica: min 3500-3800, med 5500-6200, max 8000-8900
- IULM: min 4500, med 6500, max 9000
- San Raffaele Medicina: min 8000, med 14000, max 20000
- Humanitas Medicina: min 9000, med 15000, max 20000
- Campus Bio-Medico: min 6000, med 10000, max 15000

FORMATO: SOLO JSON array valido. Niente markdown, backtick, commenti.
Campi: facolta, uni, citta, min, med, max, tipo ("Pubblica"|"Privata")
Almeno 55 oggetti. Ordina per facolta poi med crescente.

JSON ARRAY:`;

  var parsed = await askClaude(prompt, 10000);
  if (!Array.isArray(parsed) || parsed.length < 30) throw new Error("Universita: too few results (" + parsed.length + ")");

  var seen = new Set();
  var deduped = parsed.filter(function (o) {
    var key = (o.uni || "").toLowerCase() + "|" + (o.facolta || "").toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  var grouped = {};
  deduped.forEach(function (o) {
    var fac = o.facolta || "Altro";
    if (!grouped[fac]) grouped[fac] = [];
    grouped[fac].push({ uni: o.uni, citta: o.citta, min: o.min, med: o.med, max: o.max, tipo: o.tipo });
  });

  console.log("  Universita: " + deduped.length + " entries, " + Object.keys(grouped).length + " facolta");
  return grouped;
}

async function getRcAuto() {
  console.log("  Asking Claude for rc_auto data...");

  var prompt = `Compila una tabella dei premi assicurativi RC Auto in Italia per marzo 2026.

Profilo standard: classe di merito 1-5, provincia Milano, auto media (es. VW Golf o simile).

Includi queste 7 compagnie:
UnipolSai, Generali, Allianz Direct, Zurich Connect, ConTe.it, Prima Assicurazioni, Verti

Per ogni compagnia fornisci i costi annui in euro di:
- rc: premio RC Auto base annuo
- furto: garanzia Furto e Incendio annua
- kasko: garanzia Kasko annua
- cristalli: garanzia Cristalli annua
- assistenza: Assistenza Stradale annua
- note: breve descrizione (max 40 caratteri)
- link: URL del sito ufficiale della compagnia per preventivo (es. "https://www.allianzdirect.it/assicurazione-auto/")

LINEE GUIDA PREZZI:
- RC base: 280-420 euro (online piu economiche, tradizionali piu care)
- Furto/Incendio: 85-140 euro
- Kasko: 350-520 euro
- Cristalli: 30-50 euro
- Assistenza: 20-40 euro

FORMATO: SOLO JSON array valido. Niente markdown, backtick, commenti.
Campi: name, rc, furto, kasko, cristalli, assistenza, note, link
Ordina per rc crescente.

JSON ARRAY:`;

  var parsed = await askClaude(prompt, 3000);
  if (!Array.isArray(parsed) || parsed.length < 5) throw new Error("RC Auto: too few results (" + parsed.length + ")");

  console.log("  RC Auto: " + parsed.length + " compagnie");
  return parsed;
}

async function getPensione() {
  console.log("  Asking Claude for pensione data...");

  var prompt = `Compila una tabella dei principali fondi pensione italiani con dati aggiornati.

Includi ESATTAMENTE questi 7 fondi:
1. Cometa (Negoziale, Metalmeccanici)
2. Fonte (Negoziale, Commercio/Turismo)
3. Fon.Te (Negoziale, Vari CCNL)
4. Amundi SecondaPensione (Aperto, Tutti)
5. Allianz Insieme (Aperto, Tutti)
6. Arca Previdenza (Aperto, Tutti)
7. Generali Global (PIP, Tutti)

Per ogni fondo fornisci:
- name: nome del fondo
- tipo: "Negoziale" | "Aperto" | "PIP"
- costo: ISC in percentuale annua
- rendimento5y: rendimento medio annuo composto a 5 anni (%)
- rendimento10y: rendimento medio annuo composto a 10 anni (%)
- settore: categoria lavoratori
- note: breve descrizione (max 50 caratteri)
- link: URL del sito ufficiale del fondo (es. "https://www.cometafondo.it/")

LINEE GUIDA:
- Negoziali: ISC 0.15-0.25%, rendimenti 3.5-4.5% (5y), 4.5-5.5% (10y)
- Aperti: ISC 1.0-1.4%, rendimenti 4.5-5.5% (5y), 5.0-6.0% (10y)
- PIP: ISC 1.8-2.2%, rendimenti 3.0-3.5% (5y), 3.5-4.0% (10y)

FORMATO: SOLO JSON array valido. Niente markdown, backtick, commenti.
Ordina per costo (ISC) crescente.

JSON ARRAY:`;

  var parsed = await askClaude(prompt, 3000);
  if (!Array.isArray(parsed) || parsed.length < 5) throw new Error("Pensione: too few results (" + parsed.length + ")");

  console.log("  Pensione: " + parsed.length + " fondi");
  return parsed;
}

export default async function handler(req) {
  console.log("Starting knowledge update (universita, rc_auto, pensione)...");

  var store = getStore("prices");
  var newData = {};
  var errors = [];

  try {
    newData.universita = await getUniversita();
  } catch (err) {
    errors.push("universita: " + err.message);
    console.error("  universita failed: " + err.message);
  }

  try {
    newData.rc_auto = await getRcAuto();
  } catch (err) {
    errors.push("rc_auto: " + err.message);
    console.error("  rc_auto failed: " + err.message);
  }

  try {
    newData.pensione = await getPensione();
  } catch (err) {
    errors.push("pensione: " + err.message);
    console.error("  pensione failed: " + err.message);
  }

  if (Object.keys(newData).length > 0) {
    var existing = {};
    try {
      var raw = await store.get("latest");
      if (raw) {
        var parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
        existing = parsed.data || {};
      }
    } catch (e) {
      console.warn("  Could not read existing blob, starting fresh: " + e.message);
    }

    var merged = Object.assign({}, existing, newData);

    var payload = { lastUpdated: new Date().toISOString(), data: merged };
    await store.setJSON("latest", payload);
    var dateKey = new Date().toISOString().split("T")[0];
    await store.setJSON("archive-knowledge-" + dateKey, payload);
    console.log("Merged and saved: " + JSON.stringify(Object.keys(merged)));
  }

  var summary = {
    success: Object.keys(newData).length > 0,
    categoriesUpdated: Object.keys(newData),
    details: {
      universita: newData.universita ? Object.keys(newData.universita).length + " facolta" : "failed",
      rc_auto: newData.rc_auto ? newData.rc_auto.length + " compagnie" : "failed",
      pensione: newData.pensione ? newData.pensione.length + " fondi" : "failed",
    },
    errors: errors,
    timestamp: new Date().toISOString(),
  };

  console.log("Summary: " + JSON.stringify(summary, null, 2));
  return new Response(JSON.stringify(summary, null, 2), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

// Ogni lunedì alle 07:00
export var config = { schedule: "0 7 * * 1" };
