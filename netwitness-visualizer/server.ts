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

  app.post("/api/alerts", async (req, res) => {
    try {
      const { host, port, username, password, since } = req.body;
      
      if (!host || !username || !password) {
        return res.status(400).json({ 
          error: "Missing connection details. Please check host, username, and password." 
        });
      }

      const hostWithPort = port ? `${host}:${port}` : host;
      const httpsAgent = new https.Agent({ rejectUnauthorized: false });

      // Helper for https request
      const makeRequest = (url: string, options: any, postData?: string) => {
        return new Promise<any>((resolve, reject) => {
          const req = https.request(url, { ...options, agent: httpsAgent }, (response) => {
            let data = '';
            response.on('data', (chunk) => { data += chunk; });
            response.on('end', () => {
              if (response.statusCode && response.statusCode >= 400) {
                reject({ status: response.statusCode, data });
              } else {
                try {
                  resolve(JSON.parse(data));
                } catch (e) {
                  resolve(data);
                }
              }
            });
          });
          req.on('error', reject);
          if (postData) {
            req.write(postData);
          }
          req.end();
        });
      };

      // 1. Authenticate to get token
      const authUrl = `https://${hostWithPort}/rest/api/auth/userpass?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;
      
      let token;
      try {
        const authData = await makeRequest(authUrl, {
          method: 'POST',
          headers: {
            'Accept': 'application/json;charset=UTF-8',
            'Content-Type': 'application/x-www-form-urlencoded; charset=ISO-8859-1'
          }
        });
        token = authData.accessToken;
      } catch (err: any) {
        return res.status(err.status || 500).json({ error: "Authentication failed", details: err.data || err.message });
      }

      if (!token) {
        return res.status(401).json({ error: "Failed to retrieve access token" });
      }

      // 2. Fetch alerts
      const sinceParam = since ? `?since=${encodeURIComponent(since)}` : '';
      const alertsUrl = `https://${hostWithPort}/rest/api/alerts${sinceParam}`;

      try {
        const alertsData = await makeRequest(alertsUrl, {
          method: 'GET',
          headers: {
            'NetWitness-Token': token,
            'Accept': 'application/json'
          }
        });
        res.json(alertsData);
      } catch (err: any) {
        return res.status(err.status || 500).json({ error: "Failed to fetch alerts", details: err.data || err.message });
      }

    } catch (error: any) {
      console.error("Error fetching alerts:", error);
      res.status(500).json({ error: "Internal server error", details: error.message });
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

      // Input Validation & Sanitization
      if (typeof host !== 'string' || typeof port !== 'number' && isNaN(Number(port))) {
        return res.status(400).json({ error: "Invalid host or port format." });
      }

      if (typeof query !== 'string') {
        return res.status(400).json({ error: "Query must be a string." });
      }

      // Basic SSRF Protection: Prevent querying local loopback addresses in production
      const forbiddenHosts = ['localhost', '127.0.0.1', '0.0.0.0', '::1'];
      if (process.env.NODE_ENV === 'production' && forbiddenHosts.includes(host.toLowerCase())) {
        return res.status(403).json({ error: "Querying local addresses is forbidden." });
      }

      // Sanitize query to remove control characters that could cause issues
      const sanitizedQuery = query.replace(/[\x00-\x1F\x7F]/g, '');
      const parsedSize = parseInt(String(size), 10) || 100;

      const url = `https://${host}:${port}/sdk?msg=query&force-content-type=application/json&size=${parsedSize}&query=${encodeURIComponent(sanitizedQuery)}`;
      
      // In production, this should be true to prevent Man-in-the-Middle attacks
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

      const makeRequest = () => new Promise<void>((resolve, reject) => {
        const req = https.request(url, requestOptions, (response) => {
          if (response.statusCode && response.statusCode >= 400) {
            let data = '';
            response.on('data', (chunk) => { data += chunk; });
            response.on('end', () => {
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
            });
            return;
          }

          res.status(response.statusCode || 200);
          res.setHeader('Content-Type', 'application/json');
          
          let totalLength = 0;
          response.on('data', (chunk) => {
            totalLength += chunk.length;
            if (totalLength > MAX_SIZE) {
              req.destroy();
              res.end();
              reject({ message: "Response too large (limit 500MB)", code: 'SIZE_EXCEEDED' });
              return;
            }
          });

          response.pipe(res);
          response.on('end', () => resolve());
          response.on('error', (err) => reject({ message: "Failed to stream NetWitness response", detail: err.message }));
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

      await makeRequest();
    } catch (error: any) {
      if (!res.headersSent) {
        console.error("Error querying NetWitness:", error.message || error);
        res.status(error.status || 500).json({ 
          error: error.message || "Failed to query NetWitness", 
          details: error.detail || error.message,
          code: error.code
        });
      }
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
