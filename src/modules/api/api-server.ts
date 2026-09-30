import http from "node:http";
import { injectable } from "inversify";

import { Logger } from "../_common/logger/logger.js";
import { FindCaptionsUseCase } from "../captions-search/find-captions.use-case.js";

@injectable()
export class ApiServer {
  constructor(
    private readonly logger: Logger,
    private readonly findCaptionsUseCase: FindCaptionsUseCase,
  ) {
    this.logger.setContext(ApiServer.name);
  }

  start(port = 3001): void {
    const server = http.createServer(async (req, res) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
      res.setHeader("Content-Type", "application/json");

      if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
      }

      const url = new URL(req.url!, `http://localhost:${port}`);

      if (req.method === "GET" && url.pathname === "/api/search") {
        const q = url.searchParams.get("q");
        if (!q) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: "Missing query parameter q" }));
          return;
        }

        const offset = Number(url.searchParams.get("offset") ?? 0);
        const limit = Number(url.searchParams.get("limit") ?? 20);
        if (
          !Number.isInteger(offset) ||
          !Number.isInteger(limit) ||
          offset < 0 ||
          limit < 1 ||
          offset + limit > 10000
        ) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: "Invalid offset or limit" }));
          return;
        }

        try {
          const result = await this.findCaptionsUseCase.execute(q, {
            offset,
            limit,
          });
          if (!result.ok) {
            this.logger.error({
              message: "Search failed",
              error: result.error.error,
            });
            res.writeHead(503);
            res.end(JSON.stringify({ error: "Search is unavailable" }));
            return;
          }
          res.writeHead(200);
          res.end(JSON.stringify(result.value));
        } catch (err) {
          this.logger.error({ message: "Search failed", error: err });
          res.writeHead(500);
          res.end(JSON.stringify({ error: "Search failed" }));
        }
        return;
      }

      res.writeHead(404);
      res.end(JSON.stringify({ error: "Not found" }));
    });

    server.listen(port, () => {
      this.logger.info(`API server listening on port ${port}`);
    });
  }
}
