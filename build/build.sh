#!/bin/sh
# 把 build/ 裡的樣式和程式組成單一的 index.html
cd "$(dirname "$0")/.."
{
cat <<'H'
<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#2F3343">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="icons/icon.svg" type="image/svg+xml">
<link rel="icon" href="icons/favicon-32.png" type="image/png" sizes="32x32">
<link rel="apple-touch-icon" href="icons/apple-touch-icon.png" sizes="180x180">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="工作回報">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<title>全時間工作重點回報</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@600;900&display=swap" rel="stylesheet" media="print" onload="this.media='all'">
<script src="https://static.line-scdn.net/liff/edge/2/sdk.js"></script>
<style>
H
cat build/base.css build/extra.css
cat <<'H'
</style>
</head>
<body>
<main id="app"><div class="loading" role="status"><span class="dot"></span><span class="dot"></span><span class="dot"></span></div></main>
<div class="toast" id="toast" role="status" aria-live="polite"></div>
<div class="notice" id="notice" role="status" hidden><span id="notice-text"></span><button type="button" id="notice-go"></button><button type="button" id="notice-x" aria-label="關閉">×</button></div>
<script>
H
cat build/app.js
cat <<'H'
</script>
</body>
</html>
H
} > index.html
