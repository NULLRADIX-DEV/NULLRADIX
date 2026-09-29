#requires -Version 5.1
<#
.SYNOPSIS
    Rollt NULLRADIX als Container auf den Server aus.

.DESCRIPTION
    Das Image baut GitHub Actions bei jedem Push auf main (.github/workflows/image.yml) und legt es
    unter ghcr.io/nullradix-dev/nullradix:<commit-sha> ab. Dieses Skript baut NICHTS selbst:
      0. Tag bestimmen (Standard: aktueller Commit von origin/main)
      1. deploy/compose.yml nach /opt/nullradix/compose.yml hochladen und pruefen
      2. Image ziehen, Tag in /opt/nullradix/.env setzen, Container neu erstellen
      3. Check: http://127.0.0.1:8080/ und https://<HealthHost>/ muessen 200 liefern

    nginx auf dem Host (TLS, certbot, Logs) proxyt www.nullradix.de auf 127.0.0.1:8080 und
    wird hier nicht angefasst. NOOSE auf demselben Server bleibt komplett unberuehrt.
    Rollback: dasselbe Skript mit -Tag <aelterer-commit> ausfuehren.

.EXAMPLE
    .\deploy.ps1
        Aktuellen Stand von origin/main ausrollen.

.EXAMPLE
    .\deploy.ps1 -Tag f4f0e37
        Bestimmten Commit ausrollen (z. B. Rollback). Kurze SHAs werden lokal aufgeloest.

.NOTES
    Vorher pushen und die GitHub Action "Container-Image" abwarten, sonst gibt es das Image noch nicht.
    Lokal testen: npm run dev. Auf dem Server einmalig "docker login ghcr.io" (Classic-PAT mit read:packages).
#>

[CmdletBinding()]
param(
    [string]$Server = "root@62.169.28.155",
    [string]$Tag,
    [string]$IdentityFile = (Join-Path $env:USERPROFILE ".ssh\id_ed25519"),
    [string]$HealthHost = "www.nullradix.de",
    [switch]$NoPause
)

$ErrorActionPreference = "Stop"
$exitCode = 0
$image = "ghcr.io/nullradix-dev/nullradix"

function Invoke-Step {
    param([string]$Label, [scriptblock]$Action)
    Write-Host "==> $Label" -ForegroundColor Cyan
    & $Action
    if ($LASTEXITCODE -ne 0) { throw "Schritt fehlgeschlagen: $Label (Exit $LASTEXITCODE)" }
}

# Findet ssh/scp robust - PATH-unabhaengig, auch aus 32-bit-PowerShell (WOW64-Redirect von System32).
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
    $compose = Join-Path $PSScriptRoot "deploy\compose.yml"
    if (-not (Test-Path $compose)) {
        throw "deploy\compose.yml nicht gefunden. Liegt deploy.ps1 wirklich im NULLRADIX-Repo-Root?"
    }

    $scp = Resolve-Exe 'scp'
    $ssh = Resolve-Exe 'ssh'
    if (-not (Test-Path $IdentityFile)) {
        throw "SSH-Key nicht gefunden: $IdentityFile"
    }
    $key = @('-i', $IdentityFile, '-o', 'ConnectTimeout=10', '-o', 'StrictHostKeyChecking=accept-new')

    # 0) Tag bestimmen. Ohne -Tag: aktueller Commit von origin/main. Kurze SHAs lokal aufloesen,
    #    weil GHCR nur die volle SHA als Tag kennt.
    if (-not $Tag) {
        Invoke-Step "Hole origin/main" { git -C $PSScriptRoot fetch origin main --quiet }
        $Tag = "$(git -C $PSScriptRoot rev-parse origin/main)".Trim()
    } elseif ($Tag -match '^[0-9a-f]{7,39}$') {
        $resolved = git -C $PSScriptRoot rev-parse --verify --quiet "$Tag^{commit}"
        if ($LASTEXITCODE -ne 0 -or -not $resolved) { throw "Commit '$Tag' lokal nicht gefunden (vorher git fetch?)." }
        $Tag = "$resolved".Trim()
    }
    if ($Tag -notmatch '^([0-9a-f]{40}|latest)$') { throw "Ungueltiger Tag '$Tag' (erwartet: Commit-SHA oder latest)." }
    Write-Host "    Image $image`:$Tag" -ForegroundColor DarkGray

    # 1) compose.yml hochladen (die .env mit dem Tag bleibt auf dem Server)
    Invoke-Step "Lade compose.yml hoch" { & $scp @key $compose "${Server}:/opt/nullradix/compose.yml.new" }

    # 2+3) Ausrollen und pruefen. Keine doppelten Anfuehrungszeichen im Remote-Skript (Windows
    #      PowerShell 5.1 verschluckt sie beim Aufruf nativer Exes).
    $remote = "set -e; cd /opt/nullradix" +
              " && docker compose -f compose.yml.new config -q && mv compose.yml.new compose.yml" +
              " && { docker pull -q ${image}:$Tag >/dev/null || { echo Image ${image}:$Tag nicht gefunden - GitHub Action Container-Image abwarten.; exit 1; }; }" +
              " && echo vorher: `$(grep ^TAG= .env)" +
              " && sed -i 's/^TAG=.*/TAG=$Tag/' .env" +
              " && docker compose up -d" +
              ' && { i=0; until curl -sf -o /dev/null http://127.0.0.1:8080/; do i=$((i + 1)); [ $i -lt 15 ] || { echo Container: FEHLGESCHLAGEN; docker logs --tail 20 nullradix; exit 1; }; sleep 1; done; echo Container: OK; }' +
              " && curl -sf -o /dev/null https://$HealthHost/ && echo Check: HTTPS OK" +
              " && { docker image prune -af --filter until=168h --filter label=org.opencontainers.image.source=https://github.com/NULLRADIX-DEV/NULLRADIX >/dev/null || true; }"
    Invoke-Step "Rolle auf dem Server aus" { & $ssh @key $Server $remote }

    Write-Host ""
    Write-Host "Fertig. https://$HealthHost laeuft mit $($Tag.Substring(0, [Math]::Min(7, $Tag.Length)))." -ForegroundColor Green
    Write-Host "Im Browser ggf. mit Strg+F5 hart neu laden (Asset-Cache)." -ForegroundColor Green
}
catch {
    $exitCode = 1
    Write-Host ""
    Write-Host "============================================" -ForegroundColor Red
    Write-Host "  DEPLOY FEHLGESCHLAGEN" -ForegroundColor Red
    Write-Host "============================================" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host "Rollback: .\deploy.ps1 -Tag <vorheriger-commit> (siehe 'vorher:' oben)" -ForegroundColor DarkYellow
    if ($_.ScriptStackTrace) {
        Write-Host ""
        Write-Host $_.ScriptStackTrace -ForegroundColor DarkGray
    }
}
finally {
    if (-not $NoPause) {
        Write-Host ""
        $null = Read-Host "Enter druecken zum Schliessen"
    }
}

exit $exitCode
