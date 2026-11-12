import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

const root = new URL('../../../../android/', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');

test('provisional Android TWA targets API 36 and the verified website origin', () => {
  const gradle = read('app/build.gradle');
  const manifest = read('app/src/main/AndroidManifest.xml');
  const strings = read('app/src/main/res/values/strings.xml');
  assert.match(gradle, /compileSdk\s+36/);
  assert.match(gradle, /targetSdk\s+36/);
  assert.match(gradle, /applicationId 'dev\.pages\.ai_syed_jalal_live\.mobile'/);
  assert.match(gradle, /versionCode\s+3/);
  assert.match(gradle, /versionName '1\.0\.2'/);
  assert.match(gradle, /com\.google\.androidbrowserhelper:androidbrowserhelper:2\.7\.2/);
  // Browser Helper calls setComponentEnabledSetting on this class at launch;
  // omitting it made the previously delivered APK crash on Android 15.
  assert.match(manifest, /android:name="com\.google\.androidbrowserhelper\.trusted\.ManageDataLauncherActivity"\s+android:exported="false"/);
  assert.match(manifest, /android:name="android\.support\.customtabs\.trusted\.MANAGE_SPACE_URL"/);
  assert.match(manifest, /android:name="dev\.pages\.ai_syed_jalal_live\.twa\.SafeLauncherActivity"/);
  const launcher = read('app/src/main/java/dev/pages/ai_syed_jalal_live/twa/SafeLauncherActivity.java');
  assert.match(launcher, /CustomTabsClient\.getPackageName\(context,\s*suggestedProvider == null/);
  assert.match(launcher, /Collections\.singletonList\(suggestedProvider\)/);
  assert.match(launcher, /import android\.content\.Intent;/);
  assert.match(launcher, /import android\.net\.Uri;/);
  assert.match(launcher, /protected Uri getUrlForIntent\(Intent intent\)/);
  assert.match(launcher, /TRUSTED_HOST\.equalsIgnoreCase\(uri\.getHost\(\)\)/);
  assert.match(launcher, /uri\.getUserInfo\(\) == null/);
  assert.match(launcher, /uri\.getPort\(\) == -1 \|\| uri\.getPort\(\) == 443/);
  assert.match(manifest, /android\.support\.customtabs\.action\.CustomTabsService/);
  assert.match(launcher, /showBrowserNeeded\(\)/);
  assert.match(launcher, /TwaLauncher\.CCT_FALLBACK_STRATEGY\.launch/);
  assert.match(manifest, /https:\/\/ai-syed-jalal-live\.pages\.dev\//);
  assert.match(strings, /https:\/\/ai-syed-jalal-live\.pages\.dev/);
  assert.match(manifest, /android:exported="true"/);
  assert.doesNotMatch(manifest, /DelegationService|POST_NOTIFICATIONS|READ_EXTERNAL_STORAGE|WRITE_EXTERNAL_STORAGE|MANAGE_EXTERNAL_STORAGE|RECORD_AUDIO|FileProvider/);
  assert.ok(existsSync(new URL('app/src/main/res/drawable-nodpi/ic_launcher.png', root)));
});

test('website association names the candidate app and its public signing certificate', () => {
  const links = JSON.parse(readFileSync(new URL('../../frontend/.well-known/assetlinks.json', import.meta.url), 'utf8'));
  assert.equal(links.length, 1);
  assert.deepEqual(links[0].relation, ['delegate_permission/common.handle_all_urls']);
  assert.deepEqual(links[0].target, {
    namespace: 'android_app',
    package_name: 'dev.pages.ai_syed_jalal_live.mobile',
    sha256_cert_fingerprints: ['7C:EE:6A:85:C1:33:5F:20:03:8C:5E:4D:40:54:95:DD:E6:44:4B:B2:3A:18:F3:A1:72:E0:33:91:AB:B7:9E:EA']
  });
});

test('Gradle wrapper and release behavior avoid storing signing credentials', () => {
  const properties = read('gradle/wrapper/gradle-wrapper.properties');
  assert.match(properties, /gradle-8\.14\.3-bin\.zip/);
  assert.match(properties, /distributionSha256Sum=bd71102213493060956ec229d946beee57158dbd89d0e62b91bca0fa2c5f3531/);
  const wrapperHash = createHash('sha256').update(readFileSync(new URL('gradle/wrapper/gradle-wrapper.jar', root))).digest('hex');
  assert.equal(wrapperHash, '7d3a4ac4de1c32b59bc6a4eb8ecb8e612ccd0cf1ae1e99f66902da64df296172');
  const gradle = read('app/build.gradle');
  assert.doesNotMatch(gradle, /signingConfig\s+signingConfigs/);
  assert.match(read('.gitignore'), /\*\.jks/);
  assert.match(read('README.md'), /UNSIGNED|unsigned/);
});
