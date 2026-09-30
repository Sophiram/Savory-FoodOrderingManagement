@echo off
title Savory - Full Stack Launcher
echo ============================================================
echo Starting Savory Food Ordering System
echo 1. FastAPI Python Backend: http://localhost:8000
echo 2. React Vite Frontend:     http://localhost:5173
echo ============================================================

start "Savory FastAPI Backend" cmd /k "cd /d %~dp0backend && .\venv\Scripts\python.exe run.py"
start "Savory React Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"

echo Both services launched in separate windows!
echo API Docs: http://localhost:8000/docs
echo App URL:  http://localhost:5173
