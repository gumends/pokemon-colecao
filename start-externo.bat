@echo off
cd /d "%~dp0"
echo.
echo ========================================
echo  PokeColecao - acesso externo (TCP 8611)
echo ========================================
echo.
echo 1) Suba a API .NET em outra janela:
echo    cd ..\pokemon-colecao-api
echo    dotnet run --launch-profile http
echo.
echo 2) Build + site na 8611...
call npm run build
if errorlevel 1 (
  echo Build falhou.
  pause
  exit /b 1
)
echo.
echo Site: http://0.0.0.0:8611  (proxy /backend -^> API 5080)
echo Deixe esta janela aberta.
echo.
call npm run start:lan
pause
