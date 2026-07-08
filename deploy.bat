@echo off
echo.
echo === VNin1 Deploy ===
echo.

cd /d "C:\Users\phong\OneDrive\Desktop\Astro page"

:: Pull latest from GitHub first
echo Syncing with GitHub...
git fetch origin
git merge origin/main --no-edit

:: Stage everything EXCEPT feed.json (which is managed by GitHub Actions only)
git add -- . ":(exclude)src/data/feed.json"

:: Check if there is anything to commit
git diff --cached --quiet
if %errorlevel%==0 (
  echo No code changes to deploy.
  pause
  exit /b 0
)

:: Show what changed
echo Changed files:
git diff --cached --name-only
echo.

:: Ask for a commit message
set /p MSG=Commit message (or press Enter for default): 
if "%MSG%"=="" set MSG=Update site content and code

:: Commit and push
git commit -m "%MSG%"
git push

echo.
echo Done. Vercel will redeploy automatically in 1-2 minutes.
echo Visit: https://vnin1.vercel.app
echo.
pause
