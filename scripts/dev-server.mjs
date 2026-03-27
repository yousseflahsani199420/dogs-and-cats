import http from "node:http";
import { createReadStream, existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || "127.0.0.1";

const mimeTypes = {
  ".avif": "image/avif",
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".webp": "image/webp",
  ".xml": "application/xml; charset=utf-8",
};

function safePathFromUrl(urlString = "/") {
  const url = new URL(urlString, `http://${host}:${port}`);
  const pathname = decodeURIComponent(url.pathname);
  const normalized = path.normalize(pathname).replace(/^(\.\.[/\\])+/, "");
  const candidate = path.join(rootDir, normalized);
  if (!candidate.startsWith(rootDir)) {
    return rootDir;
  }
  return candidate;
}

async function resolveFilePath(urlString) {
  const requestedPath = safePathFromUrl(urlString);
  let target = requestedPath;

  if (existsSync(target)) {
    const details = await stat(target);
    if (details.isDirectory()) {
      const nestedIndex = path.join(target, "index.html");
      if (existsSync(nestedIndex)) {
        return nestedIndex;
      }
    } else {
      return target;
    }
  }

  const withIndex = path.join(requestedPath, "index.html");
  if (existsSync(withIndex)) {
    return withIndex;
  }

  const fallback = path.join(rootDir, "404.html");
  return existsSync(fallback) ? fallback : null;
}

function writeHeaders(response, filePath, statusCode = 200) {
  const extension = path.extname(filePath).toLowerCase();
  const contentType = mimeTypes[extension] || "application/octet-stream";
  response.writeHead(statusCode, {
    "Cache-Control": "no-store, no-cache, must-revalidate",
    "Content-Type": contentType,
  });
}

const server = http.createServer(async (request, response) => {
  try {
    const filePath = await resolveFilePath(request.url || "/");
    if (!filePath) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }

    const is404 = path.basename(filePath) === "404.html" && !existsSync(safePathFromUrl(request.url || "/"));
    writeHeaders(response, filePath, is404 ? 404 : 200);

    if (request.method === "HEAD") {
      response.end();
      return;
    }

    createReadStream(filePath).pipe(response);
  } catch (error) {
    response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    response.end(`Server error: ${error.message}`);
  }
});

server.listen(port, host, () => {
  console.log(`PetZone preview server running at http://${host}:${port}`);
});
