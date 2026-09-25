# ============================================================
# RobotSpace — Quick Setup Script
# Run this ONCE to get from clone to running dev server
# ============================================================

# 1. INSTALL DEPENDENCIES
echo "--- Step 1: Installing dependencies ---"
pnpm install

# 2. GENERATE PRISMA CLIENT
echo "--- Step 2: Generating Prisma client ---"
cd packages/db && npx prisma generate && cd ../..

# 3. START PostGreSQL (Docker)
echo "--- Step 3: Starting PostgreSQL ---"
docker compose up postgres -d

echo "Waiting for PostgreSQL to be ready..."
until docker exec robotspace-postgres pg_isready -U robotspace -d robotspace_dev > /dev/null 2>&1; do
  echo "Waiting..."
  sleep 2
done
echo "PostgreSQL is ready!"

# 4. RUN MIGRATIONS
echo "--- Step 4: Running schema migrations ---"
cd packages/db && pnpm db:deploy && cd ../..

# 5. SEED INITIAL DATA
echo "--- Step 5: Seeding taxonomy + settings ---"
cd packages/db && npx tsx src/seed.ts && cd ../..

# 6. START DEV SERVER
echo "--- Step 6: Starting dev server ---"
echo ""
echo "✅ Setup complete!"
echo ""
echo "Site:     http://localhost:3000"
echo "Admin:    http://localhost:3000/admin/login"
echo ""
cd apps/web && pnpm dev
