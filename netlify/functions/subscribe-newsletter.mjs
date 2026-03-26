// ═══════════════════════════════════════════════════════════════════
// SUBSCRIBE-NEWSLETTER: Aggiunge un contatto a Brevo (Sendinblue)
// con gli interessi selezionati per la newsletter mensile.
// ═══════════════════════════════════════════════════════════════════

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

  try {
    const body = await req.json();
    const { email, nome, interessi } = body;

    if (!email || !email.includes("@")) {
      return new Response(
        JSON.stringify({ error: "invalid_email", message: "Email non valida." }),
        { status: 400, headers }
      );
    }

    const brevoKey = process.env.BREVO_API_KEY;
    if (!brevoKey) {
      console.error("BREVO_API_KEY not set");
      return new Response(
        JSON.stringify({ error: "config_error", message: "Servizio newsletter non configurato." }),
        { status: 500, headers }
      );
    }

    // Lista Brevo: ID 2 = Newsletter Mensile (cambia se la tua lista ha un ID diverso)
    // Puoi trovare l'ID nella dashboard Brevo → Contacts → Lists
    const NEWSLETTER_LIST_ID = 2;

    const contactData = {
      email: email.toLowerCase().trim(),
      attributes: {
        NOME: nome || "",
        INTERESSI: (interessi || []).join(","),
        SOURCE: "soldibuoni_website",
        SIGNUP_DATE: new Date().toISOString().split("T")[0],
      },
      listIds: [NEWSLETTER_LIST_ID],
      updateEnabled: true, // aggiorna se esiste già
    };

    console.log("Subscribing: " + email + " interests: " + (interessi || []).join(","));

    const res = await fetch("https://api.brevo.com/v3/contacts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": brevoKey,
      },
      body: JSON.stringify(contactData),
    });

    if (res.ok || res.status === 204) {
      console.log("Subscribed successfully: " + email);
      return new Response(
        JSON.stringify({ success: true, message: "Iscrizione completata." }),
        { status: 200, headers }
      );
    }

    // Brevo restituisce 400 se il contatto esiste già in quella lista
    if (res.status === 400) {
      const errBody = await res.json().catch(() => ({}));
      if (errBody.code === "duplicate_parameter") {
        // Già iscritto — aggiorna gli attributi
        const updateRes = await fetch("https://api.brevo.com/v3/contacts/" + encodeURIComponent(email.toLowerCase().trim()), {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "api-key": brevoKey,
          },
          body: JSON.stringify({
            attributes: contactData.attributes,
            listIds: [NEWSLETTER_LIST_ID],
          }),
        });

        if (updateRes.ok || updateRes.status === 204) {
          console.log("Updated existing contact: " + email);
          return new Response(
            JSON.stringify({ success: true, message: "Preferenze aggiornate." }),
            { status: 200, headers }
          );
        }
      }

      console.error("Brevo error: " + JSON.stringify(errBody));
      return new Response(
        JSON.stringify({ error: "brevo_error", message: "Errore durante l'iscrizione." }),
        { status: 502, headers }
      );
    }

    const errText = await res.text();
    console.error("Brevo unexpected: " + res.status + " " + errText);
    return new Response(
      JSON.stringify({ error: "brevo_error", message: "Errore inaspettato." }),
      { status: 502, headers }
    );

  } catch (err) {
    console.error("subscribe-newsletter error: " + err.message);
    return new Response(
      JSON.stringify({ error: "server_error", message: err.message }),
      { status: 500, headers }
    );
  }
}
