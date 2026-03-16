import { getStore } from "@netlify/blobs";

export default async function handler(req) {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
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
```

4. **"Commit changes..."** → **"Commit changes"**

Aspetta il deploy verde, poi prima riesegui lo scraper (**Logs → Functions → update-prices → "Run now"**), aspetta che finisca, e poi riprova ad aprire:
```
https://soldibuoni.it/.netlify/functions/get-prices
