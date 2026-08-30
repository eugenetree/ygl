ifneq (,$(wildcard .env))
  include .env
  export
endif

# ── Stack ───────────────────────────────────────────────────────────────────
up:
	docker compose up -d

down:
	docker compose down

# Rebuild all containers (useful after dependency or migration changes)
rebuild:
	docker compose down
	docker compose build --no-cache
	docker compose up -d

# Rebuild all containers and wipe volumes (fresh DB)
rebuild-fresh:
	docker compose down -v
	docker compose build --no-cache
	docker compose up -d

app-connect:
	docker exec -it bot sh

# Run commands inside app container
# make run cmd="npm run find-captions -- your search query"
run:
	docker exec bot $(cmd)

# Quick search captions
# make search query="your search query"
search:
	docker exec bot npm run find-captions -- $(query)

# ── Schema (throwaway migrator container) ───────────────────────────────────
# These run the migrator service as a one-off container rather than exec-ing
# into an application service. That means they work while the app services are
# stopped or crash-looping (which is exactly when a rollback is needed), they
# honour the migrator's database-health dependency, and they execute the same
# compiled output the deploy-time migration run uses — so a manual run and an
# automatic one cannot disagree about the migration table.

db-migrate:
	docker compose run --rm migrator node dist/src/db/scripts/run-migrations.js

db-rollback:
	docker compose run --rm migrator node dist/src/db/scripts/rollback-migration.js

# Rebuild DB from scratch for the current branch: drop → migrate → seed dev fixtures
# db-up first: db-reset exec's into the database container, so unlike the two
# targets above it cannot start the database itself.
db-fresh: db-up db-reset db-migrate
	docker compose run --rm migrator node dist/src/db/scripts/seed-dev.js

# ── Postgres itself (running db container) ──────────────────────────────────
# These operate on the server rather than on the schema, so they exec into the
# database container — the one service with an always-restart policy.

# Start the database on its own and wait for it to pass its healthcheck
db-up:
	docker compose up -d --wait db

db-connect:
	docker exec -it db psql -U admin -d saythis

# Completely reset the database (drop and recreate)
db-reset:
	@echo "Dropping and recreating database..."
	docker exec db psql -U admin -d postgres -c "DROP DATABASE IF EXISTS \"saythis\" WITH (FORCE);"
	docker exec db psql -U admin -d postgres -c "CREATE DATABASE \"saythis\""
	@echo "Database reset complete. Run 'make db-migrate' to recreate tables."

db-export:
	mkdir -p db/dump
	docker exec -t db pg_dump -U admin -d saythis > db/dump/dump-$$(date +%Y%m%d%H%M%S).sql

file ?= dump.sql

# Load a SQL dump into the database: make db-load-dump file=dump.sql
db-load-dump:
	docker exec -i db pg_restore -U admin -d saythis < "$(file)"

# Reset DB and load a dump: make db-restore file=dump.sql
db-restore:
	@echo "Dropping and recreating database..."
	docker exec db psql -U admin -d postgres -c "DROP DATABASE IF EXISTS \"saythis\" WITH (FORCE);"
	docker exec db psql -U admin -d postgres -c "CREATE DATABASE \"saythis\""
	@echo "Loading dump from $(file)..."
	docker exec -i db pg_restore -U admin -d saythis < "$(file)"
	@echo "Done."

# ── Codegen (host) ──────────────────────────────────────────────────────────
# Deliberately not containerised: this writes a template migration file and
# never opens a database connection, so its output has to land in the working
# tree where it will be edited and committed.

# make db-create-migration name="table_name"
db-create-migration:
	npm run db:migration:create-new -- $(name)

# ── Ops ─────────────────────────────────────────────────────────────────────
ssh-logs:
	mkdir -p _debug/logs
	scp -r root@178.105.4.165:/opt/ygl/logs/. _debug/logs/

# Download the latest file from R2 bucket folder into db/dump/
# Requires: R2_* env vars set (see .env.example)
r2-download-latest:
	@mkdir -p db/dump && \
	LATEST=$$(docker run --rm \
		-e AWS_ACCESS_KEY_ID=$(R2_ACCESS_KEY_ID) \
		-e AWS_SECRET_ACCESS_KEY=$(R2_SECRET_ACCESS_KEY) \
		amazon/aws-cli s3 ls s3://saythis/saythis-saythis-trr9pp_db/ \
		--endpoint-url $(R2_ENDPOINT) | sort | tail -1 | awk '{print $$4}') && \
	echo "Downloading $$LATEST..." && \
	docker run --rm \
		-e AWS_ACCESS_KEY_ID=$(R2_ACCESS_KEY_ID) \
		-e AWS_SECRET_ACCESS_KEY=$(R2_SECRET_ACCESS_KEY) \
		-v $(PWD)/db/dump:/data \
		amazon/aws-cli s3 cp s3://saythis/saythis-saythis-trr9pp_db/$$LATEST /data/$$LATEST \
		--endpoint-url $(R2_ENDPOINT) && \
	echo "Saved to db/dump/$$LATEST"
