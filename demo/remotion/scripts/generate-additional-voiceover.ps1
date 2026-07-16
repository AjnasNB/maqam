param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("productloop", "crawler")]
  [string]$Id,

  [Parameter(Mandatory = $true)]
  [string]$ScriptFile
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

Add-Type -AssemblyName System.Speech

$ProjectDirectory = Split-Path -Parent $PSScriptRoot
$PublicDirectory = Join-Path $ProjectDirectory "public"
$ScriptPath = Join-Path $PSScriptRoot $ScriptFile
$AudioPath = Join-Path $PublicDirectory "$Id-voiceover.wav"
$CaptionsPath = Join-Path $PublicDirectory "$Id-captions.json"
$MetadataPath = Join-Path $PublicDirectory "$Id-voiceover-metadata.json"
$AudioTempPath = Join-Path $PublicDirectory "$Id-voiceover.rendering.wav"
$CaptionsTempPath = Join-Path $PublicDirectory "$Id-captions.rendering.json"
$MetadataTempPath = Join-Path $PublicDirectory "$Id-voiceover-metadata.rendering.json"

$segments = Get-Content -Raw -LiteralPath $ScriptPath | ConvertFrom-Json
if (-not $segments -or $segments.Count -eq 0) {
  throw "The authored $Id voiceover script is empty."
}

New-Item -ItemType Directory -Force -Path $PublicDirectory | Out-Null
foreach ($temporaryPath in @($AudioTempPath, $CaptionsTempPath, $MetadataTempPath)) {
  if (Test-Path -LiteralPath $temporaryPath) {
    Remove-Item -LiteralPath $temporaryPath -Force
  }
}

$synthesizer = [System.Speech.Synthesis.SpeechSynthesizer]::new()
$installedVoices = @($synthesizer.GetInstalledVoices() | ForEach-Object { $_.VoiceInfo })
if ($installedVoices.Count -eq 0) {
  $synthesizer.Dispose()
  throw "No local Microsoft System.Speech voice is installed."
}

$voice = $installedVoices | Where-Object { $_.Name -eq "Microsoft Zira Desktop" } | Select-Object -First 1
if ($null -eq $voice) {
  $voice = $installedVoices | Where-Object { $_.Culture.Name -eq "en-US" } | Select-Object -First 1
}
if ($null -eq $voice) {
  $voice = $installedVoices[0]
}

$synthesizer.SelectVoice($voice.Name)
$speechRate = 4
$synthesizer.Rate = $speechRate
$synthesizer.Volume = 96

$wordEvents = [System.Collections.Generic.List[object]]::new()
$progressHandler = [System.EventHandler[System.Speech.Synthesis.SpeakProgressEventArgs]] {
  param($sender, $eventArgs)
  $wordEvents.Add([pscustomobject]@{
    text = $eventArgs.Text
    startMs = [int][math]::Round($eventArgs.AudioPosition.TotalMilliseconds)
  })
}

$synthesizer.add_SpeakProgress($progressHandler)
$prompt = [System.Speech.Synthesis.PromptBuilder]::new([System.Globalization.CultureInfo]::GetCultureInfo("en-US"))
foreach ($segment in $segments) {
  if ([string]::IsNullOrWhiteSpace([string]$segment.text)) {
    throw "Every $Id voiceover segment must have text."
  }
  $prompt.AppendText([string]$segment.text)
  $pause = [int]$segment.pauseAfterMs
  if ($pause -gt 0) {
    $prompt.AppendBreak([TimeSpan]::FromMilliseconds($pause))
  }
}

try {
  $synthesizer.SetOutputToWaveFile($AudioTempPath)
  $synthesizer.Speak($prompt)
  $synthesizer.SetOutputToNull()
} finally {
  $synthesizer.remove_SpeakProgress($progressHandler)
  $synthesizer.Dispose()
}

if ($wordEvents.Count -eq 0) {
  throw "SAPI produced $Id audio but no caption timing events."
}

$ffprobeCommand = Get-Command ffprobe -ErrorAction SilentlyContinue
if ($null -ne $ffprobeCommand) {
  $durationText = & $ffprobeCommand.Source -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 -- $AudioTempPath
  $durationMs = [int][math]::Round(([double]::Parse($durationText.Trim(), [System.Globalization.CultureInfo]::InvariantCulture)) * 1000)
} else {
  $durationMs = [int]$wordEvents[$wordEvents.Count - 1].startMs + 900
}

