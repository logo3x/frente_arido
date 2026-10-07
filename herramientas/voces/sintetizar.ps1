# Graba cada frase de frases.json con la voz Raúl (Windows) en voces\crudo\<archivo>.wav, con velocidad y tono por facción.
$base = Split-Path -Parent $MyInvocation.MyCommand.Path
$crudo = Join-Path $base "crudo"; New-Item -ItemType Directory -Force $crudo | Out-Null
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Media.SpeechSynthesis.SpeechSynthesizer, Windows.Media.SpeechSynthesis, ContentType = WindowsRuntime]
$null = [Windows.Storage.Streams.DataReader, Windows.Storage.Streams, ContentType = WindowsRuntime]
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
function Esperar($op, [Type]$tipo){ $t = $asTask.MakeGenericMethod($tipo).Invoke($null, @($op)); $t.Wait(-1) | Out-Null; $t.Result }
$s = New-Object Windows.Media.SpeechSynthesis.SpeechSynthesizer
$s.Voice = [Windows.Media.SpeechSynthesis.SpeechSynthesizer]::AllVoices | Where-Object { $_.DisplayName -like '*Raul*' } | Select-Object -First 1
$frases = Get-Content (Join-Path $base "frases.json") -Raw -Encoding UTF8 | ConvertFrom-Json
$n = 0
foreach($f in $frases){
  $texto = [System.Security.SecurityElement]::Escape($f.texto)
  $tono = if([int]$f.pitch -ge 0){ "+$($f.pitch)%" } else { "$($f.pitch)%" }
  $ssml = "<speak version=`"1.0`" xmlns=`"http://www.w3.org/2001/10/synthesis`" xml:lang=`"es-MX`"><prosody rate=`"$($f.rate)`" pitch=`"$tono`" volume=`"loud`">$texto</prosody></speak>"
  $stream = Esperar ($s.SynthesizeSsmlToStreamAsync($ssml)) ([Windows.Media.SpeechSynthesis.SpeechSynthesisStream])
  $reader = New-Object Windows.Storage.Streams.DataReader($stream.GetInputStreamAt(0))
  $tam = [uint32]$stream.Size; $null = Esperar ($reader.LoadAsync($tam)) ([uint32])
  $bytes = New-Object byte[] $tam; $reader.ReadBytes($bytes)
  [System.IO.File]::WriteAllBytes((Join-Path $crudo "$($f.archivo).wav"), $bytes); $n++
}
"grabadas: $n"
