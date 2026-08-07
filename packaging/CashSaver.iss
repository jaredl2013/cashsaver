#ifndef MyAppVersion
  #define MyAppVersion "1.0.0"
#endif
#ifndef StageDir
  #error StageDir must be provided by build-release.ps1
#endif
#ifndef OutputDir
  #error OutputDir must be provided by build-release.ps1
#endif

#define MyAppName "CashSaver Ad Builder"
#define MyPublisher "Lockwood IT Services"
#define DataDir "{commonappdata}\Lockwood IT Services\CashSaver Weekly Ad Builder"

[Setup]
AppId={{A64FDE7D-C23C-43E6-91F4-E32210761C79}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppName} {#MyAppVersion}
AppPublisher={#MyPublisher}
AppPublisherURL=https://lockwooditservices.com/
AppSupportURL=https://lockwooditservices.com/
AppUpdatesURL=https://github.com/jaredl2013/cashsaver/releases/latest
DefaultDirName={autopf}\Lockwood IT Services\CashSaver Weekly Ad Builder
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
PrivilegesRequired=admin
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir={#OutputDir}
OutputBaseFilename=CashSaver-Ad-Builder-Setup-{#MyAppVersion}
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
WizardImageFile=wizard-large.png
WizardSmallImageFile=wizard-small.png
SetupIconFile=app-icon.ico
CloseApplications=yes
RestartApplications=no
UninstallDisplayName={#MyAppName}
VersionInfoVersion={#MyAppVersion}.0
VersionInfoCompany={#MyPublisher}
VersionInfoDescription={#MyAppName} Installer
VersionInfoProductName={#MyAppName}
VersionInfoProductVersion={#MyAppVersion}

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; GroupDescription: "Shortcuts:"; Flags: checkedonce
Name: "lanaccess"; Description: "Allow other computers on this store network to open the ad builder"; GroupDescription: "Store network:"; Flags: checkedonce

[Dirs]
Name: "{#DataDir}"; Permissions: users-modify

[Files]
Source: "{#StageDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\{#MyAppName}"; Filename: "http://127.0.0.1:{code:GetAppPort}"; Comment: "Open {#MyAppName}"
Name: "{autoprograms}\Quick How-To"; Filename: "http://127.0.0.1:{code:GetAppPort}/how-to.html"; Comment: "Open the Weekly Ad Builder guide"
Name: "{autodesktop}\{#MyAppName}"; Filename: "http://127.0.0.1:{code:GetAppPort}"; Tasks: desktopicon; Comment: "Open {#MyAppName}"

[Run]
Filename: "{app}\node.exe"; Parameters: """{app}\install-service.js"""; WorkingDir: "{app}"; StatusMsg: "Starting Weekly Ad Builder in the background..."; Flags: runhidden waituntilterminated
Filename: "{sys}\netsh.exe"; Parameters: "advfirewall firewall delete rule name=""CashSaver Weekly Ad Builder"""; Flags: runhidden waituntilterminated; Tasks: lanaccess
Filename: "{sys}\netsh.exe"; Parameters: "advfirewall firewall add rule name=""CashSaver Weekly Ad Builder"" dir=in action=allow protocol=TCP localport={code:GetAppPort} profile=private"; Flags: runhidden waituntilterminated; Tasks: lanaccess
Filename: "http://127.0.0.1:{code:GetAppPort}"; Description: "Open Weekly Ad Builder"; Flags: shellexec postinstall skipifsilent nowait

[UninstallRun]
Filename: "{sys}\sc.exe"; Parameters: "stop weeklyadbuilder.exe"; Flags: runhidden waituntilterminated; RunOnceId: "StopWeeklyAdBuilder"
Filename: "{app}\node.exe"; Parameters: """{app}\uninstall-service.js"""; WorkingDir: "{app}"; Flags: runhidden waituntilterminated; RunOnceId: "RemoveWeeklyAdBuilder"
Filename: "{sys}\netsh.exe"; Parameters: "advfirewall firewall delete rule name=""CashSaver Weekly Ad Builder"""; Flags: runhidden waituntilterminated; RunOnceId: "RemoveWeeklyAdFirewall"

[Code]
var
  PasswordPage: TInputQueryWizardPage;
  ExistingConfig: Boolean;

function DataPath(): String;
begin
  Result := ExpandConstant('{#DataDir}');
end;

function DotEnvQuote(Value: String): String;
begin
  StringChangeEx(Value, '\', '\\', True);
  StringChangeEx(Value, '"', '\"', True);
  StringChangeEx(Value, #13, '', True);
  StringChangeEx(Value, #10, '', True);
  Result := '"' + Value + '"';
end;

// Reads PORT= out of an existing .env (upgrade case) so shortcuts and the
// firewall rule stay consistent with whatever port that install already uses.
function ReadExistingPort(): String;
var
  Lines: TArrayOfString;
  I: Integer;
  Line: String;
begin
  Result := '3000';
  if LoadStringsFromFile(DataPath() + '\.env', Lines) then
  begin
    for I := 0 to GetArrayLength(Lines) - 1 do
    begin
      Line := Lines[I];
      if (Length(Line) > 5) and (Copy(Line, 1, 5) = 'PORT=') then
      begin
        Result := Trim(Copy(Line, 6, Length(Line) - 5));
        Exit;
      end;
    end;
  end;
end;

// Used both by WriteInitialConfig and by {code:GetAppPort} in [Icons]/[Run].
function GetAppPort(Param: String): String;
begin
  if ExistingConfig then
    Result := ReadExistingPort()
  else if Assigned(PasswordPage) then
    Result := Trim(PasswordPage.Values[2])
  else
    Result := '3000';
end;

procedure InitializeWizard;
begin
  ExistingConfig := FileExists(DataPath() + '\.env');
  PasswordPage := CreateInputQueryPage(wpSelectDir,
    'Weekly Ad Builder Settings',
    'Choose the password used to open the ad builder.',
    'The Pexels key is optional and can be added later. Existing installations keep their current settings.');
  PasswordPage.Add('App login password:', True);
  PasswordPage.Add('Pexels API key (optional):', False);
  PasswordPage.Add('Port (leave as 3000 unless something else on this computer already uses it):', False);
  PasswordPage.Values[2] := '3000';
end;

function ShouldSkipPage(PageID: Integer): Boolean;
begin
  Result := ExistingConfig and (PageID = PasswordPage.ID);
end;

function NextButtonClick(CurPageID: Integer): Boolean;
var
  PortNum: Integer;
begin
  Result := True;
  if (CurPageID = PasswordPage.ID) then
  begin
    if Length(Trim(PasswordPage.Values[0])) < 6 then
    begin
      MsgBox('Please choose an app password with at least 6 characters.', mbError, MB_OK);
      Result := False;
      Exit;
    end;
    PortNum := StrToIntDef(Trim(PasswordPage.Values[2]), -1);
    if (PortNum < 1) or (PortNum > 65535) then
    begin
      MsgBox('Please enter a valid port number between 1 and 65535 (or just leave it as 3000).', mbError, MB_OK);
      Result := False;
      Exit;
    end;
  end;
end;

procedure StopExistingService;
var
  ResultCode: Integer;
begin
  Exec(ExpandConstant('{sys}\sc.exe'), 'stop weeklyadbuilder.exe', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Sleep(2500);
end;

procedure WriteInitialConfig;
var
  Lines: TArrayOfString;
  Secret: String;
begin
  if ExistingConfig then Exit;
  ForceDirectories(DataPath());
  Secret := GetSHA256OfString(PasswordPage.Values[0] + GetDateTimeString('yyyymmddhhnnsszzz', #0, #0));
  SetArrayLength(Lines, 18);
  Lines[0] := 'PORT=' + Trim(PasswordPage.Values[2]);
  Lines[1] := 'SHARED_PASSWORD=' + DotEnvQuote(PasswordPage.Values[0]);
  Lines[2] := 'ADMIN_PASSWORD=' + DotEnvQuote(PasswordPage.Values[0]);
  Lines[3] := 'SESSION_SECRET=' + DotEnvQuote(Secret);
  Lines[4] := 'PEXELS_API_KEY=' + DotEnvQuote(PasswordPage.Values[1]);
  Lines[5] := 'UPDATE_MANIFEST_URL=https://raw.githubusercontent.com/jaredl2013/cashsaver/main/release/update.json';
  Lines[6] := 'LICENSE_SERVER_URL=';
  Lines[7] := 'LICENSE_KEY=';
  Lines[8] := 'LICENSE_GRACE_HOURS=168';
  Lines[9] := 'SMTP_HOST=';
  Lines[10] := 'SMTP_PORT=587';
  Lines[11] := 'SMTP_USER=';
  Lines[12] := 'SMTP_PASS=';
  Lines[13] := 'SMTP_FROM=';
  Lines[14] := 'REMINDER_TO=';
  Lines[15] := 'TWILIO_ACCOUNT_SID=';
  Lines[16] := 'TWILIO_AUTH_TOKEN=';
  Lines[17] := 'TWILIO_FROM_NUMBER=';
  if not SaveStringsToUTF8FileWithoutBOM(DataPath() + '\.env', Lines, False) then
    RaiseException('Could not create the Weekly Ad Builder configuration file.');
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssInstall then StopExistingService;
  if CurStep = ssPostInstall then WriteInitialConfig;
end;

function InitializeUninstall(): Boolean;
begin
  Result := True;
  MsgBox('Your saved flyers, products, photos, and settings will be kept in:' + #13#10 + DataPath(), mbInformation, MB_OK);
end;
