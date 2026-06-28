#!/bin/bash

echo "=== 1. Editor Service Stoppen ==="
systemctl stop gk-real-node-editor.service

echo "=== 2. NPM Opschonen en Installeren ==="
rm -rf node_modules package-lock.json

# Optioneel: Node 24 inladen
if [ -s "$HOME/.nvm/nvm.sh" ]; then
  source "$HOME/.nvm/nvm.sh"
  nvm use 24
fi

npm install

echo "=== 3. Editor Service Starten ==="
systemctl start gk-real-node-editor.service

echo "Klaar! De editor draait weer netjes op de achtergrond."