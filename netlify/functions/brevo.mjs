// Netlify Function: gestisce newsletter e promemoria auto via Brevo
export default async (req) => {
  // Solo POST
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Metodo non consentito" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const API_KEY = process.env.BREVO_API_KEY;
  if (!API_KEY) {
    return new Response(JSON.stringify({ error: "API key Brevo non configurata" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const SENDER_EMAIL = process.env.SENDER_EMAIL || "noreply@soldibuoni.it";
  const SENDER_NAME = "Soldi Buoni";
  const headers = {
    "api-key": API_KEY,
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  let body;
  try {
    body = await req.json();
  } catch (e) {
    return new Response(JSON.stringify({ error: "JSON non valido" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { action } = body;

  try {
    // ─── NEWSLETTER SIGNUP ────────────────────────────────────
    if (action === "newsletter") {
      const { email } = body;
      if (!email) {
        return new Response(JSON.stringify({ error: "Email obbligatoria" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      // Aggiungi contatto alla lista Newsletter
      const listId = parseInt(process.env.BREVO_NEWSLETTER_LIST_ID || "2");
      const res = await fetch("https://api.brevo.com/v3/contacts", {
        method: "POST",
        headers,
        body: JSON.stringify({
          email,
          listIds: [listId],
          updateEnabled: true,
        }),
      });

      // Gestisci risposta (Brevo può restituire corpo vuoto con 201/204)
      let data = null;
      const text = await res.text();
      if (text) {
        try { data = JSON.parse(text); } catch (e) { /* ignora */ }
      }

      if (!res.ok && res.status !== 204) {
        console.error("Errore creazione contatto:", res.status, data);
        return new Response(JSON.stringify({ error: "Errore salvataggio contatto", details: data }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }

      // Invia email di benvenuto
      const emailRes = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers,
        body: JSON.stringify({
          sender: { name: SENDER_NAME, email: SENDER_EMAIL },
          to: [{ email }],
          subject: "Benvenuto su Soldi Buoni! \uD83C\uDFAF",
          htmlContent: `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family: Arial, sans-serif; background: #f8fafc; padding: 40px 20px;">
  <div style="max-width: 560px; margin: 0 auto; background: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.06);">
    <div style="background: linear-gradient(135deg, #0f172a, #1e293b); padding: 32px; text-align: center;">
      <h1 style="color: #fff; font-size: 24px; margin: 0;">Soldi Buoni</h1>
      <p style="color: #34d399; margin: 8px 0 0; font-size: 14px;">Monitoraggio Rincari Attivato</p>
    </div>
    <div style="padding: 32px;">
      <h2 style="color: #0f172a; font-size: 20px; margin: 0 0 16px;">Benvenuto! \uD83C\uDF89</h2>
      <p style="color: #475569; font-size: 15px; line-height: 1.7;">
        Da oggi riceverai una notifica ogni volta che i fornitori di energia, gas, internet 
        o le compagnie assicurative cambieranno le condizioni di mercato.
      </p>
      <p style="color: #475569; font-size: 15px; line-height: 1.7;">
        Il nostro obiettivo è semplice: <strong>aiutarti a non pagare un euro in più del necessario.</strong>
      </p>
      <div style="background: #f0fdf4; border-radius: 12px; padding: 20px; margin: 24px 0;">
        <p style="color: #166534; font-size: 14px; margin: 0;">
          <strong>\uD83D\uDCA1 Consiglio immediato:</strong> Visita <a href="https://soldibuoni.it" style="color: #059669;">soldibuoni.it</a> 
          e usa i nostri comparatori per verificare subito se stai pagando troppo per luce, gas o assicurazione.
        </p>
      </div>
      <p style="color: #94a3b8; font-size: 13px; margin-top: 24px;">
        A presto,<br>Il team di Soldi Buoni
      </p>
    </div>
  </div>
</body>
</html>`,
        }),
      });

      if (!emailRes.ok) {
        const errText = await emailRes.text();
        console.error("Errore invio email benvenuto:", emailRes.status, errText);
      }

      return new Response(JSON.stringify({ success: true, message: "Iscrizione completata" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // ─── CAR REMINDER SIGNUP ──────────────────────────────────
    if (action === "car_reminder") {
      const { email, nome, targa, scadenze } = body;
      if (!email || !nome) {
        return new Response(JSON.stringify({ error: "Email e nome obbligatori" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      // Aggiungi contatto con attributi scadenze alla lista Promemoria Auto
      const listId = parseInt(process.env.BREVO_CAR_LIST_ID || "3");
      const attributes = { NOME: nome };
      if (targa) attributes.TARGA = targa;
      if (scadenze) {
        if (scadenze.bollo) attributes.SCADENZA_BOLLO = scadenze.bollo;
        if (scadenze.revisione) attributes.SCADENZA_REVISIONE = scadenze.revisione;
        if (scadenze.tagliando) attributes.SCADENZA_TAGLIANDO = scadenze.tagliando;
        if (scadenze.gommeInvernali) attributes.SCADENZA_GOMME_INV = scadenze.gommeInvernali;
        if (scadenze.gommeEstive) attributes.SCADENZA_GOMME_EST = scadenze.gommeEstive;
      }

      const contactRes = await fetch("https://api.brevo.com/v3/contacts", {
        method: "POST",
        headers,
        body: JSON.stringify({
          email,
          listIds: [listId],
          updateEnabled: true,
          attributes,
        }),
      });

      if (!contactRes.ok && contactRes.status !== 204) {
        const errText = await contactRes.text();
        console.error("Errore creazione contatto auto:", contactRes.status, errText);
      }

      // Genera HTML delle scadenze per l'email
      let scadenzeHTML = "";
      const scadenzeList = [
        { label: "\uD83D\uDCB3 Bollo Auto", date: scadenze?.bollo },
        { label: "\uD83D\uDD0D Revisione", date: scadenze?.revisione },
        { label: "\uD83D\uDD27 Tagliando", date: scadenze?.tagliando },
        { label: "\uD83D\uDEDE Gomme invernali", date: scadenze?.gommeInvernali },
        { label: "\u2600\uFE0F Gomme estive", date: scadenze?.gommeEstive },
      ];

      for (const s of scadenzeList) {
        if (s.date) {
          const d = new Date(s.date);
          const formatted = d.toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });
          scadenzeHTML += `
            <tr>
              <td style="padding: 12px 16px; border-bottom: 1px solid #f1f5f9; font-size: 14px; color: #475569;">${s.label}</td>
              <td style="padding: 12px 16px; border-bottom: 1px solid #f1f5f9; font-size: 14px; font-weight: 700; color: #0f172a; text-align: right;">${formatted}</td>
            </tr>`;
        }
      }

      // Invia email di conferma con riepilogo scadenze
      const emailRes = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers,
        body: JSON.stringify({
          sender: { name: SENDER_NAME, email: SENDER_EMAIL },
          to: [{ email, name: nome }],
          subject: `\u2705 Promemoria auto ${targa || ""} attivati — Soldi Buoni`,
          htmlContent: `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family: Arial, sans-serif; background: #f8fafc; padding: 40px 20px;">
  <div style="max-width: 560px; margin: 0 auto; background: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.06);">
    <div style="background: linear-gradient(135deg, #F97316, #EA580C); padding: 32px; text-align: center;">
      <h1 style="color: #fff; font-size: 24px; margin: 0;">\uD83D\uDE97 Promemoria Auto Attivati</h1>
      <p style="color: #fff; opacity: 0.9; margin: 8px 0 0; font-size: 16px;">${targa || ""}</p>
    </div>
    <div style="padding: 32px;">
      <h2 style="color: #0f172a; font-size: 18px; margin: 0 0 8px;">Ciao ${nome}!</h2>
      <p style="color: #475569; font-size: 15px; line-height: 1.7; margin-bottom: 24px;">
        I tuoi promemoria sono attivi. Riceverai un'email <strong>una settimana prima</strong> di ogni scadenza.
      </p>
      <table style="width: 100%; border-collapse: collapse; background: #f8fafc; border-radius: 12px; overflow: hidden;">
        <tr style="background: #0f172a;">
          <th style="padding: 12px 16px; text-align: left; color: #fff; font-size: 13px; font-weight: 600;">Scadenza</th>
          <th style="padding: 12px 16px; text-align: right; color: #fff; font-size: 13px; font-weight: 600;">Data</th>
        </tr>
        ${scadenzeHTML}
      </table>
      <div style="background: #fff7ed; border-radius: 12px; padding: 20px; margin: 24px 0; border: 1px solid #fed7aa;">
        <p style="color: #9a3412; font-size: 14px; margin: 0;">
          <strong>\uD83D\uDCCC Conserva questa email</strong> — è il riepilogo di tutte le scadenze della tua auto.
        </p>
      </div>
      <p style="color: #94a3b8; font-size: 13px;">
        A presto,<br>Il team di Soldi Buoni
      </p>
    </div>
  </div>
</body>
</html>`,
        }),
      });

      if (!emailRes.ok) {
        const errText = await emailRes.text();
        console.error("Errore invio email promemoria:", emailRes.status, errText);
      }

      return new Response(JSON.stringify({ success: true, message: "Promemoria attivati" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Azione non riconosciuta" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Errore Brevo:", error);
    return new Response(JSON.stringify({ error: "Errore del server", details: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

export const config = {
  path: "/api/brevo",
};
