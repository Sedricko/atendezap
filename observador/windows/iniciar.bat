@echo off
rem Inicia o Observador escondido. Para iniciar junto com o Windows: Win+R, shell:startup, e coloque um atalho deste arquivo la.
start "" powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0observador.ps1"
