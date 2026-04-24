; Sortlens Installer — Inno Setup Script
; Requires: Inno Setup 6+ (https://jrsoftware.org/isinfo.php)
;
; Prerequisites bundled:
;   - VC++ Redistributable 2015-2022 x64 (vc_redist.x64.exe)
;   - Microsoft Edge WebView2 Runtime (MicrosoftEdgeWebview2Setup.exe)
;
; Build this installer:
;   1. Install Inno Setup 6 from https://jrsoftware.org/isdl.php
;   2. Download prerequisites (see README in this folder)
;   3. Open this file in Inno Setup Compiler and click Build

#define MyAppName "Sortlens"
#define MyAppVersion "0.7.0"
#define MyAppPublisher "Sortlens"
#define MyAppURL "https://sortlens.app"
#define MyAppExeName "Sortlens.exe"
#define DistDir "..\backend\dist\Sortlens"

[Setup]
AppId={{A1B2C3D4-E5F6-7890-ABCD-EF1234567890}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
OutputDir=output
OutputBaseFilename=SortlensSetup-{#MyAppVersion}
SetupIconFile=..\backend\sortlens.ico
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
UninstallDisplayIcon={app}\{#MyAppExeName}
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[Files]
; Main application files (entire dist folder)
Source: "{#DistDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

; Prerequisites (placed in a temp dir during install)
Source: "prerequisites\vc_redist.x64.exe"; DestDir: "{tmp}"; Flags: deleteafterinstall; Check: VCRedistNeedsInstall
Source: "prerequisites\MicrosoftEdgeWebview2Setup.exe"; DestDir: "{tmp}"; Flags: deleteafterinstall; Check: WebView2NeedsInstall

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{group}\Uninstall {#MyAppName}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
; Install VC++ Redistributable silently if needed
Filename: "{tmp}\vc_redist.x64.exe"; Parameters: "/install /quiet /norestart"; StatusMsg: "Installing Visual C++ Runtime..."; Flags: waituntilterminated; Check: VCRedistNeedsInstall

; Install WebView2 Runtime silently if needed
Filename: "{tmp}\MicrosoftEdgeWebview2Setup.exe"; Parameters: "/silent /install"; StatusMsg: "Installing WebView2 Runtime..."; Flags: waituntilterminated; Check: WebView2NeedsInstall

; Launch app after install
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
Type: filesandordirs; Name: "{app}"

[Code]
// Check if VC++ Redistributable 2015-2022 x64 is installed
function VCRedistNeedsInstall: Boolean;
var
  Version: String;
begin
  Result := True;
  // Check for VC++ 2015-2022 Redistributable (14.x)
  if RegQueryStringValue(HKLM, 'SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x64', 'Version', Version) then
  begin
    // Version looks like 'v14.xx.xxxxx'  — any 14.x is fine
    if (Pos('v14', Version) = 1) then
      Result := False;
  end;
end;

// Check if WebView2 Runtime is installed
function WebView2NeedsInstall: Boolean;
var
  Version: String;
begin
  Result := True;
  // WebView2 registers its version here
  if RegQueryStringValue(HKLM, 'SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}', 'pv', Version) then
  begin
    if (Version <> '') and (Version <> '0.0.0.0') then
      Result := False;
  end
  else if RegQueryStringValue(HKCU, 'SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}', 'pv', Version) then
  begin
    if (Version <> '') and (Version <> '0.0.0.0') then
      Result := False;
  end;
end;
