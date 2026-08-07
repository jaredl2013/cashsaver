#ifndef MyAppVersion
  #define MyAppVersion "1.0.0"
#endif
#ifndef StageDir
  #error StageDir must be provided by build-release.ps1
#endif
#ifndef OutputDir
  #error OutputDir must be provided by build-release.ps1
#endif

#define MyAppName "CashSaver Weekly Ad Builder"
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
OutputBaseFilename=CashSaver-Weekly-Ad-Builder-Setup-{#MyAppVersion}
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
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
Name: "{autoprograms}\{#MyAppName}"; Filename: "http://127.0.0.1:3000"; Comment: "Open {#MyAppName}"
Name: "{autoprograms}\Quick How-To"; Filename: "http://127.0.0.1:3000/how-to.html"; Comment: "Open the Weekly Ad Builder guide"
Name: "{autodesktop}\{#MyAppName}"; Filename: "http://127.0.0.1:3000"; Tasks: desktopicon; Comment: "Open {#MyAppName}"

[Run]
Filename: "{app}\node.exe"; Parameters: """{app}\install-service.js"""; WorkingDir: "{app}"; StatusMsg: "Starting Weekly Ad Builder in the background..."; Flags: runhidden waituntilterminated
Filename: "{sys}\netsh.exe"; Parameters: "advfirewall firewall delete rule name=""CashSaver Weekly Ad Builder"""; Flags: runhidden waituntilterminated; Tasks: lanaccess
Filename: "{sys}\netsh.exe"; Parameters: "advfirewall firewall add rule name=""CashSaver Weekly Ad Builder"" dir=in action=allow protocol=TCP localport=3000 profile=private"; Flags: runhidden waituntilterminated; Tasks: lanaccess
Filename: "http://127.0.0.1:3000"; Description: "Open Weekly Ad Builder"; Flags: shellexec postinstall skipifsilent nowait

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

procedure InitializeWizard;
begin
  ExistingConfig := FileExists(DataPath() + '\.env');
  PasswordPage := CreateInputQueryPage(wpSelectDir,
    'Weekly Ad Builder Settings',
    'Choose the password used to open the ad builder.',
    'The Pexels key is optional and can be added later. Existing installations keep their current settings.');
  PasswordPage.Add('App login password:', True);
  PasswordPage.Add('Pexels API key (optional):', False);
end;

function ShouldSkipPage(PageID: Integer): Boolean;
begin
  Result := ExistingConfig and (PageID = PasswordPage.ID);
end;

function NextButtonClick(CurPageID: Integer): Boolean;
begin
  Result := True;
  if (CurPageID = PasswordPage.ID) and (Length(Trim(PasswordPage.Values[0])) < 6) then
  begin
    MsgBox('Please choose an app password with at least 6 characters.', mbError, MB_OK);
    Result := False;
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
  Secret := GetSHA256OfString(PasswordPage.Values[0] + GetDateTimeString('yyyymmddhhnnsszzz', '', ''));
  SetArrayLength(Lines, 18);
  Lines[0] := 'PORT=3000';
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
