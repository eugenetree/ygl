import { injectable, inject } from "inversify";
import path from "path";
import fs from "fs";
import AdmZip from "adm-zip";

import { Logger } from "../../_common/logger/logger.js";
import { Failure, Success } from "../../../types/index.js";

type ExportLogsError = 
  | { type: "LOGS_DIR_MISSING"; message: string }
  | { type: "LOGS_DIR_EMPTY"; message: string }
  | { type: "EXPORT_FAILED"; message: string; error: unknown };

@injectable()
export class ExportLogsUseCase {
  private readonly logger: Logger;

  constructor(@inject(Logger) logger: Logger) {
    this.logger = logger.child({ context: ExportLogsUseCase.name });
  }

  async execute() {
    const logsDir = path.resolve(process.cwd(), "logs");
    const zipPath = path.resolve(process.cwd(), `logs_${Date.now()}.zip`);

    try {
      if (!fs.existsSync(logsDir)) {
        return Failure({
          type: "LOGS_DIR_MISSING" as const,
          message: "Logs directory does not exist.",
        });
      }

      const logFiles = fs.readdirSync(logsDir);
      if (logFiles.length === 0) {
        return Failure({
          type: "LOGS_DIR_EMPTY" as const,
          message: "Logs directory is empty.",
        });
      }

      const zip = new AdmZip();
      zip.addLocalFolder(logsDir);
      zip.writeZip(zipPath);

      this.logger.info(`Successfully created logs zip at ${zipPath}`);
      return Success({ zipPath });
    } catch (error) {
      this.logger.error({ message: "Failed to create logs zip", error });
      return Failure({
        type: "EXPORT_FAILED" as const,
        message: "Failed to create logs archive.",
        error,
      });
    }
  }
}
