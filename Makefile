up:
	docker compose up -d

down:
	docker compose down

app-connect:
	docker exec -it bot sh

db-migrate:
	docker exec bot npm run db:migration:run

db-connect:
	docker exec -it db psql -U admin -d saythis

db-rollback:
	npm run db:migration:rollback

db-export:
	mkdir -p db/dump
	docker exec -t db pg_dump -U admin -d saythis > db/dump/dump-$$(date +%Y%m%d%H%M%S).sql

# Load a SQL dump into the database: make db-load-dump file=dump.sql
db-load-dump:
	docker exec -i db pg_restore -U admin -d saythis < $(file)

file ?= dump.sql

# Reset DB and load a dump: make db-restore file=dump.sql
db-restore:
	@echo "Dropping and recreating database..."
	docker exec db psql -U admin -d postgres -c "DROP DATABASE IF EXISTS \"saythis\" WITH (FORCE);"
	docker exec db psql -U admin -d postgres -c "CREATE DATABASE \"saythis\""
	@echo "Loading dump from $(file)..."
	docker exec -i db pg_restore -U admin -d saythis < $(file)
	@echo "Done."

# make db-create-migration name="table_name"
db-create-migration:
	npm run db:migration:create-new -- $(name)

# Completely reset the database (drop and recreate)
db-reset:
	@echo "Dropping and recreating database..."
	docker exec db psql -U admin -d postgres -c "DROP DATABASE IF EXISTS \"saythis\" WITH (FORCE);"
	docker exec db psql -U admin -d postgres -c "CREATE DATABASE \"saythis\""
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