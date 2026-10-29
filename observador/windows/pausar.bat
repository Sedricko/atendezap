@echo off
if exist "%~dp0PAUSADO" (del "%~dp0PAUSADO" & echo Observador: registrando de novo.) else (type nul > "%~dp0PAUSADO" & echo Observador: PAUSADO.)
pause
