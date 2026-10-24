param([Parameter(Mandatory = $true)] [string] $Root)
$ErrorActionPreference = 'Stop'
# Verification only: never repair the permissions of an existing directory.
$directory = Get-Item -LiteralPath $Root
$resolvedRoot = $directory.FullName.TrimEnd('\')
$temporaryRoot = (Get-Item -LiteralPath ([IO.Path]::GetTempPath())).FullName.TrimEnd('\')
if (!$directory.PSIsContainer -or
    ($directory.Attributes -band [IO.FileAttributes]::ReparsePoint) -or
    (Split-Path $resolvedRoot -Leaf) -notmatch '^se7e_persona_[a-f0-9]{12}_test$' -or
    (Split-Path $resolvedRoot -Parent) -ne $temporaryRoot) { throw 'Invalid private manual fixture scope.' }
$acl = Get-Acl -LiteralPath $resolvedRoot
$currentSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$owner = $acl.GetOwner([Security.Principal.SecurityIdentifier]).Value
$rules = @($acl.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier]))
$expectedSids = @($currentSid, 'S-1-5-18')
if (!$acl.AreAccessRulesProtected -or $owner -ne $currentSid -or $rules.Count -ne 2) {
    throw 'Manual fixture permissions are not private.'
}
foreach ($sid in $expectedSids) {
    $matching = @($rules | Where-Object { $_.IdentityReference.Value -eq $sid })
    if ($matching.Count -ne 1 -or
        $matching[0].AccessControlType -ne [Security.AccessControl.AccessControlType]::Allow -or
        $matching[0].FileSystemRights -ne [Security.AccessControl.FileSystemRights]::FullControl -or
        $matching[0].InheritanceFlags -ne ([Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [Security.AccessControl.InheritanceFlags]::ObjectInherit) -or
        $matching[0].PropagationFlags -ne [Security.AccessControl.PropagationFlags]::None) {
        throw 'Manual fixture permissions are not private.'
    }
}
