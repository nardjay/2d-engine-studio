# 2D Engine Studio — zero-dependency local server (no Python required).
# Uses Windows built-in PowerShell + HttpListener. Serves ONLY this folder on
# 127.0.0.1 (never reachable from other devices) with no-store cache headers.
param([int]$Port = 8000)

$root = [System.IO.Path]::GetFullPath((Split-Path -Parent $MyInvocation.MyCommand.Path))
$prefix = "http://127.0.0.1:$Port/"
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($prefix)
try {
  $listener.Start()
} catch {
  Write-Host "Could not start server on $prefix - port busy or permissions issue."
  Write-Host $_.Exception.Message
  Read-Host "Press Enter to exit"
  exit 1
}

Write-Host "2D Engine Studio running at $prefix  (close this window to stop)"
Start-Process $prefix

$mime = @{
  '.html' = 'text/html; charset=utf-8'
  '.js'   = 'text/javascript; charset=utf-8'
  '.mjs'  = 'text/javascript; charset=utf-8'
  '.css'  = 'text/css; charset=utf-8'
  '.json' = 'application/json'
  '.md'   = 'text/markdown; charset=utf-8'
  '.png'  = 'image/png'
  '.jpg'  = 'image/jpeg'
  '.jpeg' = 'image/jpeg'
  '.gif'  = 'image/gif'
  '.webp' = 'image/webp'
  '.svg'  = 'image/svg+xml'
  '.ico'  = 'image/x-icon'
  '.mp3'  = 'audio/mpeg'
  '.wav'  = 'audio/wav'
  '.ogg'  = 'audio/ogg'
}

while ($listener.IsListening) {
  try {
    $ctx = $listener.GetContext()
    $req = $ctx.Request
    $res = $ctx.Response
    $res.Headers.Add('Cache-Control', 'no-store')

    if ($req.HttpMethod -ne 'GET' -and $req.HttpMethod -ne 'HEAD') {
      $res.StatusCode = 405; $res.Close(); continue
    }

    $path = [Uri]::UnescapeDataString($req.Url.AbsolutePath)
    if ($path -eq '/' -or $path -eq '') { $path = '/index.html' }
    $full = [System.IO.Path]::GetFullPath((Join-Path $root ($path -replace '/', '\')))

    # path-traversal guard: only serve files inside the app folder
    if (-not $full.StartsWith($root + [System.IO.Path]::DirectorySeparatorChar) -and $full -ne (Join-Path $root 'index.html')) {
      $res.StatusCode = 403; $res.Close(); continue
    }

    if ((Test-Path $full -PathType Leaf) -and -not $full.Contains('.git')) {
      $ext = [System.IO.Path]::GetExtension($full).ToLower()
      $ct = $mime[$ext]; if (-not $ct) { $ct = 'application/octet-stream' }
      $res.ContentType = $ct
      $bytes = [System.IO.File]::ReadAllBytes($full)
      $res.ContentLength64 = $bytes.Length
      if ($req.HttpMethod -eq 'GET') { $res.OutputStream.Write($bytes, 0, $bytes.Length) }
    } else {
      $res.StatusCode = 404
      $msg = [System.Text.Encoding]::UTF8.GetBytes('Not found')
      $res.OutputStream.Write($msg, 0, $msg.Length)
    }
    $res.Close()
  } catch {
    try { $ctx.Response.Close() } catch {}
  }
}
