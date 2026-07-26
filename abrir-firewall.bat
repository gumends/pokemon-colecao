@echo off
:: Requer Executar como administrador
net session >nul 2>&1
if %errorLevel% neq 0 (
  echo Execute este arquivo como Administrador.
  pause
  exit /b 1
)

echo Liberando TCP 8611 no firewall do Windows (site Next.js)...
netsh advfirewall firewall delete rule name="PokeColecao TCP 8611" >nul 2>&1
netsh advfirewall firewall delete rule name="PokeColecao TCP 8211" >nul 2>&1
netsh advfirewall firewall add rule name="PokeColecao TCP 8611" dir=in action=allow protocol=TCP localport=8611

echo Liberando TCP 5080 no firewall (API .NET interna)...
netsh advfirewall firewall delete rule name="PokeColecao TCP 5080" >nul 2>&1
netsh advfirewall firewall add rule name="PokeColecao TCP 5080" dir=in action=allow protocol=TCP localport=5080

for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
  set IP=%%a
  goto :gotip
)
:gotip
set IP=%IP: =%

echo.
echo Firewall OK.
echo.
echo === Roteador (ja configurado) ===
echo   Protocolo: TCP
echo   Porta:     8611 -^> 8611
echo   IP interno: %IP%
echo.
echo De fora: http://SEU_IP_PUBLICO:8611
echo Na LAN:  http://%IP%:8611
echo.
pause
