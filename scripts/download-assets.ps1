# download-assets.ps1 — 从 GitHub Release 下载前端所需的音频和数据文件 (Windows)
#
# 用法:
#   powershell -ExecutionPolicy Bypass -File scripts\download-assets.ps1
#   powershell -ExecutionPolicy Bypass -File scripts\download-assets.ps1 -Tag v1.1.0-assets

param(
    [string]$Tag = "latest"
)

$ErrorActionPreference = "Stop"
$Repo = "wuwangzhang1216/ChinaTextbookStudyFree"
$RootDir = Split-Path -Parent $PSScriptRoot
$FrontendDir = Join-Path $RootDir "frontend"
$PublicDir = Join-Path $FrontendDir "public"
$DataSrcDir = Join-Path $RootDir "data"

Write-Host "=== ChinaStudyFree 资源下载器 ===" -ForegroundColor Cyan
Write-Host "目标: $PublicDir  和  $DataSrcDir"

# Resolve tag
if ($Tag -eq "latest") {
    Write-Host "查询最新 release..."
    $release = Invoke-RestMethod "https://api.github.com/repos/$Repo/releases/latest"
    $Tag = $release.tag_name
    if (-not $Tag) {
        Write-Host "错误: 无法获取最新 release tag" -ForegroundColor Red
        exit 1
    }
}

Write-Host "版本: $Tag" -ForegroundColor Green
$BaseUrl = "https://github.com/$Repo/releases/download/$Tag"

function Download-File($Name, $Out) {
    Write-Host "  下载 $Name ..."
    Invoke-WebRequest -Uri "$BaseUrl/$Name" -OutFile $Out -UseBasicParsing
}

function Extract-Zip($Zip, $Dest) {
    New-Item -ItemType Directory -Force -Path $Dest | Out-Null
    Write-Host "  解压 $(Split-Path $Zip -Leaf) → $Dest ..."
    Expand-Archive -Path $Zip -DestinationPath $Dest -Force
}

function Extract-TarGz($Tar, $Dest) {
    New-Item -ItemType Directory -Force -Path $Dest | Out-Null
    Write-Host "  解压 $(Split-Path $Tar -Leaf) → $Dest ..."
    tar xzf $Tar -C $Dest
}

# ---- audio.tar.gz ----
Write-Host ""
Write-Host "--- 下载音频文件 (Opus 格式, ~870MB) ---" -ForegroundColor Cyan
$audioDir = Join-Path $PublicDir "audio"
if ((Test-Path $audioDir) -and (Get-ChildItem $audioDir -Filter "*.opus" -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1)) {
    Write-Host "  跳过 (目录已存在且含 opus 文件)" -ForegroundColor Yellow
} else {
    $tmp = Join-Path $env:TEMP "audio.tar.gz"
    Download-File "audio.tar.gz" $tmp
    Extract-TarGz $tmp $PublicDir
    Remove-Item $tmp -Force
    Write-Host "  完成 ✓" -ForegroundColor Green
}

# ---- data.zip ----
Write-Host ""
Write-Host "--- 下载题库数据 (JSON, ~4MB) ---" -ForegroundColor Cyan
$dataDir = Join-Path $PublicDir "data"
if ((Test-Path (Join-Path $dataDir "index.json"))) {
    Write-Host "  跳过 (目录已存在且含 index.json)" -ForegroundColor Yellow
} else {
    $tmp = Join-Path $env:TEMP "data.zip"
    Download-File "data.zip" $tmp
    Extract-Zip $tmp $dataDir
    Remove-Item $tmp -Force
    Write-Host "  完成 ✓" -ForegroundColor Green
}

# ---- textbook-pages.zip ----
Write-Host ""
Write-Host "--- 下载课本原页扫描图 (JPG, ~192MB) ---" -ForegroundColor Cyan
$pagesDir = Join-Path $PublicDir "textbook-pages"
if ((Test-Path $pagesDir) -and (Get-ChildItem $pagesDir -Filter "*.jpg" -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1)) {
    Write-Host "  跳过 (目录已存在且含 jpg 文件)" -ForegroundColor Yellow
} else {
    $tmp = Join-Path $env:TEMP "textbook-pages.zip"
    Download-File "textbook-pages.zip" $tmp
    Extract-Zip $tmp $pagesDir
    Remove-Item $tmp -Force
    Write-Host "  完成 ✓" -ForegroundColor Green
}

# ---- story-images.zip ----
Write-Host ""
Write-Host "--- 下载故事配图 (JPEG, ~368MB) ---" -ForegroundColor Cyan
$storyDir = Join-Path $PublicDir "story-images"
if ((Test-Path $storyDir) -and (Get-ChildItem $storyDir -Filter "*.jpg" -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1)) {
    Write-Host "  跳过 (目录已存在且含 jpg 文件)" -ForegroundColor Yellow
} else {
    $tmp = Join-Path $env:TEMP "story-images.zip"
    Download-File "story-images.zip" $tmp
    Extract-Zip $tmp $storyDir
    Remove-Item $tmp -Force
    Write-Host "  完成 ✓" -ForegroundColor Green
}

# ---- data-source.zip ----
Write-Host ""
Write-Host "--- 下载 passages/stories 源 JSON (~811KB) ---" -ForegroundColor Cyan
if ((Test-Path (Join-Path $DataSrcDir "passages")) -and (Test-Path (Join-Path $DataSrcDir "stories"))) {
    Write-Host "  跳过 (passages 和 stories 目录已存在)" -ForegroundColor Yellow
} else {
    $tmp = Join-Path $env:TEMP "data-source.zip"
    Download-File "data-source.zip" $tmp
    Extract-Zip $tmp $DataSrcDir
    Remove-Item $tmp -Force
    Write-Host "  完成 ✓" -ForegroundColor Green
}

Write-Host ""
Write-Host "=== 全部下载完成! ===" -ForegroundColor Green
Write-Host "现在可以运行: cd frontend && npm run dev"
