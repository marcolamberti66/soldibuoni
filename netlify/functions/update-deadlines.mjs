// Netlify Scheduled Function: aggiorna le scadenze scadute alla prossima occorrenza
// Gira ogni lunedì alle 6:00 UTC

export default async () => {
  const API_KEY = process.env.BREVO_API_KEY;
  if (!API_KEY) { console.error("BREVO_API_KEY mancante"); return; }

  const CAR_LIST_ID = parseInt(process.env.BREVO_CAR_LIST_ID || "3");
  const headers = {
    "api-key": API_KEY,
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  try {
    // Recupera tutti i contatti
    let offset = 0;
    let allContacts = [];
    let hasMore = true;
    while (hasMore) {
      const res = await fetch(
        `https://api.brevo.com/v3/contacts/lists/${CAR_LIST_ID}/contacts?limit=50&offset=${offset}`,
        { headers }
      );
      const data = await res.json();
      if (data.contacts && data.contacts.length > 0) {
        allContacts = allContacts.concat(data.contacts);
        offset += 50;
        hasMore = data.contacts.length === 50;
      } else { hasMore = false; }
    }

    console.log(`Controllo scadenze scadute per ${allContacts.length} contatti`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let updated = 0;

    for (const contact of allContacts) {
      const attrs = contact.attributes || {};
      const updates = {};

      // Bollo: annuale, stesso mese
      if (attrs.SCADENZA_BOLLO) {
        const d = new Date(attrs.SCADENZA_BOLLO);
        if (d < today) {
          d.setFullYear(d.getFullYear() + 1);
          updates.SCADENZA_BOLLO = d.toISOString().split("T")[0];
        }
      }

      // Revisione: ogni 2 anni
      if (attrs.SCADENZA_REVISIONE) {
        const d = new Date(attrs.SCADENZA_REVISIONE);
        if (d < today) {
          d.setFullYear(d.getFullYear() + 2);
          updates.SCADENZA_REVISIONE = d.toISOString().split("T")[0];
        }
      }

      // Tagliando: ogni anno
      if (attrs.SCADENZA_TAGLIANDO) {
        const d = new Date(attrs.SCADENZA_TAGLIANDO);
        if (d < today) {
          d.setFullYear(d.getFullYear() + 1);
          updates.SCADENZA_TAGLIANDO = d.toISOString().split("T")[0];
        }
      }

      // Gomme invernali: 15 novembre ogni anno
      if (attrs.SCADENZA_GOMME_INV) {
        const d = new Date(attrs.SCADENZA_GOMME_INV);
        if (d < today) {
          let next = new Date(today.getFullYear(), 10, 15); // 15 novembre
          if (next < today) next.setFullYear(next.getFullYear() + 1);
          updates.SCADENZA_GOMME_INV = next.toISOString().split("T")[0];
        }
      }

      // Gomme estive: 15 aprile ogni anno
      if (attrs.SCADENZA_GOMME_EST) {
        const d = new Date(attrs.SCADENZA_GOMME_EST);
        if (d < today) {
          let next = new Date(today.getFullYear(), 3, 15); // 15 aprile
          if (next < today) next.setFullYear(next.getFullYear() + 1);
          updates.SCADENZA_GOMME_EST = next.toISOString().split("T")[0];
        }
      }

      // Se ci sono aggiornamenti, invia a Brevo
      if (Object.keys(updates).length > 0) {
        await fetch(`https://api.brevo.com/v3/contacts/${encodeURIComponent(contact.email)}`, {
          method: "PUT",
          headers,
          body: JSON.stringify({ attributes: updates }),
        });
        updated++;
        console.log(`Aggiornato ${contact.email}: ${JSON.stringify(updates)}`);
        await new Promise((r) => setTimeout(r, 300));
      }
    }

    console.log(`Completato. Contatti aggiornati: ${updated}`);
  } catch (error) {
    console.error("Errore aggiornamento scadenze:", error);
  }
};

export const config = {
  schedule: "0 6 * * 1", // Ogni lunedì alle 6:00 UTC
};
