#!/bin/bash
# Gera dist/atendezap-loja.zip para a Chrome Web Store: só os arquivos da extensão (sem testes, ferramentas, docs e planilhas).
# Uso, na pasta do projeto:  tools/loja/empacotar.sh
set -e
cd "$(dirname "$0")/../.."
node test/util.test.js > /dev/null && node test/admin.test.js > /dev/null && node test/planilha.test.js > /dev/null
mkdir -p dist && rm -f dist/atendezap-loja.zip
zip -qr dist/atendezap-loja.zip manifest.json background.js content page lib icons -x '*/.*'
echo "ok: dist/atendezap-loja.zip (versão $(grep -o '"version": *"[^"]*"' manifest.json | cut -d'"' -f4))"
