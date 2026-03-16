import express from "express";
import { createServer as createViteServer } from "vite";
import https from "https";
import fs from "fs";
import path from "path";
import Parser from "rss-parser";

const parser = new Parser({
  customFields: {
    item: ['description', 'content', 'content:encoded', 'pubDate'],
  }
});

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API routes
  app.get("/api/rss-feeds", (req, res) => {
    try {
      const feedsPath = path.join(process.cwd(), "rss-feeds.json");
      if (fs.existsSync(feedsPath)) {
        const feedsData = fs.readFileSync(feedsPath, "utf-8");
        res.json(JSON.parse(feedsData));
      } else {
        res.json([]);
      }
    } catch (error: any) {
      res.status(500).json({ error: "Failed to read RSS feeds config", details: error.message });
    }
  });

  app.post("/api/rss", async (req, res) => {
    try {
      const { url } = req.body;
      if (!url) {
        return res.status(400).json({ error: "Missing URL parameter" });
      }

      const feed = await parser.parseURL(url);
      res.json(feed);
    } catch (error: any) {
      console.error(`Error fetching RSS feed ${req.body.url}:`, error.message);
      res.status(500).json({ error: "Failed to fetch RSS feed", details: error.message });
    }
  });

  app.post("/api/query", async (req, res) => {
    try {
      const { host, port, query, size, username, password } = req.body;
      
      if (!host || !port || !username || !password) {
        return res.status(400).json({ 
          error: "Missing connection details. Please check host, port, username, and password in the Sidebar." 
        });
      }

      const url = `https://${host}:${port}/sdk?msg=query&force-content-type=application/json&size=${size || 100}&query=${encodeURIComponent(query)}`;
      
      // Ignore self-signed certificates for NetWitness API
      const httpsAgent = new https.Agent({
        rejectUnauthorized: false,
      });

      const headers: any = {
        'Accept': 'application/json'
      };
      headers['Authorization'] = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');

      // Set a reasonable timeout (60 seconds)
      const TIMEOUT = 60000;
      // Limit response size to 500MB to prevent OOM
      const MAX_SIZE = 500 * 1024 * 1024;

      const requestOptions = {
        method: 'GET',
        headers,
        agent: httpsAgent,
        timeout: TIMEOUT
      };

      const makeRequest = () => new Promise((resolve, reject) => {
        const req = https.request(url, requestOptions, (response) => {
          let data = '';
          let totalLength = 0;

          response.on('data', (chunk) => {
            totalLength += chunk.length;
            if (totalLength > MAX_SIZE) {
              req.destroy();
              reject({ message: "Response too large (limit 500MB)", code: 'SIZE_EXCEEDED' });
              return;
            }
            data += chunk;
          });
          response.on('end', () => {
            try {
              if (response.statusCode && response.statusCode >= 400) {
                let errorDetail = data;
                try {
                  const parsed = JSON.parse(data);
                  errorDetail = parsed.message || data;
                } catch (e) {}
                reject({ 
                  message: `NetWitness API Error (${response.statusCode}): ${errorDetail}`, 
                  status: response.statusCode,
                  detail: errorDetail
                });
              } else {
                resolve(JSON.parse(data));
              }
            } catch (e) {
              reject({ message: "Failed to parse NetWitness response", detail: e instanceof Error ? e.message : String(e) });
            }
          });
        });

        req.on('timeout', () => {
          req.destroy();
          reject({ message: `Request timed out after ${TIMEOUT}ms`, code: 'ETIMEDOUT' });
        });

        req.on('error', (err: any) => {
          let message = "Failed to connect to NetWitness.";
          if (err.code === 'ECONNREFUSED') {
            message = `Connection refused at ${host}:${port}. Is the NetWitness SDK service running?`;
          } else if (err.code === 'ENOTFOUND') {
            message = `Host ${host} not found. Please check the hostname or IP address.`;
          }
          reject({ message, detail: err.message, code: err.code });
        });
        req.end();
      });

      const data = await makeRequest();
      res.json(data);
    } catch (error: any) {
      console.error("Error querying NetWitness:", error.message || error);
      res.status(error.status || 500).json({ 
        error: error.message || "Failed to query NetWitness", 
        details: error.detail || error.message,
        code: error.code
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
