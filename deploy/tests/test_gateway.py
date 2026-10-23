import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('gateway', Path(__file__).parents[1] / 'gateway.py')
gateway = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gateway)
OLD = 'a' * 40
NEW = 'b' * 40


class FakeDeployer(gateway.Deployer):
    def __init__(self, root):
        super().__init__(root)
        self.calls = []
        self.tips = [NEW, NEW]
        self.ci_passed = True
        self.fail_build = False
        self.fail_health = False
        self.fail_up = False

    def _fetch_tip(self):
        return self.tips.pop(0)

    def _require_ci(self, sha):
        if not self.ci_passed:
            raise gateway.DeploymentError('CI failed')

    def make_release(self, sha, tag=None):
        release = self.root / 'releases' / sha
        release.mkdir(parents=True)
        (release / 'REVISION').write_text(sha + '\n')
        (release / 'release.env').write_text(f'ISOLATOR_RELEASE={tag or sha}\nISOLATOR_PORT=18180\n')
        return release

    def _stage(self, sha):
        return self.make_release(sha)

    def _build(self, release, sha):
        self.calls.append(('build', sha))
        if self.fail_build:
            raise gateway.DeploymentError('Image build failed')

    def _up(self, release):
        self.calls.append(('up', release.name))
        if self.fail_up and release.name == NEW:
            raise gateway.DeploymentError('Partial compose failure')

    def _smoke(self, release):
        self.calls.append(('smoke', release.name))
        if self.fail_health and release.name == NEW:
            raise gateway.DeploymentError('Wrong frontend revision')


class DeploymentTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name).resolve()
        self.deployer = FakeDeployer(self.root)
        self.previous = self.deployer.make_release(OLD, '20261023-previous')
        self.deployer._activate(self.previous)
        self.original_env = (self.root / 'release.env').read_text()

    def assert_previous(self):
        self.assertEqual(self.deployer._current(), self.previous)
        self.assertEqual((self.root / 'release.env').read_text(), self.original_env)

    def test_only_exact_commands_and_commit_shas_are_accepted(self):
        self.assertEqual(gateway.parse_command(f'deploy {NEW}'), ('deploy', NEW))
        for command in ('bash', f'deploy {NEW}; id', f'deploy {NEW}\n', 'deploy main',
                        f'rollback ../{NEW}', f' deploy {NEW}'):
            with self.subTest(command=command), self.assertRaises(gateway.DeploymentError):
                gateway.parse_command(command)

    def test_failed_ci_never_builds_or_changes_the_running_release(self):
        self.deployer.ci_passed = False
        with self.assertRaises(gateway.DeploymentError):
            self.deployer.deploy(NEW)
        self.assert_previous()
        self.assertEqual(self.deployer.calls, [])

    def test_newer_push_during_build_does_not_replace_production(self):
        self.deployer.tips = [NEW, 'c' * 40]
        self.deployer.deploy(NEW)
        self.assert_previous()
        self.assertEqual(self.deployer.calls, [('build', NEW)])

    def test_build_failure_preserves_old_images_and_metadata(self):
        self.deployer.fail_build = True
        with self.assertRaises(gateway.DeploymentError):
            self.deployer.deploy(NEW)
        self.assert_previous()
        self.assertNotIn(('up', NEW), self.deployer.calls)

    def test_partial_container_update_rolls_back_to_original_image_tag(self):
        self.deployer.fail_up = True
        with self.assertRaisesRegex(gateway.DeploymentError, 'previous release restored'):
            self.deployer.deploy(NEW)
        self.assert_previous()
        self.assertIn(('up', OLD), self.deployer.calls)
        self.assertEqual(json.loads((self.root / 'last-deployment.json').read_text())['status'], 'rolled_back')

    def test_wrong_frontend_revision_rolls_back_before_success_is_recorded(self):
        self.deployer.fail_health = True
        with self.assertRaises(gateway.DeploymentError):
            self.deployer.deploy(NEW)
        self.assert_previous()
        self.assertIn(('smoke', OLD), self.deployer.calls)

    def test_success_can_be_rolled_back_only_while_that_commit_is_active(self):
        self.deployer.deploy(NEW)
        self.assertEqual(self.deployer._current().name, NEW)
        with self.assertRaises(gateway.DeploymentError):
            self.deployer.rollback('c' * 40)
        self.assertEqual(self.deployer._current().name, NEW)
        self.deployer.rollback(NEW)
        self.assert_previous()
        with self.assertRaises(gateway.DeploymentError):
            self.deployer.rollback(NEW)

    def test_rollback_cannot_escape_the_application_release_directory(self):
        outside = self.root / 'another-project'
        outside.mkdir()
        (outside / 'REVISION').write_text(OLD)
        (outside / 'release.env').write_text('ISOLATOR_RELEASE=another-project')
        with self.assertRaises(gateway.DeploymentError):
            self.deployer._release(outside)


if __name__ == '__main__':
    unittest.main()
