import express from "express";
import { createServer as createViteServer } from "vite";
import axios from "axios";
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

      const axiosConfig: any = { httpsAgent };
      
      if (username && password) {
        axiosConfig.auth = {
          username,
          password
        };
      }

      const response = await axios.get(url, axiosConfig);
      res.json(response.data);
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
