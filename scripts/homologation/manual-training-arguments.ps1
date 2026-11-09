param(
    [Parameter(Mandatory = $true)] [string] $Manifest,
    [Parameter(Mandatory = $true)] [string] $Hub,
    [Parameter(Mandatory = $true)] [string] $Agent,
    [Parameter(Mandatory = $true)] [string] $Flutter,
    [Parameter(Mandatory = $true)] [string] $Image,
    [ValidateRange(10, 120)] [int] $Minutes = 60,
    [switch] $CampoPrazos
)
# Emit distinct arguments, never a shell command or expanded credential string.
@('--manifest', $Manifest, '--hub', $Hub, '--agent', $Agent,
    '--flutter', $Flutter, '--image', $Image, '--minutes', [string]$Minutes)
if ($CampoPrazos) { '--campoPrazos' }
