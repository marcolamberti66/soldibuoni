// ═══════════════════════════════════════════════════════════════════
// NETLIFY FUNCTION — Serve cached prices from Blobs
// Endpoint: /.netlify/functions/get-prices
// ═══════════════════════════════════════════════════════════════════

import { getStore } from "@netlify/blobs";

export default async function handler(req) {
  try {
    const store = getStore("prices");
    const data = await store.get("latest", { type: "json" });

    if (!data) {
      return new Response(
        JSON.stringify({ error: "no_data", message: "Nessun dato disponibile. Esegui prima update-prices." }),
        {
          status: 404,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "public, max-age=3600", // 1h cache
          },
        }
      );
    }

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "server_error", message: err.message }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }
}
