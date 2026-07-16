param()

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

Add-Type -AssemblyName System.Speech

$ProjectDirectory = Split-Path -Parent $PSScriptRoot
$PublicDirectory = Join-Path $ProjectDirectory "public"
$ScriptPath = Join-Path $PSScriptRoot "voiceover-script.json"
$AudioPath = Join-Path $PublicDirectory "voiceover.wav"
$CaptionsPath = Join-Path $PublicDirectory "captions.json"
$MetadataPath = Join-Path $PublicDirectory "voiceover-metadata.json"

$segments = Get-Content -Raw -LiteralPath $ScriptPath | ConvertFrom-Json
if (-not $segments -or $segments.Count -eq 0) {
  throw "The authored voiceover script is empty."
}

New-Item -ItemType Directory -Force -Path $PublicDirectory | Out-Null
if (Test-Path -LiteralPath $AudioPath) {
  Remove-Item -LiteralPath $AudioPath -Force
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
$speechRate = 3
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
    throw "Every voiceover segment must have text."
  }
  $prompt.AppendText([string]$segment.text)
  $pause = [int]$segment.pauseAfterMs
  if ($pause -gt 0) {
    $prompt.AppendBreak([TimeSpan]::FromMilliseconds($pause))
  }
}

try {
  $synthesizer.SetOutputToWaveFile($AudioPath)
  $synthesizer.Speak($prompt)
  $synthesizer.SetOutputToNull()
} finally {
  $synthesizer.remove_SpeakProgress($progressHandler)
  $synthesizer.Dispose()
}

if ($wordEvents.Count -eq 0) {
  throw "SAPI produced audio but no caption timing events."
}

$ffprobeCommand = Get-Command ffprobe -ErrorAction SilentlyContinue
if ($null -ne $ffprobeCommand) {
  $durationText = & $ffprobeCommand.Source -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 -- $AudioPath
  $durationMs = [int][math]::Round(([double]::Parse($durationText.Trim(), [System.Globalization.CultureInfo]::InvariantCulture)) * 1000)
} else {
  $durationMs = [int]$wordEvents[$wordEvents.Count - 1].startMs + 900
}

if ($durationMs -gt 59800) {
  throw "Voiceover is $durationMs ms and exceeds the 60-second composition safe limit."
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

$utf8WithoutBom = [System.Text.UTF8Encoding]::new($false)
$captionsJson = $captions | ConvertTo-Json -Depth 5
[System.IO.File]::WriteAllText($CaptionsPath, $captionsJson, $utf8WithoutBom)

$metadata = [ordered]@{
  provider = "Microsoft System.Speech (local Windows SAPI)"
  voice = $voice.Name
  culture = $voice.Culture.Name
  rate = $speechRate
  volume = 96
  durationMs = $durationMs
  captionTimeScale = $captionTimeScale
  captionTiming = "SAPI SpeakProgress positions rescaled to rendered WAVE duration"
  generatedAt = [DateTime]::UtcNow.ToString("o")
  cloudServiceUsed = $false
  sourceScript = "scripts/voiceover-script.json"
}
$metadataJson = $metadata | ConvertTo-Json
[System.IO.File]::WriteAllText($MetadataPath, $metadataJson, $utf8WithoutBom)

Write-Output "Generated $AudioPath with $($voice.Name) ($durationMs ms)."
Write-Output "Generated $($captions.Count) word-timed captions."
