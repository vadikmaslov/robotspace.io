@echo off
REM ============================================================ 
REM RobotSpace — Quick Setup Script (Windows)
REM Run from robotspace-app/ directory
REM ============================================================

echo --- Step 1: Installing dependencies ---
call pnpm install

echo --- Step 2: Generating Prisma client ---
cd packages\db && call npx prisma generate && cd ..\..

echo --- Step 3: Starting PostgreSQL ---
call docker compose up postgres -d

echo Waiting for PostgreSQL to be ready...
:waitloop
docker exec robotspace-postgres pg_isready -U robotspace -d robotspace_dev >nul 2>&1
if %errorlevel% neq 0 (
    timeout /t 2 /nobreak >nul
    goto waitloop
)
echo PostgreSQL is ready!

echo --- Step 4: Running schema migrations ---
cd packages\db && call pnpm db:deploy && cd ..\..

echo --- Step 5: Seeding taxonomy + settings ---
cd packages\db && call npx tsx src\seed.ts && cd ..\..

echo --- Step 6: Starting dev server ---
echo.
echo Setup complete! Opening in browser at http://localhost:3000
echo.
cd apps\web && call pnpm dev
