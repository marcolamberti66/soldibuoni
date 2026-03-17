import { getStore } from "@netlify/blobs";

export default async function handler(req) {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    // Riduciamo drasticamente la cache a 60 secondi per permettere aggiornamenti quasi in real-time
    "Cache-Control": "public, max-age=60, s-maxage=60",
  };
  try {
    const store = getStore("prices");
    const raw = await store.get("latest");

    if (!raw) {
      return new Response(
        JSON.stringify({ error: "no_data", message: "Nessun dato disponibile." }),
        { status: 404, headers }
      );
    }

    const data = typeof raw === "string" ? raw : JSON.stringify(raw);
    return new Response(data, { status: 200, headers });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "server_error", message: err.message }),
      { status: 500, headers }
    );
  }
}
