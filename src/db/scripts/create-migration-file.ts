import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const fileContent = `
import { Kysely } from 'kysely'

export async function up(db: Kysely<any>): Promise<void> {
  // Migration code
}

export async function down(db: Kysely<any>): Promise<void> {
  // Migration code
}
`;

const migrationName = process.argv[2];

if (!migrationName) {
  console.error("Please provide a migration name");
  process.exit(1);
}

// Node v18 compatible way to get __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const migrationsDir = path.join(__dirname, "..", "migrations");
const filePath = path.join(migrationsDir, `${Date.now()}-${migrationName}.ts`);

fs.writeFileSync(filePath, fileContent.trim());
console.log(`✅ Created migration: ${path.basename(filePath)}`);