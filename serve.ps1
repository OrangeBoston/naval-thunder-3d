# serve.ps1 — 极简静态文件服务器（零依赖，PowerShell 自带）
# 用法: powershell -NoProfile -ExecutionPolicy Bypass -File serve.ps1 [端口]
# 然后浏览器打开 http://127.0.0.1:8787/
param([int]$Port = 8787)
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://127.0.0.1:$Port/")
$listener.Start()
Write-Host "Serving $root at http://127.0.0.1:$Port/  (Ctrl+C 停止)"
while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  try {
    $path = $ctx.Request.Url.AbsolutePath
    if ($path -eq "/") { $path = "/index.html" }
    $file = Join-Path $root ($path -replace "/", "\")
    if ((Test-Path $file -PathType Leaf) -and ((Resolve-Path $file).Path.StartsWith($root))) {
      $bytes = [IO.File]::ReadAllBytes($file)
      $mime = switch ([IO.Path]::GetExtension($file).ToLower()) {
        ".html" { "text/html; charset=utf-8" }
        ".js"   { "application/javascript; charset=utf-8" }
        ".css"  { "text/css; charset=utf-8" }
        ".png"  { "image/png" }
        default { "application/octet-stream" }
      }
      $ctx.Response.ContentType = $mime
      $ctx.Response.ContentLength64 = $bytes.Length
      # 开发模式：禁用缓存，确保文件改动立即生效
      $ctx.Response.Headers.Add("Cache-Control", "no-cache, no-store, must-revalidate")
      $ctx.Response.Headers.Add("Pragma", "no-cache")
      $ctx.Response.Headers.Add("Expires", "0")
      $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
      $ctx.Response.StatusCode = 404
      $buf = [Text.Encoding]::UTF8.GetBytes("404")
      $ctx.Response.OutputStream.Write($buf, 0, $buf.Length)
    }
  } catch {}
  finally { $ctx.Response.Close() }
}
