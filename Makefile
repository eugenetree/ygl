ifneq (,$(wildcard .env))
  include .env
  export
endif

# Fail with the variable's name instead of passing an empty flag to the tool
guard-%:
	@test -n "$($*)" || { echo "$* is not set — see .env.example"; exit 1; }

up:
	docker compose up -d

down:
	docker compose down

app-connect:
	docker exec -it bot sh

db-migrate:
	docker exec bot npm run db:migration:run

db-connect: guard-POSTGRES_USER guard-POSTGRES_DB
	docker exec -it db psql -U $(POSTGRES_USER) -d $(POSTGRES_DB)

db-rollback:
	npm run db:migration:rollback

db-export: guard-POSTGRES_USER guard-POSTGRES_DB
	mkdir -p db/dump
	docker exec -t db pg_dump -U $(POSTGRES_USER) -d $(POSTGRES_DB) > db/dump/dump-$$(date +%Y%m%d%H%M%S).sql

# Load a SQL dump into the database: make db-load-dump file=dump.sql
db-load-dump: guard-POSTGRES_USER guard-POSTGRES_DB
	docker exec -i db pg_restore -U $(POSTGRES_USER) -d $(POSTGRES_DB) < "$(file)"

file ?= dump.sql

# Reset DB and load a dump: make db-restore file=dump.sql
db-restore: guard-POSTGRES_USER guard-POSTGRES_DB
	@echo "Dropping and recreating database..."
	docker exec db psql -U $(POSTGRES_USER) -d postgres -c "DROP DATABASE IF EXISTS \"$(POSTGRES_DB)\" WITH (FORCE);"
	docker exec db psql -U $(POSTGRES_USER) -d postgres -c "CREATE DATABASE \"$(POSTGRES_DB)\""
	@echo "Loading dump from $(file)..."
	docker exec -i db pg_restore -U $(POSTGRES_USER) -d $(POSTGRES_DB) < "$(file)"
	@echo "Done."

# make db-create-migration name="table_name"
db-create-migration:
	npm run db:migration:create-new -- $(name)

# Rebuild DB from scratch for the current branch: drop → migrate → seed dev fixtures
db-fresh: db-reset db-migrate
	docker exec bot npm run db:seed:dev

# Completely reset the database (drop and recreate)
db-reset: guard-POSTGRES_USER guard-POSTGRES_DB
	@echo "Dropping and recreating database..."
	docker exec db psql -U $(POSTGRES_USER) -d postgres -c "DROP DATABASE IF EXISTS \"$(POSTGRES_DB)\" WITH (FORCE);"
	docker exec db psql -U $(POSTGRES_USER) -d postgres -c "CREATE DATABASE \"$(POSTGRES_DB)\""
	@echo "Database reset complete. Run 'make db-migrate' to recreate tables."

# Run commands inside app container
# make run cmd="npm run find-captions -- your search query"
run:
	docker exec bot $(cmd)

# Quick search captions
# make search query="your search query"
search:
	docker exec bot npm run find-captions -- $(query)

ssh-logs:
	mkdir -p _debug/logs
	scp -r root@178.105.4.165:/opt/ygl/logs/. _debug/logs/

# Rebuild all containers (useful after dependency or migration changes)
rebuild:
	docker compose down
	docker compose build --no-cache
	docker compose up -d

# Download the latest file from R2 bucket folder into db/dump/
# Requires: R2_* env vars set (see .env.example)
r2-download-latest: guard-R2_BUCKET guard-R2_FOLDER guard-R2_ENDPOINT guard-R2_ACCESS_KEY_ID guard-R2_SECRET_ACCESS_KEY
	@mkdir -p db/dump && \
	LATEST=$$(docker run --rm \
		-e AWS_ACCESS_KEY_ID=$(R2_ACCESS_KEY_ID) \
		-e AWS_SECRET_ACCESS_KEY=$(R2_SECRET_ACCESS_KEY) \
		amazon/aws-cli s3 ls s3://$(R2_BUCKET)/$(R2_FOLDER)/ \
		--endpoint-url $(R2_ENDPOINT) | sort | tail -1 | awk '{print $$4}') && \
	echo "Downloading $$LATEST..." && \
	docker run --rm \
		-e AWS_ACCESS_KEY_ID=$(R2_ACCESS_KEY_ID) \
		-e AWS_SECRET_ACCESS_KEY=$(R2_SECRET_ACCESS_KEY) \
		-v $(PWD)/db/dump:/data \
		amazon/aws-cli s3 cp s3://$(R2_BUCKET)/$(R2_FOLDER)/$$LATEST /data/$$LATEST \
		--endpoint-url $(R2_ENDPOINT) && \
	echo "Saved to db/dump/$$LATEST"

# Rebuild all containers and wipe volumes (fresh DB)
rebuild-fresh:
	docker compose down -v
	docker compose build --no-cache
	docker compose up -d