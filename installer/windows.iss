; Inno Setup script for online installer

; npm i -g innosetup-compiler
; innosetup-compiler windows.iss --gui --verbose
; https://stackoverflow.com/a/66100456/
; https://github.com/kkocdko/vscode/blob/single-windows-installer/build/win32/code.iss#L7-L10

[Setup]
AppId=clevert
AppVersion=1.0.0
AppName={cm:AppName}
AppVerName={cm:AppName}
DefaultDirName={autopf}\clevert
DisableWelcomePage=yes
PrivilegesRequired=lowest
UsePreviousLanguage=no
DisableProgramGroupPage=yes
WizardStyle=modern
LicenseFile=..\LICENSE

[Languages]
Name: en; MessagesFile: "compiler:Default.isl"
Name: chs; MessagesFile: "compiler:Languages\ChineseSimplified.isl"
; https://github.com/kira-96/Inno-Setup-Chinese-Simplified-Translation/raw/refs/heads/main/ChineseSimplified.isl
; %AppData%\npm\node_modules\innosetup-compiler\bin\Languages

[CustomMessages]
en.AppName=Clevert
en.CreateDesktopIcon=Create desktop icon
; 暂定此名，以后再改
chs.AppName=轻转换
chs.CreateDesktopIcon=创建桌面图标

[Icons]
Name: "{autodesktop}\{cm:AppName}"; Filename: "{app}\electron\electron.exe"; Tasks: desktopicon

[Tasks]
Name: desktopicon; Description: {cm:CreateDesktopIcon};

[UninstallDelete]
Type: filesandordirs; Name: "{app}"

[Code]
var
  DownloadPage: TDownloadWizardPage;
  ResultCode: Integer;

function OnDownloadProgress(const Url, FileName: String; const Progress, ProgressMax: Int64): Boolean;
begin
  if Progress = ProgressMax then
    Log(Format('Downloaded file to {tmp}: %s', [FileName]));
  Result := True;
end;

procedure InitializeWizard;
begin
  // WizardForm.Color := clBlack;
  // WizardForm.Font.Color := clWhite;
  // WizardForm.MainPanel.Color := clBlack;
  DownloadPage := CreateDownloadPage(SetupMessage(msgWizardPreparing), SetupMessage(msgPreparingDesc), @OnDownloadProgress);
  DownloadPage.ShowBaseNameInsteadOfUrl := True;
end;

function NextButtonClick(CurPageID: Integer): Boolean;
begin
  if CurPageID = wpReady then
  begin
    DownloadPage.Clear;
    // todo: use language to determine the url, use npmmirror or others?
    DownloadPage.Add('https://registry.npmmirror.com/-/binary/electron/35.1.3/electron-v35.1.3-win32-x64.zip', 'electron.zip', '');
    DownloadPage.Add('https://registry.npmmirror.com/7zip-bin/latest/files/win/x64/7za.exe', '7za.exe', '');
    DownloadPage.Add('https://cdn.jsdelivr.net/npm/clevert/index.js', 'index.js', '');
    DownloadPage.Show;
    try
      try
        DownloadPage.Download; // this downloads the files to {tmp}
        ForceDirectories(ExpandConstant('{app}\electron'));
        Exec(ExpandConstant('{tmp}\7za.exe'), ExpandConstant('x "{tmp}\electron.zip" -o"{app}\electron" -y'), '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
        RenameFile(ExpandConstant('{tmp}\index.js'), ExpandConstant('{app}\index.js'));
        Result := True;
      except
        if DownloadPage.AbortedByUser then
          Log('Aborted by user.')
        else
          SuppressibleMsgBox(AddPeriod(GetExceptionMessage), mbCriticalError, MB_OK, IDOK);
        Result := False;
      end;
    finally
      DownloadPage.Hide;
    end;
  end
  else
    Result := True;
end;
