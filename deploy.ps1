#requires -Version 5.1
<#
.SYNOPSIS
    Baut NULLRADIX (Vite) und rollt das statische dist auf den Server aus.

.DESCRIPTION
    Ein-Befehl-Deploy: 'npm run build' -> mit tar packen (NICHT Compress-Archive,
    das zerschießt Dateien) -> per scp hochladen -> auf dem Server das Web-Verzeichnis
    leeren und neu befuellen, Rechte setzen, nginx liefert sofort aus.
    NULLRADIX ist eine reine statische Seite -> kein Dienst-Neustart noetig.

.EXAMPLE
    .\deploy.ps1
        Standard-Deploy nach root@62.169.28.155:/var/www/nullradix (Main-Server).

.EXAMPLE
    .\deploy.ps1 -SkipBuild
        Nutzt den vorhandenen .\dist-Ordner (kein erneutes npm run build).

.EXAMPLE
    .\deploy.ps1 -NoPause
        Ohne "Enter zum Schließen" am Ende (fuer Terminal-/CI-Nutzung).

.NOTES
    Aus 64-bit Windows PowerShell starten (sonst wird OpenSSH WOW64-redirected).
    Ohne SSH-Key fragt scp/ssh je einmal nach dem Server-Passwort.
#>

[CmdletBinding()]
param(
    [string]$Server = "root@62.169.28.155",
    [string]$AppDir = "/var/www/nullradix",
    [string]$IdentityFile = (Join-Path $env:USERPROFILE ".ssh\id_ed25519"),
    [string]$HealthHost = "www.nullradix.de",
    [switch]$SkipBuild,
    [switch]$NoPause
)

$ErrorActionPreference = "Stop"
$exitCode = 0

function Invoke-Step {
    param([string]$Label, [scriptblock]$Action)
    Write-Host "==> $Label" -ForegroundColor Cyan
    & $Action
    if ($LASTEXITCODE -ne 0) { throw "Schritt fehlgeschlagen: $Label (Exit $LASTEXITCODE)" }
}

# Findet ssh/scp robust – PATH-unabhaengig, auch aus 32-bit-PowerShell (WOW64-Redirect von System32).
function Resolve-Exe {
    param([string]$Name)
    $cmd = Get-Command $Name -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    $candidates = @(
        (Join-Path $env:WINDIR "System32\OpenSSH\$Name.exe"),   # 64-bit-Prozess
        (Join-Path $env:WINDIR "Sysnative\OpenSSH\$Name.exe"),  # aus 32-bit-Prozess -> echtes System32
        (Join-Path $env:ProgramFiles "Git\usr\bin\$Name.exe")   # Git for Windows als Fallback
    )
    foreach ($p in $candidates) {
        if ($p -and (Test-Path $p)) { return $p }
    }
    throw "$Name nicht gefunden. Tipp: deploy.ps1 in der normalen (64-bit) Windows PowerShell starten, oder OpenSSH-Client installieren."
}

try {
    $dist    = Join-Path $PSScriptRoot "dist"
    $tarball = Join-Path $PSScriptRoot "nullradix-dist.tgz"

    if (-not (Test-Path (Join-Path $PSScriptRoot "package.json"))) {
        throw "package.json nicht gefunden. Liegt deploy.ps1 wirklich im NULLRADIX-Repo-Root?"
    }

    # ssh/scp vorab auf vollen Pfad aufloesen (PATH-unabhaengig).
    $scp = Resolve-Exe 'scp'
    $ssh = Resolve-Exe 'ssh'

    # Main-Server (62.169.28.155) laeuft ueber ~/.ssh/id_ed25519. Dort liegt AUCH die
    # NOOSE-Prod (noose.info -> :5000). NULLRADIX hat einen EIGENEN nginx-Block
    # (server_name www.nullradix.de) und ein eigenes Verzeichnis; dieses Deploy
    # fasst ausschliesslich $AppDir an und laesst NOOSE komplett unberuehrt.
    if (-not (Test-Path $IdentityFile)) {
        throw "SSH-Key nicht gefunden: $IdentityFile"
    }
    $key = @('-i', $IdentityFile)

    # 1) Bauen. dist vorher leeren, damit keine Altlasten frueherer Builds mitwandern.
    if (-not $SkipBuild) {
        if (-not (Test-Path (Join-Path $PSScriptRoot "node_modules"))) {
            Invoke-Step "Installiere Abhaengigkeiten (npm ci)" { npm ci }
        }
        if (Test-Path $dist) {
            Write-Host "==> Leere dist-Ordner (keine Altlasten)" -ForegroundColor Cyan
            Remove-Item (Join-Path $dist '*') -Recurse -Force -ErrorAction SilentlyContinue
        }
        Invoke-Step "Baue Release (npm run build)" { npm run build }
    } else {
        Write-Host "==> ueberspringe Build (-SkipBuild)" -ForegroundColor DarkYellow
    }
    if (-not (Test-Path (Join-Path $dist "index.html"))) {
        throw "dist-Ordner unvollstaendig: $dist (index.html fehlt). Build fehlgeschlagen?"
    }

    # 2) Mit tar packen — zuverlaessig; Compress-Archive hat anderswo schon 0-Byte-Dateien erzeugt.
    if (Test-Path $tarball) { Remove-Item $tarball -Force }
    Invoke-Step "Packe Artefakt (tar)" { tar -czf $tarball -C $dist . }

    # 3) Auf den Server kopieren
    Invoke-Step "Lade auf Server hoch" { & $scp @key $tarball "${Server}:/tmp/nullradix-dist.tgz" }

    # 4) Auf dem Server ausrollen: Web-Verzeichnis leeren, neu befuellen, Rechte setzen.
    $remote = "rm -rf $AppDir/*" +
              " && tar -xzf /tmp/nullradix-dist.tgz -C $AppDir" +
              " && chown -R www-data:www-data $AppDir" +
              " && rm -f /tmp/nullradix-dist.tgz" +
              " && curl -sL -o /dev/null -w 'Check: HTTP %{http_code} (%{size_download} bytes)\n' -H 'Host: $HealthHost' http://127.0.0.1/"
    Invoke-Step "Rolle auf dem Server aus" { & $ssh @key $Server $remote }

    # 5) Lokales Artefakt aufraeumen
    Remove-Item $tarball -Force -ErrorAction SilentlyContinue

    Write-Host ""
    Write-Host "Fertig. https://$HealthHost ist aktualisiert." -ForegroundColor Green
    Write-Host "Im Browser ggf. mit Strg+F5 hart neu laden (Asset-Cache)." -ForegroundColor Green
}
catch {
    $exitCode = 1
    Write-Host ""
    Write-Host "============================================" -ForegroundColor Red
    Write-Host "  DEPLOY FEHLGESCHLAGEN" -ForegroundColor Red
    Write-Host "============================================" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    if ($_.ScriptStackTrace) {
        Write-Host ""
        Write-Host $_.ScriptStackTrace -ForegroundColor DarkGray
    }
}
finally {
    if (-not $NoPause) {
        Write-Host ""
        $null = Read-Host "Enter druecken zum Schließen"
    }
}

exit $exitCode
