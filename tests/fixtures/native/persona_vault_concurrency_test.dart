import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_secure_storage_windows/flutter_secure_storage_windows.dart';
import 'package:plug_agente/infrastructure/stores/flutter_secure_token_secret_store.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test('private cross-process DPAPI writes preserve disjoint keys', () async {
    final path = Platform.environment['PERSONA_VAULT_FIXTURE_ROOT'];
    final role = Platform.environment['PERSONA_VAULT_FIXTURE_ROLE'];
    if (path == null ||
        !['a', 'b', 'verify', 'hold', 'blocked'].contains(role) ||
        !Platform.isWindows) {
      throw StateError('Explicit isolated Windows fixture required.');
    }
    final root = Directory(path).resolveSymbolicLinksSync();
    if (Directory(root).parent.path !=
            Directory.systemTemp.resolveSymbolicLinksSync() ||
        !root
            .split(Platform.pathSeparator)
            .last
            .startsWith('se7e_vault_concurrency_')) {
      throw StateError('Invalid private fixture path.');
    }
    final vault = Directory('$root/vault')..createSync();
    if (role == 'hold') {
      final owner = await File('${vault.path}/flutter_secure_storage.dat.lock')
          .open(mode: FileMode.append);
      try {
        await owner.lock();
        await File('$root/held').writeAsString('held');
        await Future<void>.delayed(const Duration(seconds: 80));
        fail('Controller must terminate the private lock holder.');
      } finally {
        await owner.close();
      }
      return;
    }
    debugDefaultTargetPlatformOverride = TargetPlatform.windows;
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(
          const MethodChannel('plugins.flutter.io/path_provider'),
          (call) async {
            if (call.method != 'getApplicationSupportDirectory')
              throw StateError('Unsupported lookup.');
            return vault.path;
          },
        );
    FlutterSecureStorageWindows.registerWith();
    final store = FlutterSecureTokenSecretStore(keyPrefix: 'fixture_');
    if (role == 'blocked') {
      final cipher = File('${vault.path}/flutter_secure_storage.dat');
      final previous = await cipher.readAsBytes();
      final elapsed = Stopwatch()..start();
      await expectLater(
        store.saveSecret('blocked', 'must_not_persist'),
        throwsA(isA<FileSystemException>()),
      );
      expect(elapsed.elapsed, lessThan(const Duration(seconds: 30)));
      expect(await cipher.readAsBytes(), previous);
      return;
    }
    if (role == 'verify') {
      var missing = 0;
      for (final writer in ['a', 'b']) {
        for (var i = 0; i < 100; i++) {
          if (await store.readSecret('${writer}_$i') !=
              'synthetic_${writer}_$i')
            missing++;
        }
      }
      expect(
        missing,
        0,
        reason: 'All 200 disjoint synthetic keys must survive both writers.',
      );
      final cipher = File('${vault.path}/flutter_secure_storage.dat');
      final previous = await cipher.readAsBytes();
      const invalid = <int>[1, 2, 3];
      await cipher.writeAsBytes(invalid, flush: true);
      try {
        await expectLater(store.readSecret('a_0'), throwsA(isA<Exception>()));
        expect(await cipher.readAsBytes(), invalid);
        await expectLater(
          store.saveSecret('must_not_replace', 'synthetic'),
          throwsA(isA<Exception>()),
        );
        expect(await cipher.readAsBytes(), invalid);
      } finally {
        await cipher.writeAsBytes(previous, flush: true);
      }
      expect(await store.readSecret('a_0'), 'synthetic_a_0');
      expect(await store.readSecret('b_99'), 'synthetic_b_99');
      expect(await store.readSecret('blocked'), isNull);
      return;
    }
    await File('$root/$role.ready').writeAsString('ready');
    final deadline = DateTime.now().add(const Duration(seconds: 60));
    while (!File('$root/go').existsSync()) {
      if (DateTime.now().isAfter(deadline))
        throw StateError('Fixture barrier timed out.');
      await Future<void>.delayed(const Duration(milliseconds: 20));
    }
    for (var i = 0; i < 100; i++) {
      await store.saveSecret('${role}_$i', 'synthetic_${role}_$i');
    }
  }, timeout: const Timeout(Duration(seconds: 90)));
}
