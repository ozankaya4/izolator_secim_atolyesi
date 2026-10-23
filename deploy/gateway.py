#!/usr/bin/python3
"""Restricted SSH entry point. Installed root-owned outside the Git checkout."""
import fcntl
import json
import os
from pathlib import Path
import re
import signal
import subprocess
import sys
import tarfile
import tempfile
import time
import urllib.request
from datetime import datetime, timezone

ROOT = Path('/opt/izolator-secim-atolyesi')
RUNTIME = Path('/etc/izolator/compose.yaml')
REPOSITORY = 'ozankaya4/izolator_secim_atolyesi'
BUILDER = 'izolator-builder'


class DeploymentError(RuntimeError):
    pass


def parse_command(command):
    match = re.fullmatch(r'(deploy|rollback) ([0-9a-f]{40})', command)
    if not match:
        raise DeploymentError('Only deploy <40-char SHA> or rollback <40-char SHA> is allowed.')
    return match.groups()


class Deployer:
    def __init__(self, root=ROOT, runtime=RUNTIME):
        self.root = root.resolve()
        self.runtime = runtime

    def _run(self, *args, capture=False, timeout=120, **kwargs):
        result = subprocess.run(
            [str(arg) for arg in args], check=True, text=True,
            stdout=subprocess.PIPE if capture else kwargs.pop('stdout', None), timeout=timeout, **kwargs,
        )
        return result.stdout.strip() if capture else None

    def _fetch_tip(self):
        repository = self.root / 'source.git'
        if not repository.exists():
            self._run('git', 'init', '--bare', '--initial-branch=main', repository)
        self._run('git', '--git-dir', repository, 'fetch', '--depth=1', '--no-tags',
                  f'https://github.com/{REPOSITORY}.git',
                  '+refs/heads/main:refs/heads/main')
        return self._run('git', '--git-dir', repository, 'rev-parse', 'refs/heads/main', capture=True)

    def _require_ci(self, sha):
        request = urllib.request.Request(
            f'https://api.github.com/repos/{REPOSITORY}/commits/{sha}/check-runs'
            '?filter=latest&check_name=verify&per_page=100',
            headers={'Accept': 'application/vnd.github+json', 'User-Agent': 'izolator-deploy'},
        )
        with urllib.request.urlopen(request, timeout=30) as response:
            checks = json.load(response)['check_runs']
        if not any(check['name'] == 'verify' and check['status'] == 'completed'
                   and check['conclusion'] == 'success'
                   and check.get('app', {}).get('slug') == 'github-actions' for check in checks):
            raise DeploymentError('The verify job must succeed for this exact commit first.')

    def _release(self, value):
        path = Path(value).resolve(strict=True)
        if path.parent != (self.root / 'releases').resolve():
            raise DeploymentError('Release is outside this application directory.')
        if not (path / 'release.env').is_file() or not (path / 'REVISION').is_file():
            raise DeploymentError('Release metadata is incomplete.')
        return path

    def _current(self):
        return self._release(self.root / 'current')

    def _stage(self, sha):
        release = self.root / 'releases' / sha
        if release.exists():
            release = self._release(release)
            if (release / 'REVISION').read_text().strip() != sha:
                raise DeploymentError('Existing release has a different revision.')
            return release
        stage = Path(tempfile.mkdtemp(prefix=f'.{sha}-', dir=self.root / 'releases'))
        archive = self.root / f'.archive-{sha}.tar'
        try:
            with archive.open('w') as output:
                self._run('git', '--git-dir', self.root / 'source.git', 'archive', sha, stdout=output)
            with tarfile.open(archive) as source:
                source.extractall(stage, filter='data')
            (stage / 'REVISION').write_text(sha + '\n')
            (stage / 'release.env').write_text(f'ISOLATOR_RELEASE={sha}\nISOLATOR_PORT=18180\n')
            (stage / 'release.env').chmod(0o640)
            (stage / 'frontend/public/release.json').write_text(json.dumps({'commit': sha}) + '\n')
            stage.rename(release)
        finally:
            archive.unlink(missing_ok=True)
        return release

    def _build(self, release, sha):
        for service, dockerfile in [('api', 'backend/Dockerfile'), ('web', 'frontend/Dockerfile')]:
            args = ['docker', 'buildx', 'build', '--builder', BUILDER, '--load', '--pull',
                    '--tag', f'izolator-{service}:{sha}', '--file', release / dockerfile]
            if service == 'web':
                args += ['--build-arg', 'VITE_BASE_PATH=/izolator/']
            self._run(*args, release, timeout=900)

    def _up(self, release):
        self._run('docker', 'compose', '-p', 'izolator-prod', '--project-directory', release,
                  '--env-file', release / 'release.env', '-f', self.runtime,
                  'up', '-d', '--no-build', '--pull', 'never', '--wait', '--wait-timeout', '120',
                  'api', 'web', timeout=180)

    def _get(self, path, status=False):
        args = ['curl', '--silent', '--show-error', '--max-time', '20', '--retry', '2',
                '--resolve', 'ozankaya.net:443:127.0.0.1']
        args += ['-o', '/dev/null', '-w', '%{http_code}'] if status else ['--fail']
        return self._run(*args, 'https://ozankaya.net' + path, capture=True)

    def _smoke(self, release):
        if json.loads(self._get('/izolator/api/health')).get('status') != 'ok':
            raise DeploymentError('API health check failed.')
        if (release / 'frontend/public/release.json').exists():
            if json.loads(self._get('/izolator/release.json')).get('commit') != (release / 'REVISION').read_text().strip():
                raise DeploymentError('The served frontend revision does not match the release.')
        html = self._get('/izolator/')
        asset = re.search(r'src="(/izolator/assets/[^" ]+\.js)"', html)
        if not asset:
            raise DeploymentError('Frontend asset does not use /izolator/.')
        self._get(asset[1])
        if self._get('/izolator/catalog-images/AM-004.png', status=True) != '200':
            raise DeploymentError('Catalog image is unavailable.')
        if self._get('/', status=True) != '404' or self._get('/izolator', status=True) != '308':
            raise DeploymentError('Host routing changed unexpectedly.')

    def _atomic_text(self, target, content):
        temporary = target.with_name(target.name + '.next')
        temporary.write_text(content)
        temporary.chmod(0o640)
        temporary.replace(target)

    def _activate(self, release):
        temporary = self.root / '.current.next'
        temporary.unlink(missing_ok=True)
        temporary.symlink_to(release.relative_to(self.root))
        temporary.replace(self.root / 'current')
        self._atomic_text(self.root / 'release.env', (release / 'release.env').read_text())

    def _record(self, **record):
        record['at'] = datetime.now(timezone.utc).isoformat()
        self._atomic_text(self.root / 'last-deployment.json', json.dumps(record, indent=2) + '\n')

    def deploy(self, sha):
        if self._fetch_tip() != sha:
            print(f'ISOLATOR_SKIPPED_SHA={sha}', flush=True)
            return
        self._require_ci(sha)
        previous = self._current()
        if (previous / 'REVISION').read_text().strip() == sha:
            self._smoke(previous)
            print(f'ISOLATOR_DEPLOYED_SHA={sha}', flush=True)
            return
        release = self._stage(sha)
        self._build(release, sha)
        # A newer push may have arrived during the build; do not publish stale code.
        if self._fetch_tip() != sha:
            print(f'ISOLATOR_SKIPPED_SHA={sha}', flush=True)
            return
        try:
            self._up(release)
            self._smoke(release)
            self._activate(release)
            self._record(status='success', commit=sha, previous=str(previous))
        except BaseException as failure:
            print(f'Deployment failed; restoring {previous.name}: {failure}', flush=True)
            try:
                self._up(previous)
                self._smoke(previous)
                self._activate(previous)
                self._record(status='rolled_back', commit=sha, previous=str(previous), error=str(failure))
            except BaseException as recovery:
                self._record(status='rollback_failed', commit=sha, previous=str(previous), error=str(recovery))
                raise DeploymentError(f'ROLLBACK FAILED: {recovery}') from failure
            raise DeploymentError('Deployment failed; previous release restored.') from failure
        print(f'ISOLATOR_DEPLOYED_SHA={sha}', flush=True)

    def rollback(self, sha):
        record = json.loads((self.root / 'last-deployment.json').read_text())
        current = self._current()
        if (record.get('status') != 'success' or record.get('commit') != sha
                or (current / 'REVISION').read_text().strip() != sha):
            raise DeploymentError('Refusing rollback: this is not the active successful deployment.')
        previous = self._release(record['previous'])
        self._up(previous)
        self._smoke(previous)
        self._activate(previous)
        self._record(status='rolled_back', commit=sha, previous=str(previous))
        print(f'ISOLATOR_ROLLED_BACK_SHA={sha}', flush=True)


def main():
    try:
        operation, sha = parse_command(os.environ.get('SSH_ORIGINAL_COMMAND', ''))
        # Catch interrupted SSH sessions while changing containers so recovery can run.
        def interrupted(signum, _frame):
            raise DeploymentError(f'Deployment interrupted by signal {signum}.')
        for signum in (signal.SIGHUP, signal.SIGINT, signal.SIGTERM):
            signal.signal(signum, interrupted)
        with (ROOT / 'deploy.lock').open('a') as lock:
            deadline = time.monotonic() + 1200
            while True:
                try:
                    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
                    break
                except BlockingIOError:
                    if time.monotonic() > deadline:
                        raise DeploymentError('Timed out waiting for the deployment lock.')
                    time.sleep(1)
            getattr(Deployer(), operation)(sha)
    except Exception as failure:
        print(f'ERROR: {failure}', file=sys.stderr, flush=True)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
