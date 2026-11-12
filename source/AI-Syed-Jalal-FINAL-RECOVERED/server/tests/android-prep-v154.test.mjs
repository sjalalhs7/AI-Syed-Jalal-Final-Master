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
  assert.match(gradle, /com\.google\.androidbrowserhelper:androidbrowserhelper:2\.7\.2/);
  // Browser Helper calls setComponentEnabledSetting on this class at launch;
  // omitting it made the previously delivered APK crash on Android 15.
  assert.match(manifest, /android:name="com\.google\.androidbrowserhelper\.trusted\.ManageDataLauncherActivity"\s+android:exported="false"/);
  assert.match(manifest, /android:name="android\.support\.customtabs\.trusted\.MANAGE_SPACE_URL"/);
  assert.match(manifest, /https:\/\/ai-syed-jalal-live\.pages\.dev\//);
  assert.match(strings, /https:\/\/ai-syed-jalal-live\.pages\.dev/);
  assert.match(manifest, /android:exported="true"/);
  assert.doesNotMatch(manifest, /DelegationService|POST_NOTIFICATIONS|READ_EXTERNAL_STORAGE|WRITE_EXTERNAL_STORAGE|MANAGE_EXTERNAL_STORAGE|RECORD_AUDIO|FileProvider/);
  assert.ok(existsSync(new URL('app/src/main/res/drawable-nodpi/ic_launcher.png', root)));
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
