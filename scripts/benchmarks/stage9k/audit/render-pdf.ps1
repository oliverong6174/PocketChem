$ErrorActionPreference = 'Stop'
$stage9kAuditDir = if ($PSScriptRoot) { $PSScriptRoot } else { Join-Path (Get-Location) 'scripts/benchmarks/stage9k/audit' }
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Storage.StorageFile, Windows.Storage, ContentType=WindowsRuntime]
$null = [Windows.Data.Pdf.PdfDocument, Windows.Data.Pdf, ContentType=WindowsRuntime]
$null = [Windows.Storage.Streams.InMemoryRandomAccessStream, Windows.Storage.Streams, ContentType=WindowsRuntime]
$taskMethod = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' } | Select-Object -First 1
function Wait-Result($operation, $resultType) {
    $task = $taskMethod.MakeGenericMethod($resultType).Invoke($null, @($operation))
    $task.Wait()
    return $task.Result
}
$pdfPath = Join-Path $stage9kAuditDir 'shizuoka-diels-alder-lecture.pdf'
$file = Wait-Result ([Windows.Storage.StorageFile]::GetFileFromPathAsync($pdfPath)) ([Windows.Storage.StorageFile])
$doc = Wait-Result ([Windows.Data.Pdf.PdfDocument]::LoadFromFileAsync($file)) ([Windows.Data.Pdf.PdfDocument])
foreach ($index in 10..17) {
    $page = $doc.GetPage($index)
    $stream = New-Object Windows.Storage.Streams.InMemoryRandomAccessStream
    $actionMethod = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and -not $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncAction' } | Select-Object -First 1
    $task = $actionMethod.Invoke($null, @($page.RenderToStreamAsync($stream)))
    $task.Wait()
    $netStream = [System.IO.WindowsRuntimeStreamExtensions]::AsStreamForRead($stream)
    $target = [System.IO.File]::Create((Join-Path $stage9kAuditDir ('lecture-page-' + ($index+1) + '.png')))
    $netStream.CopyTo($target)
    $target.Dispose()
    $netStream.Dispose()
    $page.Dispose()
}
Write-Output 'Rendered pages 11 through 18 using Windows.Data.Pdf.'
