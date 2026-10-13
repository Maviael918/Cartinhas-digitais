$ErrorActionPreference = "Stop"

$ProjectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir = Split-Path -Parent $ProjectDir
$SdkDir = "$env:LOCALAPPDATA\Android\Sdk"
$BuildTools = Join-Path $SdkDir "build-tools\35.0.0"
$PlatformJar = Join-Path $SdkDir "platforms\android-35\android.jar"
$Javac = "C:\Program Files\Microsoft\jdk-17.0.16.8-hotspot\bin\javac.exe"
$Jar = "C:\Program Files\Microsoft\jdk-17.0.16.8-hotspot\bin\jar.exe"
$Keytool = "C:\Program Files\Microsoft\jdk-17.0.16.8-hotspot\bin\keytool.exe"

$Aapt2 = Join-Path $BuildTools "aapt2.exe"
$D8 = Join-Path $BuildTools "d8.bat"
$Zipalign = Join-Path $BuildTools "zipalign.exe"
$Apksigner = Join-Path $BuildTools "apksigner.bat"

function Invoke-Checked {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [Parameter(Mandatory = $true)][string[]]$Arguments
    )

    & $FilePath @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Command failed: $FilePath $($Arguments -join ' ')"
    }
}

$BuildDir = Join-Path $ProjectDir "build"
$Compiled = Join-Path $BuildDir "compiled"
$Generated = Join-Path $BuildDir "generated"
$Classes = Join-Path $BuildDir "classes"
$Dex = Join-Path $BuildDir "dex"
$UnsignedApk = Join-Path $BuildDir "cartinhas-player-unsigned.apk"
$AlignedApk = Join-Path $BuildDir "cartinhas-player-aligned.apk"
$SignedApk = Join-Path $BuildDir "cartinhas-player-debug.apk"
$Keystore = Join-Path $BuildDir "debug.keystore"

Copy-Item -LiteralPath (Join-Path $RootDir "app.js") -Destination (Join-Path $ProjectDir "assets\app.js") -Force
Copy-Item -LiteralPath (Join-Path $RootDir "style.css") -Destination (Join-Path $ProjectDir "assets\style.css") -Force
Copy-Item -LiteralPath (Join-Path $RootDir "supabase-config.js") -Destination (Join-Path $ProjectDir "assets\supabase-config.js") -Force
Copy-Item -LiteralPath (Join-Path $RootDir "manifest.webmanifest") -Destination (Join-Path $ProjectDir "assets\manifest.webmanifest") -Force
New-Item -ItemType Directory -Force (Join-Path $ProjectDir "assets\cartinhas") | Out-Null
Copy-Item -Path (Join-Path $RootDir "cartinhas\*") -Destination (Join-Path $ProjectDir "assets\cartinhas") -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force (Join-Path $ProjectDir "assets\audio") | Out-Null
Copy-Item -Path (Join-Path $RootDir "audio\*") -Destination (Join-Path $ProjectDir "assets\audio") -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force (Join-Path $ProjectDir "assets\icone") | Out-Null
Copy-Item -Path (Join-Path $RootDir "icone\*") -Destination (Join-Path $ProjectDir "assets\icone") -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force (Join-Path $ProjectDir "res\drawable") | Out-Null
Copy-Item -LiteralPath (Join-Path $RootDir "icone\pontos-cardeais.png") -Destination (Join-Path $ProjectDir "res\drawable\app_icon.png") -Force

Remove-Item -Recurse -Force $Compiled, $Generated, $Classes, $Dex -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force $Compiled, $Generated, $Classes, $Dex | Out-Null

Invoke-Checked -FilePath $Aapt2 -Arguments @("compile", "--dir", (Join-Path $ProjectDir "res"), "-o", (Join-Path $Compiled "res.zip"))
Invoke-Checked -FilePath $Aapt2 -Arguments @(
    "link",
    "-o", $UnsignedApk,
    "-I", $PlatformJar,
    "--manifest", (Join-Path $ProjectDir "AndroidManifest.xml"),
    "-A", (Join-Path $ProjectDir "assets"),
    "--java", $Generated,
    "--min-sdk-version", "23",
    "--target-sdk-version", "35",
    (Join-Path $Compiled "res.zip")
)

$JavaFiles = @()
$JavaFiles += Get-ChildItem -Recurse -Filter *.java $Generated | ForEach-Object { $_.FullName }
$JavaFiles += Get-ChildItem -Recurse -Filter *.java (Join-Path $ProjectDir "src") | ForEach-Object { $_.FullName }

$JavacArgs = @("-source", "1.8", "-target", "1.8", "-bootclasspath", $PlatformJar, "-d", $Classes) + $JavaFiles
Invoke-Checked -FilePath $Javac -Arguments $JavacArgs

$ClassFiles = Get-ChildItem -Recurse -Filter *.class $Classes | ForEach-Object { $_.FullName }
$D8Args = @("--lib", $PlatformJar, "--output", $Dex) + $ClassFiles
Invoke-Checked -FilePath $D8 -Arguments $D8Args

Push-Location $Dex
Invoke-Checked -FilePath $Jar -Arguments @("uf", $UnsignedApk, "classes.dex")
Pop-Location

if (!(Test-Path $Keystore)) {
    Invoke-Checked -FilePath $Keytool -Arguments @(
        "-genkeypair",
        "-keystore", $Keystore,
        "-storepass", "android",
        "-keypass", "android",
        "-alias", "androiddebugkey",
        "-keyalg", "RSA",
        "-keysize", "2048",
        "-validity", "10000",
        "-dname", "CN=Android Debug,O=Android,C=BR"
    )
}

Invoke-Checked -FilePath $Zipalign -Arguments @("-f", "4", $UnsignedApk, $AlignedApk)
Invoke-Checked -FilePath $Apksigner -Arguments @("sign", "--ks", $Keystore, "--ks-pass", "pass:android", "--key-pass", "pass:android", "--out", $SignedApk, $AlignedApk)
Invoke-Checked -FilePath $Apksigner -Arguments @("verify", "--verbose", $SignedApk)

Get-Item $SignedApk | Format-List FullName,Length,LastWriteTime
