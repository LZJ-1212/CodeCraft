#!/bin/bash
# 賦予執行權限: chmod +x OpenCodeCraft.sh

echo "==================================================="
echo "       🚀 Welcome to CodeCraft Agentic IDE 🚀"
echo "==================================================="
echo ""

NEEDS_RESTART=0

# Step 1: Check Node.js
if ! command -v node &> /dev/null; then
    echo "[System] Node.js not found. Installing..."
    if [[ "$OSTYPE" == "darwin"* ]]; then
        brew install node
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        sudo apt update && sudo apt install -y nodejs npm
    fi
    echo "[✅] Node.js installed!"
    NEEDS_RESTART=1
fi

# Step 2: Check Git
if ! command -v git &> /dev/null; then
    echo "[System] Git not found. Installing..."
    if [[ "$OSTYPE" == "darwin"* ]]; then
        brew install git
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        sudo apt update && sudo apt install -y git
    fi
    echo "[✅] Git installed!"
    NEEDS_RESTART=1
fi

if [ $NEEDS_RESTART -eq 1 ]; then
    echo "[⚠️] Environment updated. Please restart this terminal and run ./OpenCodeCraft.sh again."
    exit 1
fi

# Step 3: Install Dependencies
if [ ! -d "node_modules" ]; then
    echo "[System] First run detected. Installing dependencies..."
    npm install
    echo "[✅] Dependencies installed!"
fi

# Step 4: Launch
echo "[System] Booting up CodeCraft..."
# Mac 使用 open, Linux 使用 xdg-open 來啟動瀏覽器
if [[ "$OSTYPE" == "darwin"* ]]; then
    open http://127.0.0.1:8080
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    xdg-open http://127.0.0.1:8080
fi

node src/server.js