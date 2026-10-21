# Axiom receipt PNG; Windows PowerShell 5.1 / System.Drawing. JSON stdin only.
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
Add-Type -AssemblyName System.Drawing
$data = [Console]::In.ReadToEnd() | ConvertFrom-Json
$bitmap = New-Object System.Drawing.Bitmap(1080,1500)
$g = [System.Drawing.Graphics]::FromImage($bitmap)
$g.TextRenderingHint = 'AntiAliasGridFit'
$g.SmoothingMode = 'AntiAlias'
$ink = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml('#30312F'))
$muted = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml('#929490'))
$yellow = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml('#FFDE00'))
$divider = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml('#F5F5F5'))
$title = New-Object System.Drawing.Font('Segoe UI',44,[System.Drawing.FontStyle]::Bold,[System.Drawing.GraphicsUnit]::Pixel)
$large = New-Object System.Drawing.Font('Segoe UI',68,[System.Drawing.FontStyle]::Bold,[System.Drawing.GraphicsUnit]::Pixel)
$body = New-Object System.Drawing.Font('Segoe UI',30,[System.Drawing.FontStyle]::Regular,[System.Drawing.GraphicsUnit]::Pixel)
$small = New-Object System.Drawing.Font('Segoe UI',24,[System.Drawing.FontStyle]::Regular,[System.Drawing.GraphicsUnit]::Pixel)
$center = New-Object System.Drawing.StringFormat
$center.Alignment = 'Center'
$right = New-Object System.Drawing.StringFormat
$right.Alignment = 'Far'
$stream = New-Object System.IO.MemoryStream
try {
    $g.Clear([System.Drawing.Color]::White)
    $g.DrawString('Detail Transaksi',$title,$ink,40,55)
    $g.DrawString('AXIOM PAYMENT',$small,$muted,(New-Object System.Drawing.RectangleF(700,72,340,40)),$right)
    $recipient = 'Axiom Payment'
    foreach ($row in $data.rows) { if ($row[0] -eq 'Penerima') { $recipient = [string]$row[1] } }
    $g.FillEllipse($yellow,504,165,72,72)
    $g.FillEllipse($ink,529,181,22,22)
    $g.FillEllipse($ink,520,207,40,20)
    $g.DrawString($recipient,$body,$ink,(New-Object System.Drawing.RectangleF(40,257,1000,50)),$center)
    $g.DrawString([string]$data.amount,$large,$ink,(New-Object System.Drawing.RectangleF(40,322,1000,90)),$center)
    $g.DrawString([string]$data.status,$body,$ink,(New-Object System.Drawing.RectangleF(40,425,1000,50)),$center)
    [single]$y = 535
    $index = 0
    foreach ($row in $data.rows) {
        if ($row[0] -eq 'Penerima') { continue }
        if ($index -eq 3) { $g.FillRectangle($divider,0,$y,1080,20); $y += 50 }
        $value = [string]$row[1]
        $label = [string]$row[0]
        [single]$height = [Math]::Max(52,[Math]::Ceiling($g.MeasureString($value,$body,590).Height)+8)
        if ($y + $height -gt 1320) { throw 'Receipt content exceeds image bounds.' }
        $g.DrawString($label,$body,$muted,(New-Object System.Drawing.RectangleF(40,$y,400,$height)))
        $g.DrawString($value,$body,$ink,(New-Object System.Drawing.RectangleF(450,$y,590,$height)),$right)
        $y += $height + 33
        $index++
    }
    $g.DrawString([string]$data.footer,$small,$muted,(New-Object System.Drawing.RectangleF(40,1400,1000,80)),$center)
    $bitmap.Save($stream,[System.Drawing.Imaging.ImageFormat]::Png)
    [Console]::Out.Write([Convert]::ToBase64String($stream.ToArray()))
} finally {
    $stream.Dispose(); $g.Dispose(); $bitmap.Dispose()
    $ink.Dispose(); $muted.Dispose(); $yellow.Dispose(); $divider.Dispose()
    $title.Dispose(); $large.Dispose(); $body.Dispose(); $small.Dispose(); $center.Dispose(); $right.Dispose()
}
