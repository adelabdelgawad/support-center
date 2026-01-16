Add-Type -AssemblyName System.Drawing

function Create-SimpleIcon {
    param($width, $height, $outputPath)

    $bitmap = New-Object System.Drawing.Bitmap $width, $height
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)

    # White/light gray background (generic Windows exe style)
    $graphics.Clear([System.Drawing.Color]::FromArgb(240, 240, 240))

    # Gray border
    $borderColor = [System.Drawing.Color]::FromArgb(180, 180, 180)
    $pen = New-Object System.Drawing.Pen($borderColor, 2)
    $graphics.DrawRectangle($pen, 0, 0, $width - 1, $height - 1)

    # Add simple folded corner effect (like document icon)
    $graphics.FillPolygon([System.Drawing.Brushes]::LightGray,
        [System.Drawing.Point]::new($width - 16, 0),
        [System.Drawing.Point]::new($width, 16),
        [System.Drawing.Point]::new($width, 0))

    $graphics.Dispose()
    $bitmap.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bitmap.Dispose()
}

# Create icons directory if not exists
if (!(Test-Path "icons")) {
    New-Item -ItemType Directory -Path "icons" | Out-Null
}

# Create all required icon sizes
Create-SimpleIcon 32 32 "icons/32x32.png"
Create-SimpleIcon 128 128 "icons/128x128.png"
Create-SimpleIcon 256 256 "icons/128x128@2x.png"
Create-SimpleIcon 48 48 "icons/icon.png"
Create-SimpleIcon 48 48 "icons/chat-icon.png"

Write-Host "Created all icon files with generic Windows exe style"
