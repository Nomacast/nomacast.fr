# ============================================================
# Optimisation web batch pour videos MP4
# Traite tous les .mp4 du dossier specifie en parallele
# ============================================================
# Usage : .\optimize_videos_web.ps1
# Place ce script dans le dossier qui contient tes videos
# ou modifie $SourceDir ci-dessous
# ============================================================

# --- Configuration ---
$SourceDir   = $PSScriptRoot   # dossier du script, ou remplace par "C:\chemin\vers\videos"
$OutputDir   = Join-Path $SourceDir "web_optimized"
$MaxWidth    = 1920            # largeur max (1080p), descend si plus grand
$CRF         = 22              # qualite : 18 = haute, 22 = standard web, 26 = plus leger
$KeepAudio   = $false          # audio retire pour usage web/background

# --- Creation du dossier de sortie ---
if (-not (Test-Path $OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir | Out-Null
}

# --- Recuperation des fichiers source ---
$videos = Get-ChildItem -Path $SourceDir -Filter "*.mp4" | Where-Object { $_.Name -notlike "*_web.mp4" }

if ($videos.Count -eq 0) {
    Write-Host "Aucun fichier .mp4 trouve dans $SourceDir" -ForegroundColor Yellow
    exit 0
}

Write-Host "=== Optimisation web batch ===" -ForegroundColor Cyan
Write-Host "Dossier source : $SourceDir"
Write-Host "Dossier sortie : $OutputDir"
Write-Host "Fichiers a traiter : $($videos.Count)"
Write-Host ""

$totalStart = Get-Date

# --- Boucle de traitement ---
$index = 0
foreach ($video in $videos) {
    $index++
    $outputName = [System.IO.Path]::GetFileNameWithoutExtension($video.Name) + "_web.mp4"
    $outputPath = Join-Path $OutputDir $outputName

    Write-Host "[$index/$($videos.Count)] $($video.Name)" -ForegroundColor Yellow

    # Skip si deja traite
    if (Test-Path $outputPath) {
        Write-Host "    Deja traite, skip." -ForegroundColor Gray
        continue
    }

    # Construction de la commande ffmpeg
    $audioArgs = if ($KeepAudio) { "-c:a aac -b:a 128k" } else { "-an" }
    $vfFilter  = "scale='min($MaxWidth,iw)':'-2':flags=lanczos"

    $start = Get-Date

    $cmd = "ffmpeg -y -i `"$($video.FullName)`" -vf `"$vfFilter`" " +
           "-c:v libx264 -preset slow -crf $CRF -profile:v high -pix_fmt yuv420p " +
           "-movflags +faststart $audioArgs `"$outputPath`""

    Invoke-Expression $cmd

    if ($LASTEXITCODE -eq 0) {
        $duration  = (Get-Date) - $start
        $sizeIn    = [math]::Round($video.Length / 1MB, 2)
        $sizeOut   = [math]::Round((Get-Item $outputPath).Length / 1MB, 2)
        $reduction = [math]::Round((1 - ($sizeOut / $sizeIn)) * 100, 1)
        Write-Host "    OK : $sizeIn Mo -> $sizeOut Mo (-$reduction%) en $([math]::Round($duration.TotalSeconds, 0))s" -ForegroundColor Green
    } else {
        Write-Host "    Echec ffmpeg sur $($video.Name)" -ForegroundColor Red
    }
    Write-Host ""
}

$totalDuration = (Get-Date) - $totalStart
Write-Host "=== Termine en $([math]::Round($totalDuration.TotalMinutes, 1)) min ===" -ForegroundColor Green
Write-Host "Fichiers optimises dans : $OutputDir"
