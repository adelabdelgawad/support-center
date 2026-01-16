Add-Type -AssemblyName System.Drawing

# Create a simple 32x32 white icon with gray border (generic Windows exe style)
$bitmap = New-Object System.Drawing.Bitmap 32, 32
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)

# White background
$graphics.Clear([System.Drawing.Color]::White)

# Gray border
$pen = New-Object System.Drawing.Pen([System.Drawing.Color]::Gray, 2)
$graphics.DrawRectangle($pen, 0, 0, 31, 31)

# Clean up
$graphics.Dispose()
$bitmap.Save('icons/icon.png', [System.Drawing.Imaging.ImageFormat]::Png)
$bitmap.Dispose()

Write-Host "Created icons/icon.png"
