import express from "express";
import { createServer as createViteServer } from "vite";
import https from "https";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API routes
  app.post("/api/query", async (req, res) => {
    try {
      const { host, port, query, size, username, password } = req.body;
      
      if (!host || !port || !query) {
        return res.status(400).json({ error: "Missing required parameters" });
      }

      const url = `https://${host}:${port}/sdk?msg=query&force-content-type=application/json&size=${size || 100}&query=${encodeURIComponent(query)}`;

      // Ignore self-signed certificates for NetWitness API
      const httpsAgent = new https.Agent({
        rejectUnauthorized: false,
      });

      const headers: any = {};
      if (username && password) {
        headers['Authorization'] = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');
      }

      // Use node-fetch style or native fetch if available. Since Node 18+ has native fetch,
      // but native fetch doesn't support https.Agent directly. We can use the 'https' module directly.
      
      const requestOptions = {
        method: 'GET',
        headers,
        agent: httpsAgent,
      };

      const makeRequest = () => new Promise((resolve, reject) => {
        const req = https.request(url, requestOptions, (response) => {
          let data = '';
          response.on('data', (chunk) => {
            data += chunk;
          });
          response.on('end', () => {
            try {
              if (response.statusCode && response.statusCode >= 400) {
                reject(new Error(`HTTP Error ${response.statusCode}: ${data}`));
              } else {
                resolve(JSON.parse(data));
              }
            } catch (e) {
              reject(e);
            }
          });
        });
        req.on('error', reject);
        req.end();
      });

      const data = await makeRequest();
      res.json(data);
    } catch (error: any) {
      console.error("Error querying NetWitness:", error.message);
      res.status(500).json({ 
        error: "Failed to query NetWitness", 
        details: error.message 
      });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
