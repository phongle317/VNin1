@echo off
echo.
echo === VNin1 Deploy ===
echo.

cd /d "C:\Users\phong\OneDrive\Desktop\Astro page"

:: Check if there is anything to commit
git diff --quiet && git diff --cached --quiet
if %errorlevel%==0 (
  echo No changes to deploy.
  pause
  exit /b 0
)

:: Show what changed
echo Changed files:
git diff --name-only
git diff --cached --name-only
echo.

:: Ask for a commit message
set /p MSG=Commit message (or press Enter for default): 
if "%MSG%"=="" set MSG=Update site content and code

:: Stage, commit, push
git add .
git commit -m "%MSG%"
git push

echo.
echo Done. Vercel will redeploy automatically in 1-2 minutes.
echo Visit: https://vnin1.vercel.app
echo.
pause
