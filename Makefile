up:
	docker compose up -d

down:
	docker compose down

app-connect:
	docker exec -it saythis-app sh

db-migrate:
	docker exec saythis-app npm run db:migration:run

db-connect:
	docker exec -it saythis-db psql -U admin -d saythis

db-rollback:
	npm run db:migration:rollback

# make db-create-migration name="table_name"
db-create-migration:
	npm run db:migration:create-new -- $(name)

# Completely reset the database (drop and recreate)
db-reset:
	@echo "Dropping and recreating database..."
	docker exec saythis-db psql -U admin -d postgres -c "DROP DATABASE IF EXISTS \"saythis\" WITH (FORCE);"
	docker exec saythis-db psql -U admin -d postgres -c "CREATE DATABASE \"saythis\""
	@echo "Database reset complete. Run 'make db-migrate' to recreate tables."

# Run commands inside app container
# make run cmd="npm run find-captions -- your search query"
run:
	docker exec saythis-app $(cmd)

# Quick search captions
# make search query="your search query"
search:
	docker exec saythis-app npm run find-captions -- $(query)

# Rebuild app container (useful after dependency changes)
rebuild:
	docker compose down
	docker compose build --no-cache app
	docker compose up -d