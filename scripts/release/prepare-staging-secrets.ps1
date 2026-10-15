# Offline preparation only. This script never invokes a network client or Wrangler.
# Run interactively in the owner's PowerShell 7 terminal, without transcript/debug tracing.
[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
if (!$IsWindows -or $PSVersionTable.PSVersion.Major -lt 7) { throw 'Windows PowerShell 7 gerekir.' }
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$directory = Join-Path $env:LOCALAPPDATA ('AmericaWhat/staging-secrets/' + [Guid]::NewGuid().ToString('N'))
$directory = [IO.Path]::GetFullPath($directory)
if ($directory.StartsWith($root + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Secret dizini repo dışında olmalı.' }
[IO.Directory]::CreateDirectory($directory) | Out-Null
$sid = [Security.Principal.WindowsIdentity]::GetCurrent().User
$acl = [Security.AccessControl.DirectorySecurity]::new()
$acl.SetOwner($sid)
$acl.SetAccessRuleProtection($true, $false)
$rule = [Security.AccessControl.FileSystemAccessRule]::new($sid, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
$acl.AddAccessRule($rule)
Set-Acl -LiteralPath $directory -AclObject $acl
$actual = Get-Acl -LiteralPath $directory
if (!$actual.AreAccessRulesProtected -or @($actual.Access | Where-Object { $_.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value -ne $sid.Value }).Count) { throw 'Owner-only ACL doğrulanamadı.' }
$secure = Read-Host 'Yalnız sandbox için fine-grained PAT (giriş gizli)' -AsSecureString
$pointer = [IntPtr]::Zero
$plain = $null
$json = $null
$values = $null
$random = $null
try {
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  if ($plain -notmatch '^github_pat_[A-Za-z0-9_]+$') { throw 'Fine-grained PAT biçimi gerekli; değer gösterilmedi.' }
  $random = [Security.Cryptography.RandomNumberGenerator]::GetBytes(32)
  $values = [Collections.Generic.Dictionary[string,string]]::new()
  $values.Add('GITHUB_TOKEN', $plain)
  $values.Add('BOSS_CSRF_SECRET', [Convert]::ToBase64String($random))
  $json = [Text.Json.JsonSerializer]::Serialize($values, $values.GetType(), [Text.Json.JsonSerializerOptions]::new())
  $file = Join-Path $directory 'boss-staging-secrets.json'
  [IO.File]::WriteAllText($file, $json, [Text.UTF8Encoding]::new($false))
} finally {
  if ($pointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
  if ($null -ne $random) { [Array]::Clear($random, 0, $random.Length) }
  if ($null -ne $values) { $values.Clear() }
  $plain = $null
  $json = $null
  $secure.Dispose()
}
Write-Output 'Yalnız yerel dosya hazırlandı; uzak yazım veya deployment yapılmadı.'
Write-Output 'Secret adları: GITHUB_TOKEN, BOSS_CSRF_SECRET. Değerleri görüntülemeyin.'
Write-Output ('Owner-only dosya yolu: ' + $file)
