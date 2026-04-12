# download-assets.ps1 — 从 GitHub Release 下载前端所需的音频和数据文件 (Windows)
#
# 用法:
#   powershell -ExecutionPolicy Bypass -File scripts\download-assets.ps1
#   powershell -ExecutionPolicy Bypass -File scripts\download-assets.ps1 -Tag v1.0.0

param(
    [string]$Tag = "latest"
)

$ErrorActionPreference = "Stop"
$Repo = "wuwangzhang1216/ChinaTextbookStudyFree"
$FrontendDir = Join-Path (Split-Path -Parent $PSScriptRoot) "frontend"
$PublicDir = Join-Path $FrontendDir "public"

Write-Host "=== ChinaStudyFree 资源下载器 ===" -ForegroundColor Cyan
Write-Host "目标: $PublicDir"

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

function Download-And-Extract($Name, $Dest) {
    $tmp = Join-Path $env:TEMP $Name

    Write-Host "  下载 $Name ..."
    Invoke-WebRequest -Uri "$BaseUrl/$Name" -OutFile $tmp -UseBasicParsing

    Write-Host "  解压到 $Dest ..."
    New-Item -ItemType Directory -Force -Path $Dest | Out-Null
    tar xzf $tmp -C $Dest

    Remove-Item $tmp -Force
    Write-Host "  完成 ✓" -ForegroundColor Green
}

# Download audio
Write-Host ""
Write-Host "--- 下载音频文件 (Opus 格式) ---" -ForegroundColor Cyan
$audioDir = Join-Path $PublicDir "audio"
if ((Test-Path $audioDir) -and (Get-ChildItem $audioDir -Filter "*.opus" -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1)) {
    Write-Host "  跳过 (目录已存在且含 opus 文件)" -ForegroundColor Yellow
} else {
    Download-And-Extract "audio.tar.gz" $PublicDir
}

# Download data
Write-Host ""
Write-Host "--- 下载题库数据 (JSON) ---" -ForegroundColor Cyan
$dataDir = Join-Path $PublicDir "data"
if ((Test-Path $dataDir) -and (Get-ChildItem $dataDir -ErrorAction SilentlyContinue | Select-Object -First 1)) {
    Write-Host "  跳过 (目录已存在且非空)" -ForegroundColor Yellow
} else {
    Download-And-Extract "data.tar.gz" $PublicDir
}

Write-Host ""
Write-Host "=== 全部下载完成! ===" -ForegroundColor Green
Write-Host "现在可以运行: cd frontend && npm run dev"