if ($durationMs -gt 59800) {
  Remove-Item -LiteralPath $AudioTempPath -Force -ErrorAction SilentlyContinue
  throw "$Id voiceover is $durationMs ms and exceeds the 60-second composition safe limit."
}
if ($durationMs -lt 45000) {
  Remove-Item -LiteralPath $AudioTempPath -Force -ErrorAction SilentlyContinue
  throw "$Id voiceover is $durationMs ms and is shorter than the 45-second target."
}

$reportedTailMs = 650
$reportedDurationMs = [int]$wordEvents[$wordEvents.Count - 1].startMs + $reportedTailMs
$captionTimeScale = $durationMs / $reportedDurationMs

$captions = for ($index = 0; $index -lt $wordEvents.Count; $index += 1) {
  $current = $wordEvents[$index]
  $currentStart = [int][math]::Round(([int]$current.startMs) * $captionTimeScale)
  $nextStart = if ($index + 1 -lt $wordEvents.Count) {
    [int][math]::Round(([int]$wordEvents[$index + 1].startMs) * $captionTimeScale)
  } else {
    $durationMs
  }
  [ordered]@{
    text = if ($index -eq 0) { [string]$current.text } else { " $($current.text)" }
    startMs = $currentStart
    endMs = [math]::Min($durationMs, [math]::Max($currentStart + 60, $nextStart))
    timestampMs = $null
    confidence = $null
  }
}

$normalizedCaptions = [System.Collections.Generic.List[object]]::new()
for ($captionIndex = 0; $captionIndex -lt $captions.Count;) {
  $letters = [System.Collections.Generic.List[string]]::new()
  $sequenceEnd = $captionIndex
  while ($sequenceEnd -lt $captions.Count) {
    $letter = ([string]$captions[$sequenceEnd].text).Trim()
    if ($letter -cnotmatch "^[A-Z]$") {
      break
    }
    $letters.Add($letter)
    $sequenceEnd += 1
    if (([int]$captions[$sequenceEnd - 1].endMs - [int]$captions[$sequenceEnd - 1].startMs) -gt 350) {
      break
    }
  }
  if ($letters.Count -ge 2) {
    $prefix = if ($captionIndex -eq 0) { "" } else { " " }
    $normalizedCaptions.Add([pscustomobject][ordered]@{
      text = "$prefix$($letters -join '')"
      startMs = [int]$captions[$captionIndex].startMs
      endMs = [int]$captions[$sequenceEnd - 1].endMs
      timestampMs = $null
      confidence = $null
    })
    $captionIndex = $sequenceEnd
  } else {
    $normalizedCaptions.Add($captions[$captionIndex])
    $captionIndex += 1
  }
}
$captions = @($normalizedCaptions)

$utf8WithoutBom = [System.Text.UTF8Encoding]::new($false)
$captionsJson = $captions | ConvertTo-Json -Depth 5
[System.IO.File]::WriteAllText($CaptionsTempPath, $captionsJson, $utf8WithoutBom)

$metadata = [ordered]@{
  provider = "Microsoft System.Speech (local Windows SAPI)"
  voice = $voice.Name
  culture = $voice.Culture.Name
  rate = $speechRate
  volume = 96
  durationMs = $durationMs
  captionTimeScale = $captionTimeScale
  captionTiming = "SAPI SpeakProgress positions rescaled to rendered WAVE duration; spelled acronyms normalized for display"
  generatedAt = [DateTime]::UtcNow.ToString("o")
  cloudServiceUsed = $false
  sourceScript = "scripts/$ScriptFile"
  assetId = $Id
}
$metadataJson = $metadata | ConvertTo-Json
[System.IO.File]::WriteAllText($MetadataTempPath, $metadataJson, $utf8WithoutBom)

Move-Item -LiteralPath $AudioTempPath -Destination $AudioPath -Force
Move-Item -LiteralPath $CaptionsTempPath -Destination $CaptionsPath -Force
Move-Item -LiteralPath $MetadataTempPath -Destination $MetadataPath -Force

Write-Output "Generated $AudioPath with $($voice.Name) ($durationMs ms)."
Write-Output "Generated $($captions.Count) word-timed $Id captions."
