# Production secret files for americawhat-web-production / americawhat-boss-production.
# Offline: this script never calls Wrangler, GitHub or any network client, and
# never prints a secret value. Files go to an owner-only directory OUTSIDE the
# repository; pass them to `wrangler deploy|versions upload --secrets-file` and
# delete them afterwards (docs/PRODUCTION-PROVISIONING.md, step 3).
#
#   pwsh -NoProfile -File scripts/release/prepare-production-secrets.ps1 -Part Generated
#       Fresh random REACTION_GUARD_SECRET (web) and BOSS_CSRF_SECRET (boss),
#       32 bytes each from the OS CSPRNG. Never reuses a staging value.
#   pwsh -NoProfile -File scripts/release/prepare-production-secrets.ps1 -Part GitHubPat
#       Owner only, interactive: reads a fine-grained PAT (only hakandndr/americawhat,
#       Contents read/write, expiring) from the clipboard after typing EVET,
#       writes GITHUB_TOKEN for the Boss and clears the clipboard.
[CmdletBinding()]
param(
  [Parameter(Mandatory)] [ValidateSet('Generated', 'GitHubPat')] [string] $Part
)
$ErrorActionPreference = 'Stop'
if (!$IsWindows -or $PSVersionTable.PSVersion.Major -lt 7) { throw 'Windows PowerShell 7 gerekir.' }

$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$directory = [IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA ('AmericaWhat/production-secrets/' + [Guid]::NewGuid().ToString('N'))))
if ($directory.StartsWith($root + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Secret dizini repo dışında olmalı.' }

function New-OwnerOnlyDirectory([string] $path) {
  [IO.Directory]::CreateDirectory($path) | Out-Null
  $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User
  $acl = [Security.AccessControl.DirectorySecurity]::new()
  $acl.SetOwner($sid)
  $acl.SetAccessRuleProtection($true, $false)
  $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($sid, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow'))
  Set-Acl -LiteralPath $path -AclObject $acl
  $actual = Get-Acl -LiteralPath $path
  if (!$actual.AreAccessRulesProtected -or @($actual.Access | Where-Object { $_.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value -ne $sid.Value }).Count) { throw 'Owner-only ACL doğrulanamadı.' }
}

function Write-SecretFile([string] $name, [string] $key, [string] $value) {
  $values = [Collections.Generic.Dictionary[string,string]]::new()
  $values.Add($key, $value)
  try {
    $json = [Text.Json.JsonSerializer]::Serialize($values, $values.GetType(), [Text.Json.JsonSerializerOptions]::new())
    $file = Join-Path $directory $name
    [IO.File]::WriteAllText($file, $json, [Text.UTF8Encoding]::new($false))
    return $file
  } finally { $values.Clear(); $json = $null }
}

function New-RandomSecret {
  $bytes = [Security.Cryptography.RandomNumberGenerator]::GetBytes(32)
  try { return [Convert]::ToBase64String($bytes) } finally { [Array]::Clear($bytes, 0, $bytes.Length) }
}

if ($Part -eq 'Generated') {
  New-OwnerOnlyDirectory $directory
  $web = Write-SecretFile 'web-production-secrets.json' 'REACTION_GUARD_SECRET' (New-RandomSecret)
  $boss = Write-SecretFile 'boss-production-secrets.json' 'BOSS_CSRF_SECRET' (New-RandomSecret)
  Write-Output 'Yerel dosyalar hazırlandı; değerler gösterilmedi, uzak yazım yapılmadı.'
  Write-Output ('web  (REACTION_GUARD_SECRET): ' + $web)
  Write-Output ('boss (BOSS_CSRF_SECRET):      ' + $boss)
  return
}

$confirmation = Read-Host 'Panodaki production PAT bellekte doğrulanıp korumalı yerel dosyaya yazılacak, ardından pano temizlenecek. Onaylamak için EVET yazın'
if ($confirmation -cne 'EVET') { Write-Output 'İptal edildi; pano okunmadı.'; return }
$plain = $null
try {
  $plain = Get-Clipboard -Raw
  if ($null -eq $plain -or $plain -cnotmatch '\Agithub_pat_[A-Za-z0-9]{22}_[A-Za-z0-9]{59}\z') { throw 'Fine-grained PAT biçimi gerekli; değer gösterilmedi.' }
  New-OwnerOnlyDirectory $directory
  $file = Write-SecretFile 'boss-production-github.json' 'GITHUB_TOKEN' $plain
  Set-Clipboard -Value ''
} finally { $plain = $null }
Write-Output 'Yalnız yerel dosya hazırlandı; değer gösterilmedi.'
Write-Output ('boss (GITHUB_TOKEN): ' + $file)
Write-Output 'Sonraki komut (Boss, alan adı yok): npx wrangler secret bulk <dosya> --env production --config workers/boss/wrangler.jsonc ; ardından dosyayı silin.'
