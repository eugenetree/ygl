import fs from "fs";
import path from "path";

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

const migrationsDir = path.join(__dirname, "..", "migrations");
const filePath = path.join(migrationsDir, `${Date.now()}-${migrationName}.ts`);

fs.writeFileSync(filePath, fileContent.trim());
