// Netlify Scheduled Function: controlla scadenze auto e invia promemoria
// Gira ogni giorno alle 8:00 AM (UTC), cioè 9:00 o 10:00 ora italiana

export default async () => {
  const API_KEY = process.env.BREVO_API_KEY;
  if (!API_KEY) {
    console.error("BREVO_API_KEY non configurata");
    return;
  }

  const SENDER_EMAIL = process.env.SENDER_EMAIL || "noreply@soldibuoni.it";
  const SENDER_NAME = "Soldi Buoni";
  const CAR_LIST_ID = parseInt(process.env.BREVO_CAR_LIST_ID || "3");
  const DAYS_BEFORE = 7; // Invia promemoria 7 giorni prima

  const headers = {
    "api-key": API_KEY,
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  // Definizione scadenze con messaggi personalizzati
  const SCADENZE_CONFIG = [
    {
      attribute: "SCADENZA_BOLLO",
      label: "Bollo Auto",
      icon: "💳",
      subject: "⚠️ Il tuo bollo auto scade tra una settimana!",
      color: "#F59E0B",
      cosa_fare: `
        <li style="margin-bottom: 8px;">Paga tramite <strong>PagoPA</strong>, ACI, tabaccai abilitati o home banking</li>
        <li style="margin-bottom: 8px;">Se paghi entro 15 giorni dalla scadenza, la sanzione è solo dello 0.1% per giorno</li>
        <li style="margin-bottom: 8px;">Dopo 30 giorni la sanzione sale all'1.5%, dopo un anno al 3.75%</li>
        <li>Conserva la ricevuta di pagamento per almeno 3 anni</li>
      `,
    },
    {
      attribute: "SCADENZA_REVISIONE",
      label: "Revisione Veicolo",
      icon: "🔍",
      subject: "⚠️ La revisione della tua auto scade tra una settimana!",
      color: "#EF4444",
      cosa_fare: `
        <li style="margin-bottom: 8px;">Prenota subito presso un centro revisioni autorizzato o la Motorizzazione</li>
        <li style="margin-bottom: 8px;">Costo: <strong>45€</strong> (Motorizzazione) o <strong>66-79€</strong> (centri autorizzati)</li>
        <li style="margin-bottom: 8px;">Circolare con revisione scaduta = multa da <strong>173€ a 694€</strong></li>
        <li>Porta con te libretto di circolazione e certificato assicurativo</li>
      `,
    },
    {
      attribute: "SCADENZA_TAGLIANDO",
      label: "Tagliando",
      icon: "🔧",
      subject: "🔧 È ora di fare il tagliando alla tua auto",
      color: "#3B82F6",
      cosa_fare: `
        <li style="margin-bottom: 8px;">Chiedi <strong>almeno 3 preventivi</strong> tra officine indipendenti e concessionaria</li>
        <li style="margin-bottom: 8px;">Le officine indipendenti costano il 30-50% in meno per lo stesso intervento</li>
        <li style="margin-bottom: 8px;">Il tagliando regolare preserva il valore dell'auto (+10-15% in rivendita)</li>
        <li>Non sei obbligato a farlo dal concessionario per mantenere la garanzia</li>
      `,
    },
    {
      attribute: "SCADENZA_GOMME_INV",
      label: "Cambio Gomme Invernali",
      icon: "🛞",
      subject: "🛞 Tra una settimana scatta l'obbligo gomme invernali",
      color: "#8B5CF6",
      cosa_fare: `
        <li style="margin-bottom: 8px;">Dal <strong>15 novembre</strong> è obbligatorio avere pneumatici invernali o catene a bordo</li>
        <li style="margin-bottom: 8px;">Prenota il cambio gomme in anticipo: a novembre le officine sono piene</li>
        <li style="margin-bottom: 8px;">Verifica lo spessore del battistrada: minimo legale 1.6mm, consigliato 3mm</li>
        <li>Multa senza gomme invernali o catene: da <strong>87€ a 344€</strong></li>
      `,
    },
    {
      attribute: "SCADENZA_GOMME_EST",
      label: "Cambio Gomme Estive",
      icon: "☀️",
      subject: "☀️ Tra una settimana finisce l'obbligo gomme invernali",
      color: "#10B981",
      cosa_fare: `
        <li style="margin-bottom: 8px;">Dal <strong>15 aprile</strong> puoi tornare alle gomme estive (hai tempo fino al 15 maggio)</li>
        <li style="margin-bottom: 8px;">Le gomme invernali in estate consumano di più e frenano peggio sull'asciutto</li>
        <li style="margin-bottom: 8px;">Controlla l'usura delle gomme estive prima di rimontarle</li>
        <li>Se usi gomme 4 stagioni (M+S con simbolo alpino), non devi cambiarle</li>
      `,
    },
  ];

  try {
    // Recupera tutti i contatti della lista Promemoria Auto
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
      } else {
        hasMore = false;
      }
    }

    console.log(`Trovati ${allContacts.length} contatti nella lista Promemoria Auto`);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const targetDate = new Date(today);
    targetDate.setDate(targetDate.getDate() + DAYS_BEFORE);

    let emailsSent = 0;

    for (const contact of allContacts) {
      const email = contact.email;
      const nome = contact.attributes?.NOME || "Automobilista";
      const targa = contact.attributes?.TARGA || "";

      for (const scadenza of SCADENZE_CONFIG) {
        const dateValue = contact.attributes?.[scadenza.attribute];
        if (!dateValue) continue;

        const scadenzaDate = new Date(dateValue);
        scadenzaDate.setHours(0, 0, 0, 0);

        // Controlla se la scadenza è esattamente tra DAYS_BEFORE giorni
        const diffDays = Math.round((scadenzaDate - today) / 86400000);
        
        if (diffDays === DAYS_BEFORE) {
          console.log(`Invio promemoria ${scadenza.label} a ${email} (scade il ${dateValue})`);

          const formattedDate = scadenzaDate.toLocaleDateString("it-IT", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
          });

          await fetch("https://api.brevo.com/v3/smtp/email", {
            method: "POST",
            headers,
            body: JSON.stringify({
              sender: { name: SENDER_NAME, email: SENDER_EMAIL },
              to: [{ email, name: nome }],
              subject: scadenza.subject + (targa ? ` — ${targa}` : ""),
              htmlContent: `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family: Arial, sans-serif; background: #f8fafc; padding: 40px 20px;">
  <div style="max-width: 560px; margin: 0 auto; background: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.06);">
    <div style="background: ${scadenza.color}; padding: 32px; text-align: center;">
      <div style="font-size: 48px; margin-bottom: 8px;">${scadenza.icon}</div>
      <h1 style="color: #fff; font-size: 22px; margin: 0;">${scadenza.label}</h1>
      <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0; font-size: 14px;">Scadenza tra 7 giorni</p>
    </div>
    <div style="padding: 32px;">
      <h2 style="color: #0f172a; font-size: 18px; margin: 0 0 16px;">Ciao ${nome}!</h2>
      <p style="color: #475569; font-size: 15px; line-height: 1.7;">
        Ti ricordiamo che la scadenza per <strong>${scadenza.label.toLowerCase()}</strong>${targa ? ` della tua auto <strong>${targa}</strong>` : ""} 
        è prevista per:
      </p>
      <div style="background: #f8fafc; border-radius: 12px; padding: 20px; margin: 20px 0; text-align: center; border: 2px solid ${scadenza.color}20;">
        <div style="font-size: 28px; font-weight: 800; color: ${scadenza.color}; margin-bottom: 4px;">${formattedDate}</div>
        <div style="font-size: 14px; color: #64748b;">Mancano 7 giorni</div>
      </div>
      
      <h3 style="color: #0f172a; font-size: 16px; margin: 24px 0 12px;">📋 Cosa fare:</h3>
      <ul style="color: #475569; font-size: 14px; line-height: 1.8; padding-left: 20px;">
        ${scadenza.cosa_fare}
      </ul>

      <div style="background: #f0fdf4; border-radius: 12px; padding: 16px; margin-top: 24px;">
        <p style="color: #166534; font-size: 13px; margin: 0;">
          💡 <strong>Consiglio:</strong> Visita <a href="https://soldibuoni.it" style="color: #059669;">soldibuoni.it</a> per 
          confrontare prezzi e trovare le offerte migliori.
        </p>
      </div>
      
      <p style="color: #94a3b8; font-size: 12px; margin-top: 24px; border-top: 1px solid #f1f5f9; padding-top: 16px;">
        Questo promemoria è stato inviato automaticamente da Soldi Buoni.<br>
        Hai registrato questo promemoria su <a href="https://soldibuoni.it" style="color: #94a3b8;">soldibuoni.it</a>.
      </p>
    </div>
  </div>
</body>
</html>`,
            }),
          });

          emailsSent++;

          // Pausa di 500ms tra ogni email per rispettare i rate limit di Brevo
          await new Promise((r) => setTimeout(r, 500));
        }
      }
    }

    console.log(`Completato. Email promemoria inviate: ${emailsSent}`);

  } catch (error) {
    console.error("Errore nel job promemoria:", error);
  }
};

// Esegui ogni giorno alle 8:00 UTC (9:00 o 10:00 ora italiana)
export const config = {
  schedule: "0 8 * * *",
};
