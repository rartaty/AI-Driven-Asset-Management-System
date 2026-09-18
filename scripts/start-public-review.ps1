Set-Location (Join-Path $PSScriptRoot '..\\frontend')
npm ci
npm run dev -- --hostname 127.0.0.1 --port 3100
