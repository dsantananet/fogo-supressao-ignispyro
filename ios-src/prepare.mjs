import {execFileSync} from 'node:child_process';
import {readFileSync, writeFileSync} from 'node:fs';

const clientId = '1019774540141-fabs9q6iq9ki1trv3h4s3vooena9eqem.apps.googleusercontent.com';
const scheme = clientId.split('.').reverse().join('.');
const app = 'ios/App/App';

function change(path, before, after) {
  const source = readFileSync(path, 'utf8');
  if (!source.includes(before)) throw new Error('Template iOS inesperado em ' + path);
  writeFileSync(path, source.replace(before, after));
}

change('ios/App/Podfile', "target 'App' do", "target 'App' do\n  pod 'GoogleSignIn', '9.0.0'");
change(app + '/Base.lproj/Main.storyboard',
  'customClass="CAPBridgeViewController" customModule="Capacitor"',
  'customClass="SuppressionBridgeViewController" customModule="App" customModuleProvider="target"');
const delegate = app + '/AppDelegate.swift';
change(delegate, 'import Capacitor', 'import Capacitor\nimport GoogleSignIn');
const callback = 'return ApplicationDelegateProxy.shared.application(app, open: url, options: options)';
change(delegate, callback, 'if GIDSignIn.sharedInstance.handle(url) { return true }\n        ' + callback);
writeFileSync(delegate, readFileSync(delegate, 'utf8') + '\n' +
  readFileSync('ios-src/DriveAuthorization.swift', 'utf8'));

for (const command of [
  'Add :GIDClientID string ' + clientId,
  'Add :CFBundleURLTypes array',
  'Add :CFBundleURLTypes:0 dict',
  'Add :CFBundleURLTypes:0:CFBundleURLSchemes array',
  'Add :CFBundleURLTypes:0:CFBundleURLSchemes:0 string ' + scheme
]) {
  execFileSync('/usr/libexec/PlistBuddy', ['-c', command, app + '/Info.plist']);
}

execFileSync('pod', ['install'], {cwd:'ios/App', stdio:'inherit'});
