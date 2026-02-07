up:
	docker compose up -d

down:
	docker compose down

app-connect:
	docker exec -it app sh

db-migrate:
	docker exec app npm run db:migration:run

db-connect:
	docker exec -it db psql -U admin -d ygl-pg

db-rollback:
	npm run db:migration:rollback

# make db-create-migration name="table_name"
db-create-migration:
	npm run db:migration:create-new -- $(name)

# Completely reset the database (drop and recreate)
db-reset:
	@echo "Dropping and recreating database..."
	docker exec db psql -U admin -d postgres -c "DROP DATABASE IF EXISTS \"ygl-pg\" WITH (FORCE);"
	docker exec db psql -U admin -d postgres -c "CREATE DATABASE \"ygl-pg\""
	@echo "Database reset complete. Run 'make db-migrate' to recreate tables."