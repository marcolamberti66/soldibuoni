import { getStore } from "@netlify/blobs";

// ═══════════════════════════════════════════════════════════════════
// ANALYZE-BILL: Riceve un PDF bolletta, lo invia a Claude,
// restituisce l'analisi strutturata con risparmio potenziale.
//
// OTTIMIZZAZIONI COSTI:
// - Rate limiting: max 20 analisi/giorno (evita abusi e costi esplosivi)
// - Sonnet mantenuto: leggere un PDF richiede intelligenza visiva
// - max_tokens ridotto a 1500 (sufficiente per il JSON di risposta)
// ═══════════════════════════════════════════════════════════════════

const MAX_DAILY_ANALYSES = 20;

async function checkRateLimit() {
  try {
    var store = getStore("rate-limits");
    var today = new Date().toISOString().split("T")[0];
    var raw = await store.get("analyze-bill-" + today);
    var count = raw ? parseInt(raw, 10) : 0;
    return { count: count, allowed: count < MAX_DAILY_ANALYSES, today: today };
  } catch (err) {
    // Se il blob store non è raggiungibile, permettiamo comunque (fail open)
    console.warn("Rate limit check failed: " + err.message);
    return { count: 0, allowed: true, today: new Date().toISOString().split("T")[0] };
  }
}

async function incrementRateLimit(today) {
  try {
    var store = getStore("rate-limits");
    var raw = await store.get("analyze-bill-" + today);
    var count = raw ? parseInt(raw, 10) : 0;
    await store.set("analyze-bill-" + today, String(count + 1));
  } catch (err) {
    console.warn("Rate limit increment failed: " + err.message);
  }
}

export default async function handler(req) {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };

  if (req.method === "OPTIONS") {
    return new Response("", { status: 204, headers });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers });
  }

  // ═══ RATE LIMITING ═══
  var rateCheck = await checkRateLimit();
  if (!rateCheck.allowed) {
    console.warn("Rate limit reached: " + rateCheck.count + "/" + MAX_DAILY_ANALYSES + " for " + rateCheck.today);
    return new Response(
      JSON.stringify({
        error: "rate_limited",
        message: "Servizio temporaneamente non disponibile. Abbiamo raggiunto il limite giornaliero di analisi gratuite (" + MAX_DAILY_ANALYSES + "/giorno). Riprova domani mattina.",
        remaining: 0,
      }),
      { status: 429, headers }
    );
  }

  try {
    const body = await req.json();
    const { pdf, filename } = body;

    if (!pdf) {
      return new Response(
        JSON.stringify({ error: "missing_pdf", message: "Nessun PDF ricevuto." }),
        { status: 400, headers }
      );
    }

    // Limita dimensione PDF (base64 ~1.33x del file originale)
    // 5MB file = ~6.65MB base64
    if (pdf.length > 7000000) {
      return new Response(
        JSON.stringify({ error: "too_large", message: "Il file è troppo grande (max 5 MB)." }),
        { status: 413, headers }
      );
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "config_error", message: "Chiave API non configurata." }),
        { status: 500, headers }
      );
    }

    console.log("Analyzing bill: " + (filename || "unknown") + " (" + Math.round(pdf.length * 0.75 / 1024) + " KB) — usage: " + (rateCheck.count + 1) + "/" + MAX_DAILY_ANALYSES);

    const prompt = `Sei un analista esperto di bollette italiane (luce e gas).
IGNORA RIGOROSAMENTE tutti i dati personali: nome, cognome, indirizzo, codice fiscale, POD, PDR, IBAN.

Analizza questa bolletta PDF e restituisci SOLO un JSON valido con questi campi:
- tipo: string ("energia" | "gas" | "altro")
- fornitore: string (nome del fornitore, es. "Enel Energia", "Eni Plenitude")
- consumo: number (consumo nel periodo, in kWh o Smc)
- unita: string ("kWh" | "Smc")
- periodoFatturazione: string (es. "gen-mar 2026")
- prezzoUnitario: string (prezzo per unita, es. "0.142")
- costoFisso: number (costo fisso mensile in euro, 0 se non trovato)
- totaleBolletta: string (importo totale della bolletta in euro)
- tipoContratto: string ("Fisso" | "Variabile" | "Non determinabile")
- analisi: string (3-5 frasi in italiano che spiegano: cosa stai pagando, se il prezzo e nella media o sopra/sotto, quali voci sono anomale, e un consiglio specifico)
- consiglio: string (1-2 frasi con il consiglio principale per risparmiare)
- risparmioAnnuo: number (stima del risparmio annuo in euro passando alla migliore offerta di mercato. Per energia, le migliori variabili hanno spread 0-0.01 euro/kWh. Per gas, spread 0.05-0.07 euro/Smc. Calcola: (tuo prezzo - miglior prezzo) * consumo annualizzato)

REGOLE:
1. Restituisci SOLO JSON valido. Niente markdown, backtick, commenti.
2. Se non riesci a leggere un dato, usa "Non determinabile" per le stringhe e 0 per i numeri.
3. Annualizza il consumo se il periodo e inferiore a 12 mesi.
4. Sii specifico nell'analisi: cita i numeri della bolletta.
5. Nel consiglio, suggerisci azioni concrete.

JSON:`;

    // Sonnet per l'analisi PDF — richiede capacità visiva/documentale superiore
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1500,
        temperature: 0,
        messages: [{
          role: "user",
          content: [
            {
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: pdf,
              },
            },
            {
              type: "text",
              text: prompt,
            },
          ],
        }],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("Claude API error: " + res.status + " " + errText);
      return new Response(
        JSON.stringify({ error: "api_error", message: "Errore nell'analisi. Riprova tra qualche secondo." }),
        { status: 502, headers }
      );
    }

    const data = await res.json();
    const raw = data.content && data.content[0] && data.content[0].text ? data.content[0].text.trim() : "";

    if (!raw) {
      return new Response(
        JSON.stringify({ error: "empty_response", message: "Analisi vuota. Il PDF potrebbe non essere una bolletta leggibile." }),
        { status: 422, headers }
      );
    }

    const cleaned = raw.replace(/^```json?\s*/i, "").replace(/\s*```$/i, "").trim();
    const parsed = JSON.parse(cleaned);

    // ═══ Incrementa il contatore SOLO dopo un'analisi riuscita ═══
    await incrementRateLimit(rateCheck.today);

    var remaining = MAX_DAILY_ANALYSES - rateCheck.count - 1;
    console.log("Analysis complete: " + parsed.fornitore + " " + parsed.tipo + " — remaining today: " + remaining);

    // Aggiungi info rate limit alla risposta
    parsed._rateLimit = { remaining: remaining, limit: MAX_DAILY_ANALYSES };

    return new Response(JSON.stringify(parsed), { status: 200, headers });

  } catch (err) {
    console.error("analyze-bill error: " + err.message);
    return new Response(
      JSON.stringify({ error: "server_error", message: "Errore del server: " + err.message }),
      { status: 500, headers }
    );
  }
}
