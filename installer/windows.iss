; Inno Setup script for online installer

; https://github.com/kira-96/Inno-Setup-Chinese-Simplified-Translation/raw/refs/heads/main/ChineseSimplified.isl
; %AppData%\npm\node_modules\innosetup-compiler\bin\Languages
; npm i -g innosetup-compiler
; innosetup-compiler windows.iss --gui --verbose
; https://stackoverflow.com/a/66100456/

[Setup]
AppId=clevert
AppName={cm:AppName}
AppVersion=1.0.0
DefaultDirName={autopf}\clevert
DefaultGroupName={cm:AppName}
; UninstallDisplayIcon={app}\electron.exe
; OutputDir=userdocs:Inno Setup Output
UsePreviousLanguage=no
WizardStyle=modern

[Languages]
Name: en; MessagesFile: "compiler:Default.isl"
Name: chs; MessagesFile: "compiler:Languages\ChineseSimplified.isl"

[CustomMessages]
en.AppName=Clevert
chs.AppName=轻转换

[Files]
; Source: "7za.exe"; DestDir: "{tmp}"; Flags: deleteafterinstall
Source: "{tmp}\electron.zip"; DestDir: "{app}"; Flags: external

[Code]
procedure InitializeWizard();
begin
  if not DownloadTemporaryFile('https://registry.npmmirror.com/-/binary/electron/35.1.3/electron-v35.1.3-win32-x64.zip', 
    ExpandConstant('{tmp}\electron.zip'), '', nil) then
    RaiseException('Download failed');
end;

; [Run]
; Filename: "{tmp}\7za.exe"; Parameters: "x ""{tmp}\electron.zip"" -o""{app}"" * -r -aoa"; Flags: runhidden runascurrentuser

; [Icons]
; Name: "{commondesktop}\{cm:AppName}"; Filename: "{app}\electron.exe"

