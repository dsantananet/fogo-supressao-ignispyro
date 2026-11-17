import { readFileSync, writeFileSync, copyFileSync, mkdirSync } from 'node:fs';

const root = 'android/app';
const main = `${root}/src/main`;
const java = `${main}/java/pt/ignispyro/fogosupressao`;
for (const file of ['MainActivity.java', 'ReleaseUpdates.java', 'DriveAuthorization.java']) {
  copyFileSync(`android-src/${file}`, `${java}/${file}`);
}

const res = `${main}/res`;
mkdirSync(`${res}/mipmap-anydpi`, { recursive: true });
mkdirSync(`${res}/mipmap-anydpi-v26`, { recursive: true });
mkdirSync(`${res}/drawable`, { recursive: true });
mkdirSync(`${res}/values`, { recursive: true });
writeFileSync(`${res}/values/suppression_colors.xml`, '<resources><color name="suppression_background">#811c28</color></resources>');
copyFileSync('android-src/fogo_launcher_art.xml', `${res}/mipmap-anydpi/fogo_launcher.xml`);
copyFileSync('android-src/fogo_launcher_art.xml', `${res}/drawable/fogo_launcher_art.xml`);
writeFileSync(`${res}/mipmap-anydpi-v26/fogo_launcher.xml`, `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/suppression_background" />
    <foreground>
        <inset android:drawable="@drawable/fogo_launcher_art" android:inset="12%" />
    </foreground>
</adaptive-icon>
`);

const manifest = `${main}/AndroidManifest.xml`;
const manifestXml = readFileSync(manifest, 'utf8');
const locationPermissions = manifestXml.includes('android.permission.ACCESS_FINE_LOCATION') ? '' :
  '    <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />\n' +
  '    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />\n';
writeFileSync(manifest, manifestXml
  .replace('</manifest>', locationPermissions + '</manifest>')
  .replace('android:allowBackup="true"', 'android:allowBackup="false"')
  .replaceAll(/@mipmap\/ic_launcher(?:_round)?/g, '@mipmap/fogo_launcher'));

const gradle = `${root}/build.gradle`;
const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
const [major, minor, patch] = version.split('.').map(Number);
writeFileSync(gradle, readFileSync(gradle, 'utf8')
  .replace(/dependencies \{(?!\s*implementation 'com.google.android.gms:play-services-auth:)/,
    match => match + "\n    implementation 'com.google.android.gms:play-services-auth:22.0.0'")
  .replace(/versionCode \d+/, `versionCode ${major * 10000 + minor * 100 + patch}`)
  .replace(/versionName "[^"]+"/, `versionName "${version}"`));
