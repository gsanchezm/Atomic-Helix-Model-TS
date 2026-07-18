// =============================================================================
// AHM Execution Helix — Jenkins declarative-pipeline equivalent
//
// Translates .github/workflows/ahm-execution-helix.yml (the consolidated GHA
// pipeline) into Jenkins' declarative-pipeline DSL. Same 14-profile job
// inventory (from ci/pipeline.config.json) plus the OmniPizza-release
// resolver, same container image pins, same matrix dimensions, same
// 5-shared-script call sequence (setup-environment.sh / start-stack.sh /
// run-suite.sh / collect-artifacts.sh / teardown.sh), same
// standard-user-writes serialization semantics. This file does not invent
// new stages, tags, or gates beyond what ci/pipeline.config.json and the
// reference workflow already declare — see
// .superpowers/sdd/task-3-ground-truth.md for the authoritative per-profile
// mapping this file was built from.
//
// NOT carried over from the reference workflow (out of scope for this task,
// per the ground-truth doc): `architecture_type` (standard/TOM),
// `experiment_batch_id`, `run_index`, and the TOM-only `Consolidate` stage —
// all TOM-quantitative-architecture concerns absent from
// ci/pipeline.config.json (this task's declared single source of truth).
// Likewise the GH-only per-job `RUN_STARTED_AT`/`RUN_ENDED_AT` timestamp
// stamping and the "Show Android emulator logs"-on-failure diagnostic step
// are TOM/GH-convenience extras, not part of the 5-shared-script inventory,
// and are intentionally omitted here.
//
// CONTROLLER / AGENT PREREQUISITES — this Jenkinsfile assumes the following
// are already provisioned by whoever administers the Jenkins controller and
// its agents (an agent-provisioning concern this file cannot itself
// guarantee — the same category of caveat GitHub Actions hides inside
// `runs-on: ubuntu-latest` / `macos-latest`):
//   1. The Lockable Resources plugin is installed (provides the `lock()`
//      step used below for the shared `standard-user-writes` fixture row).
//   2. Every non-macOS agent has Node (20 || 22 || >=24) and pnpm available
//      (via corepack or pre-installed) — Jenkins has no equivalent of
//      actions/setup-node + pnpm/action-setup; provisioning the toolchain is
//      a controller-side concern, not something a declarative Jenkinsfile
//      step should install ad hoc without inventing infrastructure outside
//      the 5 shared ci/steps/*.sh scripts this file calls.
//   3. Agents running the `Security ZAP`, `Security MobSF`, `Appium Android`
//      (docker-android emulator), `Mobilewright` (android leg), and
//      `WebdriverIO` (selenium-standalone) stages have Docker itself
//      installed and usable from the agent's own shell —
//      ci/steps/start-stack.sh's zap/mobsf/webdriverio arms and this file's
//      own android-emulator `docker run` step all shell out to the Docker
//      CLI directly. A docker-in-docker *container* agent is NOT what these
//      need; they need the HOST's Docker (e.g. a bind-mounted
//      /var/run/docker.sock, or a bare Docker-capable agent).
//   4. A registered agent labeled `macos` — a real, dedicated Mac (static or
//      cloud/Mac-in-a-box) — for the `Appium iOS` stage and the `ios` cell of
//      the `Mobilewright` matrix. There is no Jenkins-hosted macOS
//      equivalent to GitHub Actions' `macos-latest`.
//   5. A registered agent labeled `linux` for the `android` cell of the
//      `Mobilewright` matrix's per-cell agent selection (see that stage).
//   6. Android agents have KVM available (`/dev/kvm`) for the docker-android
//      emulator, exactly like the reference workflow's "Enable KVM" step.
//   7. `jq` and `curl` are available on whichever agent runs
//      "Resolve OmniPizza Release" (it shells out to both).
//
// CREDENTIALS this Jenkinsfile expects on the controller (Manage Jenkins ->
// Credentials), one per ci/pipeline.config.json secret — bound per-stage,
// only where that profile's `requiredSecrets` lists it, not as one global
// binding, so the credential surface here matches ci/pipeline.config.json
// exactly:
//   - `API_BASE_URL` (secret text)
//   - `BASE_URL` (secret text)
//   - `GITHUB_TOKEN` (secret text) — bound only in "Resolve OmniPizza
//     Release", used as a bearer token against api.github.com.
// `IOS_APP_PATH` is a ci/pipeline.config.json `requiredVars` entry, NOT a
// secret — it is exposed below as an ordinary string *parameter* (optional,
// default empty), mirroring GH's non-secret repository *variable* of the
// same name, and is never bound via credentials().
//
// KNOWN GAP mirrored from the reference pipeline, not fixed here
// (src/devices/** is out of this task's file scope): the `Mobilewright`
// stage is correctly wired (same device bring-up as Appium Android/iOS, same
// gRPC plugin start-up) but will fail at DeviceLoader.forWorker() until
// "mobilewright" is added to src/devices/docker_android.json's and
// src/devices/ci_ios_headless.json's compatibleDrivers arrays — see that
// stage's own comment below and ci/pipeline.config.json's mobilewright
// entry.
// =============================================================================

// Wraps `body` in the shared `standard-user-writes` Lockable Resources lock
// only when `suite` is the 'writes' cell — mirrors the reference workflow's
// per-job `concurrency: { group: matrix.suite == 'writes' &&
// 'standard-user-writes' || <unique-per-run-group> }`. Reads cells get no
// lock at all (functionally unlocked, matching GH's unique per-run/browser
// concurrency group for reads — inventing a fake per-build lock resource for
// reads would add noise, not fidelity).
def withOptionalLock(String suite, Closure body) {
    if (suite == 'writes') {
        lock(resource: 'standard-user-writes') {
            body.call()
        }
    } else {
        body.call()
    }
}

pipeline {
    agent none

    parameters {
        choice(
            name: 'PLATFORM',
            choices: ['all', 'api', 'web', 'playwright', 'playwright-desktop', 'playwright-responsive', 'pixelmatch', 'pixelmatch-desktop', 'pixelmatch-responsive', 'mobile', 'android', 'ios', 'appium', 'appium-android', 'appium-ios', 'perf', 'gatling', 'mobilewright', 'security', 'a11y', 'cypress', 'webdriverio'],
            description: 'Platform to test'
        )
        choice(
            name: 'PERF_PROFILE',
            choices: ['smoke', 'load', 'stress'],
            description: 'Gatling injection profile (perf only)'
        )
        string(
            name: 'PERF_USERS',
            defaultValue: '20',
            description: 'Virtual user count (perf load/stress)'
        )
        string(
            name: 'PERF_DURATION',
            defaultValue: '120',
            description: 'Ramp duration in seconds (perf load only)'
        )
        // Jenkins `choice` parameters have no separate defaultValue
        // attribute -- the FIRST list entry is the default. Reordered ('33'
        // first) to match the reference workflow's actual default of '33',
        // unlike the brief's illustrative ascending-order snippet, which
        // would silently default to '28' instead.
        choice(
            name: 'ANDROID_API_LEVEL',
            choices: ['33', '28', '29', '30', '31', '32'],
            description: 'Android API level'
        )
        string(
            name: 'IOS_APP_PATH',
            defaultValue: '',
            description: 'Override auto-discovered iOS .app bundle path (optional; a requiredVars entry, not a secret -- mirrors GH repo variable IOS_APP_PATH)'
        )
    }

    stages {

        // ---------------------------------------------------------------
        // Resolver: latest OmniPizza release. Needed by Appium Android,
        // Appium iOS, Mobilewright, and Security MobSF. Runs standalone,
        // before the parallel Test Suites block. Persists its two outputs
        // via stash/unstash (small text files) rather than Jenkins
        // environment variables, since consumer stages run on different
        // agents/containers and env vars do not propagate cross-agent the
        // way GH's `needs.<job>.outputs` do.
        // ---------------------------------------------------------------
        stage('Resolve OmniPizza Release') {
            agent any
            when {
                anyOf {
                    expression { params.PLATFORM == 'all' }
                    expression { params.PLATFORM == 'mobile' }
                    expression { params.PLATFORM == 'android' }
                    expression { params.PLATFORM == 'ios' }
                    expression { params.PLATFORM == 'appium' }
                    expression { params.PLATFORM == 'appium-android' }
                    expression { params.PLATFORM == 'appium-ios' }
                    expression { params.PLATFORM == 'mobilewright' }
                    expression { params.PLATFORM == 'security' }
                }
            }
            environment {
                GITHUB_TOKEN = credentials('GITHUB_TOKEN')
            }
            steps {
                sh '''
                    set -euo pipefail
                    TAG=$(curl -fsSL -H "Accept: application/vnd.github+json" -H "Authorization: Bearer $GITHUB_TOKEN" -H "X-GitHub-Api-Version: 2022-11-28" "https://api.github.com/repos/gsanchezm/OmniPizza/releases/latest" | jq -r .tag_name)
                    if [ -z "$TAG" ] || [ "$TAG" = "null" ]; then
                        echo "Failed to resolve latest OmniPizza release tag."
                        exit 1
                    fi
                    BASE_URL="https://github.com/gsanchezm/OmniPizza/releases/download/$TAG"
                    echo "Resolved OmniPizza release: $TAG"
                    echo "Download base URL: $BASE_URL"
                    printf '%s' "$TAG" > omnipizza-tag.txt
                    printf '%s' "$BASE_URL" > omnipizza-base-url.txt
                '''
                stash name: 'omnipizza-release', includes: 'omnipizza-tag.txt,omnipizza-base-url.txt'
            }
        }

        // ---------------------------------------------------------------
        // The 12 non-visual, non-resolver profiles, run in parallel to
        // mirror the reference workflow's independent job graph.
        // ---------------------------------------------------------------
        stage('Test Suites') {
            parallel {

                stage('API') {
                    when {
                        anyOf {
                            expression { params.PLATFORM == 'all' }
                            expression { params.PLATFORM == 'api' }
                        }
                    }
                    environment {
                        API_BASE_URL = credentials('API_BASE_URL')
                    }
                    matrix {
                        axes {
                            axis { name 'SUITE'; values 'reads', 'writes' }
                        }
                        agent any
                        stages {
                            stage('Run') {
                                steps {
                                    script {
                                        withOptionalLock(env.SUITE) {
                                            sh 'bash ci/steps/setup-environment.sh'
                                            sh '''
                                                if docker compose version >/dev/null 2>&1; then
                                                    docker compose -f infrastructure/minio-compose.yml up -d
                                                else
                                                    docker-compose -f infrastructure/minio-compose.yml up -d
                                                fi
                                                sleep 5
                                            '''
                                            withEnv(['PLATFORM=api', 'DRIVER=api', 'PLUGIN_API=true']) {
                                                sh 'bash ci/steps/start-stack.sh api'
                                            }
                                            withEnv([
                                                'MINIO_ENDPOINT=localhost', 'MINIO_PORT=9000',
                                                'MINIO_ACCESS_KEY=minioadmin', 'MINIO_SECRET_KEY=minioadmin'
                                            ]) {
                                                sh '''
                                                    if [ "$SUITE" = "reads" ]; then
                                                        TAG_EXPRESSION="@api and not @writes-shared-state"
                                                    else
                                                        TAG_EXPRESSION="@api and @writes-shared-state"
                                                    fi
                                                    bash ci/steps/run-suite.sh "$TAG_EXPRESSION" api "$SUITE"
                                                '''
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        post {
                            always {
                                sh 'bash ci/steps/collect-artifacts.sh api'
                                archiveArtifacts artifacts: 'artifacts/api/**', allowEmptyArchive: true
                                sh 'bash ci/steps/teardown.sh'
                            }
                        }
                    }
                }

                stage('Playwright Desktop') {
                    when {
                        anyOf {
                            expression { params.PLATFORM == 'all' }
                            expression { params.PLATFORM == 'web' }
                            expression { params.PLATFORM == 'playwright' }
                            expression { params.PLATFORM == 'playwright-desktop' }
                            expression { params.PLATFORM == 'pixelmatch' }
                            expression { params.PLATFORM == 'pixelmatch-desktop' }
                        }
                    }
                    environment {
                        API_BASE_URL = credentials('API_BASE_URL')
                        BASE_URL = credentials('BASE_URL')
                    }
                    matrix {
                        axes {
                            axis { name 'BROWSER'; values 'chromium', 'firefox', 'webkit' }
                            axis { name 'SUITE'; values 'reads', 'writes' }
                        }
                        agent {
                            docker { image 'mcr.microsoft.com/playwright:v1.61.1-jammy'; args '-u 0' }
                        }
                        stages {
                            stage('Run') {
                                steps {
                                    script {
                                        withOptionalLock(env.SUITE) {
                                            sh 'bash ci/steps/setup-environment.sh'
                                            withEnv([
                                                'PLATFORM=web', 'VIEWPORT=desktop', 'DRIVER=playwright',
                                                'HEADLESS=true', 'PLUGIN_PLAYWRIGHT=true',
                                                'PLUGIN_PIXELMATCH=false', 'PLUGIN_API=true'
                                            ]) {
                                                sh 'bash ci/steps/start-stack.sh web'
                                            }
                                            withEnv(['PLUGIN_PIXELMATCH=false']) {
                                                sh '''
                                                    if [ "$SUITE" = "reads" ]; then
                                                        TAG_EXPRESSION="@desktop and not @writes-shared-state"
                                                    else
                                                        TAG_EXPRESSION="@desktop and @writes-shared-state"
                                                    fi
                                                    bash ci/steps/run-suite.sh "$TAG_EXPRESSION" playwright-desktop "$BROWSER"
                                                '''
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        post {
                            always {
                                sh 'bash ci/steps/collect-artifacts.sh playwright-desktop'
                                archiveArtifacts artifacts: 'artifacts/playwright-desktop/**', allowEmptyArchive: true
                                sh 'bash ci/steps/teardown.sh'
                            }
                        }
                    }
                }

                stage('Playwright Responsive') {
                    when {
                        anyOf {
                            expression { params.PLATFORM == 'all' }
                            expression { params.PLATFORM == 'web' }
                            expression { params.PLATFORM == 'playwright' }
                            expression { params.PLATFORM == 'playwright-responsive' }
                            expression { params.PLATFORM == 'pixelmatch' }
                            expression { params.PLATFORM == 'pixelmatch-responsive' }
                        }
                    }
                    environment {
                        API_BASE_URL = credentials('API_BASE_URL')
                        BASE_URL = credentials('BASE_URL')
                    }
                    matrix {
                        axes {
                            axis { name 'BROWSER'; values 'chromium', 'firefox', 'webkit' }
                            axis { name 'SUITE'; values 'reads', 'writes' }
                        }
                        agent {
                            docker { image 'mcr.microsoft.com/playwright:v1.61.1-jammy'; args '-u 0' }
                        }
                        stages {
                            stage('Run') {
                                steps {
                                    script {
                                        withOptionalLock(env.SUITE) {
                                            sh 'bash ci/steps/setup-environment.sh'
                                            withEnv([
                                                'PLATFORM=web', 'VIEWPORT=responsive', 'DRIVER=playwright',
                                                'HEADLESS=true', 'PLUGIN_PLAYWRIGHT=true',
                                                'PLUGIN_PIXELMATCH=false', 'PLUGIN_API=true'
                                            ]) {
                                                sh 'bash ci/steps/start-stack.sh web'
                                            }
                                            withEnv(['PLUGIN_PIXELMATCH=false']) {
                                                sh '''
                                                    if [ "$SUITE" = "reads" ]; then
                                                        TAG_EXPRESSION="@responsive and not @writes-shared-state"
                                                    else
                                                        TAG_EXPRESSION="@responsive and @writes-shared-state"
                                                    fi
                                                    bash ci/steps/run-suite.sh "$TAG_EXPRESSION" playwright-responsive "$BROWSER"
                                                '''
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        post {
                            always {
                                sh 'bash ci/steps/collect-artifacts.sh playwright-responsive'
                                archiveArtifacts artifacts: 'artifacts/playwright-responsive/**', allowEmptyArchive: true
                                sh 'bash ci/steps/teardown.sh'
                            }
                        }
                    }
                }

                stage('Appium Android') {
                    when {
                        anyOf {
                            expression { params.PLATFORM == 'all' }
                            expression { params.PLATFORM == 'mobile' }
                            expression { params.PLATFORM == 'android' }
                            expression { params.PLATFORM == 'appium' }
                            expression { params.PLATFORM == 'appium-android' }
                        }
                    }
                    environment {
                        API_BASE_URL = credentials('API_BASE_URL')
                    }
                    matrix {
                        axes {
                            axis { name 'SUITE'; values 'reads', 'writes' }
                        }
                        // Bare Linux agent, NOT a docker{} container agent --
                        // this stage needs KVM (--device /dev/kvm) and to run
                        // its own sibling `docker run` for the emulator, both
                        // of which need the HOST's Docker/KVM, not a
                        // container-in-container setup. See header
                        // prerequisites.
                        agent any
                        stages {
                            stage('Run') {
                                steps {
                                    unstash 'omnipizza-release'
                                    script {
                                        withOptionalLock(env.SUITE) {
                                            sh 'bash ci/steps/setup-environment.sh'
                                            sh '''
                                                echo 'KERNEL=="kvm", GROUP="kvm", MODE="0666", OPTIONS+="static_node=kvm"' | sudo tee /etc/udev/rules.d/99-kvm4all.rules
                                                sudo udevadm control --reload-rules
                                                sudo udevadm trigger --name-match=kvm
                                            '''
                                            sh '''
                                                sudo apt-get update
                                                sudo apt-get install -y android-sdk-platform-tools
                                                adb version
                                            '''
                                            def baseUrl = readFile('omnipizza-base-url.txt').trim()
                                            withEnv(["OMNIPIZZA_RELEASE_BASE_URL=${baseUrl}"]) {
                                                sh '''
                                                    mkdir -p assets/apps/android
                                                    curl -fL "$OMNIPIZZA_RELEASE_BASE_URL/omnipizza-release.apk" -o assets/apps/android/app-release.apk
                                                    ls -lh assets/apps/android/app-release.apk
                                                '''
                                            }
                                            sh '''
                                                if docker compose version >/dev/null 2>&1; then
                                                    docker compose -f infrastructure/minio-compose.yml up -d
                                                else
                                                    docker-compose -f infrastructure/minio-compose.yml up -d
                                                fi
                                                sleep 5
                                            '''
                                            withEnv(["ANDROID_API_LEVEL=${params.ANDROID_API_LEVEL}"]) {
                                                sh '''
                                                    docker run -d --name android-emulator --privileged --device /dev/kvm -p 5554:5554 -p 5555:5555 -e API_LEVEL="$ANDROID_API_LEVEL" -e IMG_TYPE=google_apis -e ARCHITECTURE=x86_64 -e DEVICE_ID=pixel -e MEMORY=4096 -e CORES=2 -e DISABLE_ANIMATION=true -e DISABLE_HIDDEN_POLICY=true -e SKIP_AUTH=1 "halimqarroum/docker-android:api-$ANDROID_API_LEVEL"
                                                '''
                                            }
                                            sh '''
                                                pnpm exec appium --relaxed-security &
                                                sleep 5
                                            '''
                                            sh '''
                                                echo "Waiting for ADB device to appear..."
                                                adb connect localhost:5555
                                                for i in $(seq 1 40); do
                                                    if adb -s localhost:5555 shell getprop sys.boot_completed 2>/dev/null | grep -q "1"; then
                                                        echo "Emulator ready after $((i * 15))s"
                                                        break
                                                    fi
                                                    echo "  Attempt $i/40 -- waiting 15s..."
                                                    sleep 15
                                                done
                                                adb devices
                                            '''
                                            withEnv([
                                                'PLATFORM=android', 'DRIVER=appium', 'APPIUM_HOST=localhost',
                                                'APPIUM_PORT=4723', 'CAP_PROFILE=docker_android',
                                                'ANDROID_APP_PATH=assets/apps/android/app-release.apk',
                                                'ANDROID_UDID=localhost:5555', 'PLUGIN_APPIUM=true', 'PLUGIN_API=true'
                                            ]) {
                                                sh 'bash ci/steps/start-stack.sh android'
                                            }
                                            withEnv([
                                                'PLATFORM=android', 'DRIVER=appium', 'APPIUM_HOST=localhost',
                                                'APPIUM_PORT=4723', 'CAP_PROFILE=docker_android',
                                                'ANDROID_APP_PATH=assets/apps/android/app-release.apk',
                                                'ANDROID_UDID=localhost:5555',
                                                'MINIO_ENDPOINT=localhost', 'MINIO_PORT=9000',
                                                'MINIO_ACCESS_KEY=minioadmin', 'MINIO_SECRET_KEY=minioadmin'
                                            ]) {
                                                sh '''
                                                    if [ "$SUITE" = "reads" ]; then
                                                        TAG_EXPRESSION="@android and not @writes-shared-state"
                                                    else
                                                        TAG_EXPRESSION="@android and @writes-shared-state"
                                                    fi
                                                    bash ci/steps/run-suite.sh "$TAG_EXPRESSION" android "$SUITE"
                                                '''
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        post {
                            always {
                                sh 'docker rm -f android-emulator || true'
                                sh 'bash ci/steps/collect-artifacts.sh android'
                                archiveArtifacts artifacts: 'artifacts/android/**', allowEmptyArchive: true
                                sh 'bash ci/steps/teardown.sh'
                            }
                        }
                    }
                }

                stage('Appium iOS') {
                    when {
                        anyOf {
                            expression { params.PLATFORM == 'all' }
                            expression { params.PLATFORM == 'mobile' }
                            expression { params.PLATFORM == 'ios' }
                            expression { params.PLATFORM == 'appium' }
                            expression { params.PLATFORM == 'appium-ios' }
                        }
                    }
                    environment {
                        API_BASE_URL = credentials('API_BASE_URL')
                    }
                    matrix {
                        axes {
                            axis { name 'SUITE'; values 'reads', 'writes' }
                        }
                        // Real, dedicated Mac agent required -- statically
                        // registered, or via a cloud/Mac-in-a-box provider.
                        // There is no Jenkins-hosted macOS equivalent to
                        // GitHub Actions' `macos-latest`.
                        agent { label 'macos' }
                        stages {
                            stage('Run') {
                                steps {
                                    unstash 'omnipizza-release'
                                    script {
                                        withOptionalLock(env.SUITE) {
                                            sh 'bash ci/steps/setup-environment.sh'
                                            def baseUrl = readFile('omnipizza-base-url.txt').trim()
                                            withEnv(["OMNIPIZZA_RELEASE_BASE_URL=${baseUrl}"]) {
                                                sh '''
                                                    mkdir -p assets/apps/ios
                                                    curl -fL "$OMNIPIZZA_RELEASE_BASE_URL/OmniPizza-Simulator.zip" -o assets/apps/ios/OmniPizza-Simulator.zip
                                                    ls -lh assets/apps/ios/OmniPizza-Simulator.zip
                                                '''
                                            }
                                            sh '''
                                                rm -rf assets/apps/ios/unpacked
                                                mkdir -p assets/apps/ios/unpacked
                                                unzip -q assets/apps/ios/OmniPizza-Simulator.zip -d assets/apps/ios/unpacked
                                                IOS_APP_PATH_DISCOVERED=$(find assets/apps/ios/unpacked -maxdepth 3 -name '*.app' -type d | head -n 1)
                                                if [ -z "$IOS_APP_PATH_DISCOVERED" ]; then
                                                    echo "No .app bundle found inside OmniPizza-Simulator.zip"
                                                    exit 1
                                                fi
                                                echo "$IOS_APP_PATH_DISCOVERED" > ios-app-path.txt
                                            '''
                                            sh '''
                                                DEVICE_LINE=$(xcrun simctl list devices available | grep -E 'iPhone .*\\([A-F0-9-]+\\) \\((Shutdown|Booted)\\)' | head -n 1)
                                                if [ -z "$DEVICE_LINE" ]; then
                                                    echo "No available iPhone simulator found"
                                                    exit 1
                                                fi
                                                IOS_DEVICE_NAME_DISCOVERED=$(echo "$DEVICE_LINE" | sed -E 's/^[[:space:]]*([^()]+)[[:space:]]+\\(.*/\\1/' | xargs)
                                                IOS_UDID_DISCOVERED=$(echo "$DEVICE_LINE" | sed -E 's/.*\\(([A-F0-9-]+)\\).*/\\1/')
                                                echo "$IOS_DEVICE_NAME_DISCOVERED" > ios-device-name.txt
                                                echo "$IOS_UDID_DISCOVERED" > ios-udid.txt
                                                xcrun simctl boot "$IOS_UDID_DISCOVERED" || true
                                                xcrun simctl bootstatus "$IOS_UDID_DISCOVERED" -b
                                            '''
                                            sh '''
                                                MACHINE_ARCH=$(uname -m)
                                                MINIO_ARCH=$(node -p "({ arm64: 'arm64', x86_64: 'amd64' })[process.argv[1]] || ''" "$MACHINE_ARCH")
                                                if [ -z "$MINIO_ARCH" ]; then
                                                    echo "Unsupported macOS architecture: $MACHINE_ARCH"
                                                    exit 1
                                                fi
                                                curl -fL "https://dl.min.io/server/minio/release/darwin-${MINIO_ARCH}/minio" -o /tmp/minio
                                                chmod +x /tmp/minio
                                                mkdir -p /tmp/ahm-minio-data
                                                MINIO_ROOT_USER=minioadmin MINIO_ROOT_PASSWORD=minioadmin /tmp/minio server /tmp/ahm-minio-data --address ":9000" --console-address ":9001" &
                                                for i in $(seq 1 30); do
                                                    if curl -fsS http://localhost:9000/minio/health/live >/dev/null; then
                                                        echo "MinIO ready"
                                                        exit 0
                                                    fi
                                                    sleep 1
                                                done
                                                echo "MinIO did not become healthy"
                                                exit 1
                                            '''
                                            sh '''
                                                pnpm exec appium --relaxed-security &
                                                sleep 5
                                            '''
                                            def iosAppPathParam = params.IOS_APP_PATH?.trim()
                                            def iosAppPath = iosAppPathParam ? iosAppPathParam : readFile('ios-app-path.txt').trim()
                                            def iosUdid = readFile('ios-udid.txt').trim()
                                            def iosDeviceName = readFile('ios-device-name.txt').trim()
                                            withEnv([
                                                'PLATFORM=ios', 'DRIVER=appium', 'APPIUM_HOST=localhost', 'APPIUM_PORT=4723',
                                                'CAP_PROFILE=ci_ios_headless',
                                                "IOS_APP_PATH=${iosAppPath}", "IOS_UDID=${iosUdid}", "IOS_DEVICE_NAME=${iosDeviceName}",
                                                'PLUGIN_APPIUM=true', 'PLUGIN_API=true',
                                                'MINIO_ENDPOINT=localhost', 'MINIO_PORT=9000',
                                                'MINIO_ACCESS_KEY=minioadmin', 'MINIO_SECRET_KEY=minioadmin'
                                            ]) {
                                                sh 'bash ci/steps/start-stack.sh ios'
                                            }
                                            withEnv([
                                                "IOS_APP_PATH=${iosAppPath}", "IOS_UDID=${iosUdid}", "IOS_DEVICE_NAME=${iosDeviceName}",
                                                'MINIO_ENDPOINT=localhost', 'MINIO_PORT=9000',
                                                'MINIO_ACCESS_KEY=minioadmin', 'MINIO_SECRET_KEY=minioadmin'
                                            ]) {
                                                sh '''
                                                    if [ "$SUITE" = "reads" ]; then
                                                        TAG_EXPRESSION="@ios and not @writes-shared-state"
                                                    else
                                                        TAG_EXPRESSION="@ios and @writes-shared-state"
                                                    fi
                                                    bash ci/steps/run-suite.sh "$TAG_EXPRESSION" ios "$SUITE"
                                                '''
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        post {
                            always {
                                sh 'bash ci/steps/collect-artifacts.sh ios'
                                archiveArtifacts artifacts: 'artifacts/ios/**', allowEmptyArchive: true
                                sh 'bash ci/steps/teardown.sh'
                            }
                        }
                    }
                }

                stage('Mobilewright') {
                    // KNOWN GAP -- do not "fix" by editing src/devices/*.json
                    // (out of this task's file scope): docker_android.json
                    // and ci_ios_headless.json need "mobilewright" added to
                    // their compatibleDrivers arrays before this stage can
                    // pass -- mobilewright-adapter.ts tolerates a passport
                    // with no mobilewright config block (it spreads
                    // `passport.mobilewright ?? {}`), so the array entry
                    // alone would be sufficient, no other device-file changes
                    // needed. Today this stage is structurally wired (proxy +
                    // mobilewright plugin + api plugin all start fine) but
                    // WILL FAIL at DeviceLoader.forWorker() with "device
                    // 'docker_android'/'ci_ios_headless' ... is not
                    // compatible with DRIVER='mobilewright'". Mirrored as-is,
                    // matching ci/pipeline.config.json's own documented note
                    // on this profile.
                    when {
                        anyOf {
                            expression { params.PLATFORM == 'all' }
                            expression { params.PLATFORM == 'mobilewright' }
                        }
                    }
                    environment {
                        API_BASE_URL = credentials('API_BASE_URL')
                    }
                    matrix {
                        axes {
                            axis { name 'PLATFORM'; values 'android', 'ios' }
                            axis { name 'SUITE'; values 'reads', 'writes' }
                        }
                        // Per-axis agent: android cell -> a Linux agent
                        // (needs KVM/Docker-on-host, same caveat as Appium
                        // Android above); ios cell -> the dedicated 'macos'
                        // agent (same caveat as Appium iOS above). This is
                        // the documented Jenkins matrix pattern for a
                        // per-cell agent that depends on an axis value.
                        agent {
                            label "${PLATFORM == 'ios' ? 'macos' : 'linux'}"
                        }
                        stages {
                            stage('Run') {
                                steps {
                                    unstash 'omnipizza-release'
                                    script {
                                        withOptionalLock(env.SUITE) {
                                            if (env.PLATFORM == 'android') {
                                                sh '''
                                                    echo 'KERNEL=="kvm", GROUP="kvm", MODE="0666", OPTIONS+="static_node=kvm"' | sudo tee /etc/udev/rules.d/99-kvm4all.rules
                                                    sudo udevadm control --reload-rules
                                                    sudo udevadm trigger --name-match=kvm
                                                '''
                                            }
                                            sh 'bash ci/steps/setup-environment.sh'
                                            if (env.PLATFORM == 'android') {
                                                sh '''
                                                    sudo apt-get update
                                                    sudo apt-get install -y android-sdk-platform-tools
                                                    adb version
                                                '''
                                            }
                                            def baseUrl = readFile('omnipizza-base-url.txt').trim()
                                            def iosAppPath = ''
                                            def iosUdid = ''
                                            def iosDeviceName = ''
                                            if (env.PLATFORM == 'android') {
                                                withEnv(["OMNIPIZZA_RELEASE_BASE_URL=${baseUrl}"]) {
                                                    sh '''
                                                        mkdir -p assets/apps/android
                                                        curl -fL "$OMNIPIZZA_RELEASE_BASE_URL/omnipizza-release.apk" -o assets/apps/android/app-release.apk
                                                        ls -lh assets/apps/android/app-release.apk
                                                    '''
                                                }
                                                sh '''
                                                    if docker compose version >/dev/null 2>&1; then
                                                        docker compose -f infrastructure/minio-compose.yml up -d
                                                    else
                                                        docker-compose -f infrastructure/minio-compose.yml up -d
                                                    fi
                                                    sleep 5
                                                '''
                                                withEnv(["ANDROID_API_LEVEL=${params.ANDROID_API_LEVEL}"]) {
                                                    sh '''
                                                        docker run -d --name android-emulator --privileged --device /dev/kvm -p 5554:5554 -p 5555:5555 -e API_LEVEL="$ANDROID_API_LEVEL" -e IMG_TYPE=google_apis -e ARCHITECTURE=x86_64 -e DEVICE_ID=pixel -e MEMORY=4096 -e CORES=2 -e DISABLE_ANIMATION=true -e DISABLE_HIDDEN_POLICY=true -e SKIP_AUTH=1 "halimqarroum/docker-android:api-$ANDROID_API_LEVEL"
                                                    '''
                                                }
                                                sh '''
                                                    echo "Waiting for ADB device to appear..."
                                                    adb connect localhost:5555
                                                    for i in $(seq 1 40); do
                                                        if adb -s localhost:5555 shell getprop sys.boot_completed 2>/dev/null | grep -q "1"; then
                                                            echo "Emulator ready after $((i * 15))s"
                                                            break
                                                        fi
                                                        echo "  Attempt $i/40 -- waiting 15s..."
                                                        sleep 15
                                                    done
                                                    adb devices
                                                '''
                                            } else {
                                                withEnv(["OMNIPIZZA_RELEASE_BASE_URL=${baseUrl}"]) {
                                                    sh '''
                                                        mkdir -p assets/apps/ios
                                                        curl -fL "$OMNIPIZZA_RELEASE_BASE_URL/OmniPizza-Simulator.zip" -o assets/apps/ios/OmniPizza-Simulator.zip
                                                        ls -lh assets/apps/ios/OmniPizza-Simulator.zip
                                                    '''
                                                }
                                                sh '''
                                                    rm -rf assets/apps/ios/unpacked
                                                    mkdir -p assets/apps/ios/unpacked
                                                    unzip -q assets/apps/ios/OmniPizza-Simulator.zip -d assets/apps/ios/unpacked
                                                    IOS_APP_PATH_DISCOVERED=$(find assets/apps/ios/unpacked -maxdepth 3 -name '*.app' -type d | head -n 1)
                                                    if [ -z "$IOS_APP_PATH_DISCOVERED" ]; then
                                                        echo "No .app bundle found inside OmniPizza-Simulator.zip"
                                                        exit 1
                                                    fi
                                                    echo "$IOS_APP_PATH_DISCOVERED" > ios-app-path.txt
                                                '''
                                                sh '''
                                                    DEVICE_LINE=$(xcrun simctl list devices available | grep -E 'iPhone .*\\([A-F0-9-]+\\) \\((Shutdown|Booted)\\)' | head -n 1)
                                                    if [ -z "$DEVICE_LINE" ]; then
                                                        echo "No available iPhone simulator found"
                                                        exit 1
                                                    fi
                                                    IOS_DEVICE_NAME_DISCOVERED=$(echo "$DEVICE_LINE" | sed -E 's/^[[:space:]]*([^()]+)[[:space:]]+\\(.*/\\1/' | xargs)
                                                    IOS_UDID_DISCOVERED=$(echo "$DEVICE_LINE" | sed -E 's/.*\\(([A-F0-9-]+)\\).*/\\1/')
                                                    echo "$IOS_DEVICE_NAME_DISCOVERED" > ios-device-name.txt
                                                    echo "$IOS_UDID_DISCOVERED" > ios-udid.txt
                                                    xcrun simctl boot "$IOS_UDID_DISCOVERED" || true
                                                    xcrun simctl bootstatus "$IOS_UDID_DISCOVERED" -b
                                                '''
                                                sh '''
                                                    MACHINE_ARCH=$(uname -m)
                                                    MINIO_ARCH=$(node -p "({ arm64: 'arm64', x86_64: 'amd64' })[process.argv[1]] || ''" "$MACHINE_ARCH")
                                                    if [ -z "$MINIO_ARCH" ]; then
                                                        echo "Unsupported macOS architecture: $MACHINE_ARCH"
                                                        exit 1
                                                    fi
                                                    curl -fL "https://dl.min.io/server/minio/release/darwin-${MINIO_ARCH}/minio" -o /tmp/minio
                                                    chmod +x /tmp/minio
                                                    mkdir -p /tmp/ahm-minio-data
                                                    MINIO_ROOT_USER=minioadmin MINIO_ROOT_PASSWORD=minioadmin /tmp/minio server /tmp/ahm-minio-data --address ":9000" --console-address ":9001" &
                                                    for i in $(seq 1 30); do
                                                        if curl -fsS http://localhost:9000/minio/health/live >/dev/null; then
                                                            echo "MinIO ready"
                                                            exit 0
                                                        fi
                                                        sleep 1
                                                    done
                                                    echo "MinIO did not become healthy"
                                                    exit 1
                                                '''
                                                iosAppPath = params.IOS_APP_PATH?.trim() ? params.IOS_APP_PATH.trim() : readFile('ios-app-path.txt').trim()
                                                iosUdid = readFile('ios-udid.txt').trim()
                                                iosDeviceName = readFile('ios-device-name.txt').trim()
                                            }

                                            // NOTE: unlike the Appium Android/iOS stages above,
                                            // no Appium server is started here --
                                            // mobilewrightNeedsAppiumServer: false in
                                            // ci/pipeline.config.json. mobilewright drives
                                            // devices via `mobilecli`, not an Appium
                                            // server/WebDriverIO remote() session -- go
                                            // straight to start-stack.sh mobilewright.
                                            def capProfile = (env.PLATFORM == 'android') ? 'docker_android' : 'ci_ios_headless'
                                            withEnv([
                                                'DRIVER=mobilewright',
                                                "CAP_PROFILE=${capProfile}",
                                                'ANDROID_APP_PATH=assets/apps/android/app-release.apk',
                                                'ANDROID_UDID=localhost:5555',
                                                "IOS_APP_PATH=${iosAppPath}", "IOS_UDID=${iosUdid}", "IOS_DEVICE_NAME=${iosDeviceName}",
                                                'PLUGIN_MOBILEWRIGHT=true', 'PLUGIN_API=true'
                                            ]) {
                                                sh 'bash ci/steps/start-stack.sh mobilewright'
                                            }
                                            withEnv([
                                                'DRIVER=mobilewright',
                                                "CAP_PROFILE=${capProfile}",
                                                'ANDROID_APP_PATH=assets/apps/android/app-release.apk',
                                                'ANDROID_UDID=localhost:5555',
                                                "IOS_APP_PATH=${iosAppPath}", "IOS_UDID=${iosUdid}", "IOS_DEVICE_NAME=${iosDeviceName}",
                                                'MINIO_ENDPOINT=localhost', 'MINIO_PORT=9000',
                                                'MINIO_ACCESS_KEY=minioadmin', 'MINIO_SECRET_KEY=minioadmin'
                                            ]) {
                                                sh '''
                                                    if [ "$PLATFORM" = "android" ]; then
                                                        BASE_TAG="@android"
                                                    else
                                                        BASE_TAG="@ios"
                                                    fi
                                                    if [ "$SUITE" = "reads" ]; then
                                                        TAG_EXPRESSION="$BASE_TAG and not @writes-shared-state"
                                                    else
                                                        TAG_EXPRESSION="$BASE_TAG and @writes-shared-state"
                                                    fi
                                                    bash ci/steps/run-suite.sh "$TAG_EXPRESSION" mobilewright "${PLATFORM}-${SUITE}"
                                                '''
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        post {
                            always {
                                script {
                                    if (env.PLATFORM == 'android') {
                                        sh 'docker rm -f android-emulator || true'
                                    }
                                }
                                sh 'bash ci/steps/collect-artifacts.sh mobilewright'
                                archiveArtifacts artifacts: 'artifacts/mobilewright/**', allowEmptyArchive: true
                                sh 'bash ci/steps/teardown.sh'
                            }
                        }
                    }
                }

                stage('Security ZAP') {
                    when {
                        anyOf {
                            expression { params.PLATFORM == 'all' }
                            expression { params.PLATFORM == 'security' }
                        }
                    }
                    // No container image -- RunZapScan.ts shells out to
                    // `docker run --rm ghcr.io/zaproxy/zaproxy:stable` itself,
                    // per scan. Docker just needs to be available on this
                    // agent (see header prerequisites); do not add a separate
                    // `docker run` step here.
                    agent any
                    environment {
                        API_BASE_URL = credentials('API_BASE_URL')
                        BASE_URL = credentials('BASE_URL')
                    }
                    steps {
                        sh 'bash ci/steps/setup-environment.sh'
                        withEnv(['PLATFORM=api', 'DRIVER=api', 'PLUGIN_ZAP=true', 'PLUGIN_API=true']) {
                            sh 'bash ci/steps/start-stack.sh zap'
                        }
                        script {
                            // The @security-infra recording suite must run on
                            // this same stack even if the hard-gating
                            // @security suite fails (mirrors GH's `if:
                            // success() || failure()` on the second
                            // run-suite call) -- capture the first call's
                            // exit code with returnStatus, always run the
                            // second call, then fail the stage afterwards if
                            // the first one failed.
                            int securityStatus = sh(script: 'bash ci/steps/run-suite.sh "@security" zap security', returnStatus: true)
                            sh 'bash ci/steps/run-suite.sh "@security-infra" zap security-infra'
                            if (securityStatus != 0) {
                                error("Security ZAP: '@security' suite failed (exit ${securityStatus})")
                            }
                        }
                    }
                    post {
                        always {
                            sh 'bash ci/steps/collect-artifacts.sh zap'
                            archiveArtifacts artifacts: 'artifacts/zap/**', allowEmptyArchive: true
                            sh 'bash ci/steps/teardown.sh'
                        }
                    }
                }

                stage('Security MobSF') {
                    when {
                        anyOf {
                            expression { params.PLATFORM == 'all' }
                            expression { params.PLATFORM == 'security' }
                        }
                    }
                    agent any
                    environment {
                        API_BASE_URL = credentials('API_BASE_URL')
                    }
                    steps {
                        unstash 'omnipizza-release'
                        script {
                            def baseUrl = readFile('omnipizza-base-url.txt').trim()
                            sh 'bash ci/steps/setup-environment.sh'
                            // filePath must match support.security.json's
                            // mobile.mobsf[] entries exactly:
                            // "assets/apps/android/omnipizza-release.apk" --
                            // NOT renamed to app-release.apk the way Appium
                            // Android's own copy is.
                            withEnv(["OMNIPIZZA_RELEASE_BASE_URL=${baseUrl}"]) {
                                sh '''
                                    mkdir -p assets/apps/android
                                    curl -fL "$OMNIPIZZA_RELEASE_BASE_URL/omnipizza-release.apk" -o assets/apps/android/omnipizza-release.apk
                                    ls -lh assets/apps/android/omnipizza-release.apk
                                '''
                            }
                            // support.security.json's ios mobsf entry expects
                            // a literal .app DIRECTORY at
                            // "assets/apps/ios/OmniPizza.app" -- no booted
                            // simulator or macOS runner needed, MobSF only
                            // reads the static bundle on disk.
                            withEnv(["OMNIPIZZA_RELEASE_BASE_URL=${baseUrl}"]) {
                                sh '''
                                    mkdir -p assets/apps/ios
                                    curl -fL "$OMNIPIZZA_RELEASE_BASE_URL/OmniPizza-Simulator.zip" -o assets/apps/ios/OmniPizza-Simulator.zip
                                    rm -rf assets/apps/ios/unpacked assets/apps/ios/OmniPizza.app
                                    mkdir -p assets/apps/ios/unpacked
                                    unzip -q assets/apps/ios/OmniPizza-Simulator.zip -d assets/apps/ios/unpacked
                                    APP_PATH=$(find assets/apps/ios/unpacked -maxdepth 3 -name '*.app' -type d | head -n 1)
                                    if [ -z "$APP_PATH" ]; then
                                        echo "No .app bundle found inside OmniPizza-Simulator.zip"
                                        exit 1
                                    fi
                                    cp -R "$APP_PATH" assets/apps/ios/OmniPizza.app
                                    ls -ld assets/apps/ios/OmniPizza.app
                                '''
                            }
                            // Brings up its own MobSF container, health-polls
                            // :8000, scrapes MOBSF_API_KEY from the
                            // container's own startup logs -- all inside
                            // ci/steps/start-stack.sh's mobsf arm; this stage
                            // does not reimplement any of that.
                            withEnv(['PLATFORM=api', 'DRIVER=api', 'PLUGIN_MOBSF=true', 'PLUGIN_API=true', 'MOBSF_URL=http://127.0.0.1:8000']) {
                                sh 'bash ci/steps/start-stack.sh mobsf'
                            }
                            sh 'bash ci/steps/run-suite.sh "@security-infra" mobsf security-infra'
                        }
                    }
                    post {
                        always {
                            sh 'docker rm -f mobsf 2>/dev/null || true'
                            sh 'bash ci/steps/collect-artifacts.sh mobsf'
                            archiveArtifacts artifacts: 'artifacts/mobsf/**', allowEmptyArchive: true
                            sh 'bash ci/steps/teardown.sh'
                        }
                    }
                }

                stage('Accessibility') {
                    when {
                        anyOf {
                            expression { params.PLATFORM == 'all' }
                            expression { params.PLATFORM == 'a11y' }
                        }
                    }
                    agent {
                        docker { image 'mcr.microsoft.com/playwright:v1.61.1-jammy'; args '-u 0' }
                    }
                    environment {
                        API_BASE_URL = credentials('API_BASE_URL')
                        BASE_URL = credentials('BASE_URL')
                    }
                    steps {
                        sh 'bash ci/steps/setup-environment.sh'
                        // start-stack.sh has NO dedicated a11y case arm --
                        // axe rides the existing 'web' arm via
                        // PLUGIN_AXE=true forwarded into the Playwright
                        // plugin process's own startup env.
                        withEnv([
                            'BROWSER=chromium', 'PLATFORM=web', 'VIEWPORT=desktop', 'DRIVER=playwright',
                            'HEADLESS=true', 'PLUGIN_PLAYWRIGHT=true', 'PLUGIN_PIXELMATCH=false',
                            'PLUGIN_AXE=true', 'PLUGIN_API=true'
                        ]) {
                            sh 'bash ci/steps/start-stack.sh web'
                        }
                        sh 'bash ci/steps/run-suite.sh "@a11y" a11y'
                    }
                    post {
                        always {
                            sh 'bash ci/steps/collect-artifacts.sh a11y'
                            archiveArtifacts artifacts: 'artifacts/a11y/**', allowEmptyArchive: true
                            sh 'bash ci/steps/teardown.sh'
                        }
                    }
                }

                stage('WebdriverIO') {
                    when {
                        anyOf {
                            expression { params.PLATFORM == 'all' }
                            expression { params.PLATFORM == 'webdriverio' }
                        }
                    }
                    environment {
                        API_BASE_URL = credentials('API_BASE_URL')
                        BASE_URL = credentials('BASE_URL')
                    }
                    matrix {
                        axes {
                            axis { name 'SUITE'; values 'reads', 'writes' }
                        }
                        // No container image -- start-stack.sh's webdriverio
                        // arm itself launches selenium/standalone-chrome via
                        // `docker run`, needing Docker on the HOST (see
                        // header prerequisites), not a docker-in-docker
                        // agent.
                        agent any
                        stages {
                            stage('Run') {
                                steps {
                                    script {
                                        withOptionalLock(env.SUITE) {
                                            sh 'bash ci/steps/setup-environment.sh'
                                            withEnv([
                                                'BROWSER=chromium', 'PLATFORM=web', 'VIEWPORT=desktop',
                                                'DRIVER=webdriverio', 'PLUGIN_WEBDRIVERIO=true', 'PLUGIN_API=true'
                                            ]) {
                                                sh 'bash ci/steps/start-stack.sh webdriverio'
                                            }
                                            sh '''
                                                if [ "$SUITE" = "reads" ]; then
                                                    TAG_EXPRESSION="@desktop and not @writes-shared-state"
                                                else
                                                    TAG_EXPRESSION="@desktop and @writes-shared-state"
                                                fi
                                                bash ci/steps/run-suite.sh "$TAG_EXPRESSION" webdriverio "$SUITE"
                                            '''
                                        }
                                    }
                                }
                            }
                        }
                        post {
                            always {
                                sh 'bash ci/steps/collect-artifacts.sh webdriverio'
                                archiveArtifacts artifacts: 'artifacts/webdriverio/**', allowEmptyArchive: true
                                sh 'bash ci/steps/teardown.sh'
                            }
                        }
                    }
                }

                stage('Cypress') {
                    when {
                        anyOf {
                            expression { params.PLATFORM == 'all' }
                            expression { params.PLATFORM == 'cypress' }
                        }
                    }
                    agent any
                    environment {
                        // BASE_URL is what the job body actually reads.
                        // API_BASE_URL is listed in this profile's
                        // requiredSecrets in ci/pipeline.config.json but
                        // unused by the job body -- bound anyway so this
                        // stage's credential surface matches the config file
                        // exactly.
                        API_BASE_URL = credentials('API_BASE_URL')
                        BASE_URL = credentials('BASE_URL')
                    }
                    // Cypress is not a gRPC plugin peer: no start-stack.sh
                    // call, no run-suite.sh call (that profile is
                    // reserved/rejected there), no collect-artifacts.sh call
                    // (it would exit 1 -- Cypress never populates results/),
                    // and no teardown.sh call (nothing was started).
                    steps {
                        sh 'bash ci/steps/setup-environment.sh'
                        sh 'pnpm run test:cypress:desktop'
                    }
                    post {
                        always {
                            archiveArtifacts artifacts: 'src/plugins/cypress/screenshots/**', allowEmptyArchive: true
                            archiveArtifacts artifacts: 'src/plugins/cypress/videos/**', allowEmptyArchive: true
                        }
                    }
                }

                stage('Perf Gatling') {
                    when {
                        anyOf {
                            expression { params.PLATFORM == 'all' }
                            expression { params.PLATFORM == 'perf' }
                            expression { params.PLATFORM == 'gatling' }
                        }
                    }
                    agent any
                    environment {
                        API_BASE_URL = credentials('API_BASE_URL')
                    }
                    steps {
                        sh 'bash ci/steps/setup-environment.sh'
                        // start-stack.sh's gatling arm is a documented no-op
                        // (Gatling runs standalone, no proxy/plugin) --
                        // called anyway for Template Method symmetry with
                        // every other profile.
                        sh 'bash ci/steps/start-stack.sh gatling'
                        withEnv(["PERF_USERS=${params.PERF_USERS}", "PERF_DURATION=${params.PERF_DURATION}", 'LANGUAGE=en']) {
                            sh "pnpm perf:${params.PERF_PROFILE}"
                        }
                    }
                    post {
                        always {
                            sh 'bash ci/steps/collect-artifacts.sh gatling'
                            archiveArtifacts artifacts: 'artifacts/gatling/**', allowEmptyArchive: true
                            archiveArtifacts artifacts: 'target/gatling/**', allowEmptyArchive: true
                            sh 'bash ci/steps/teardown.sh'
                        }
                    }
                }

            }
        }

        // ---------------------------------------------------------------
        // Visual regression (Pixelmatch capture + gate), sequenced AFTER
        // 'Test Suites' to mirror the reference workflow's `needs: e2e-web`
        // / `needs: e2e-web-responsive` dependency (visual capture re-runs
        // the same scenarios against the same shared standard_user row, so
        // it must not race the functional pass).
        //
        // Jenkins declarative pipeline cannot cheaply replicate GH's exact
        // `if: always() && needs.result != 'skipped' && needs.result !=
        // 'cancelled'` semantics without extra scripting (e.g. wrapping
        // every 'Test Suites' branch in catchError so a functional failure
        // there doesn't stop the whole pipeline before reaching this
        // stage). That extra scripting is deliberately NOT added here --
        // the closest safe approximation is: these two stages just reuse
        // their functional counterpart's `when` gate and always attempt to
        // run when gated in. Known gap, accepted as part of the
        // approximation: if any 'Test Suites' branch fails, Jenkins will by
        // default stop before reaching this stage at all, unlike GH's
        // `if: always()`.
        // ---------------------------------------------------------------
        stage('Visual Regression') {
            stages {

                stage('Visual Playwright Desktop') {
                    when {
                        anyOf {
                            expression { params.PLATFORM == 'all' }
                            expression { params.PLATFORM == 'web' }
                            expression { params.PLATFORM == 'playwright' }
                            expression { params.PLATFORM == 'playwright-desktop' }
                            expression { params.PLATFORM == 'pixelmatch' }
                            expression { params.PLATFORM == 'pixelmatch-desktop' }
                        }
                    }
                    agent {
                        docker { image 'mcr.microsoft.com/playwright:v1.61.1-jammy'; args '-u 0' }
                    }
                    environment {
                        API_BASE_URL = credentials('API_BASE_URL')
                        BASE_URL = credentials('BASE_URL')
                    }
                    steps {
                        // Locked unconditionally (no suite axis here) --
                        // every visual-web run touches the shared
                        // standard_user row once, so it always joins the
                        // same write queue as the writes cells above.
                        lock(resource: 'standard-user-writes') {
                            sh 'bash ci/steps/setup-environment.sh'
                            // start-stack.sh arg is literally 'web', not
                            // 'playwright-visual-desktop' -- same
                            // start-stack profile as the functional desktop
                            // stage, just with PLUGIN_PIXELMATCH=true instead
                            // of false.
                            withEnv([
                                'PLATFORM=web', 'VIEWPORT=desktop', 'DRIVER=playwright', 'HEADLESS=true',
                                'PLUGIN_PLAYWRIGHT=true', 'PLUGIN_PIXELMATCH=true', 'PLUGIN_API=true'
                            ]) {
                                sh 'bash ci/steps/start-stack.sh web'
                            }
                            // Own pnpm script, not run-suite.sh -- wraps
                            // cucumber with the @desktop and @visual tag AND
                            // regenerates baselines. Pre-existing quirk in
                            // the reference pipeline, mirrored as-is, not
                            // fixed.
                            sh 'pnpm test:json:visual:desktop'
                            // Fails the stage if any snapshot drifted
                            // (cucumber itself stays green on drift).
                            sh 'node scripts/visual-gate.js'
                        }
                    }
                    post {
                        always {
                            // collect-artifacts profile name IS
                            // playwright-visual-desktop even though
                            // start-stack.sh was called with 'web' --
                            // intentional mismatch carried over from the
                            // reference pipeline, not a bug to "fix".
                            sh 'bash ci/steps/collect-artifacts.sh playwright-visual-desktop'
                            archiveArtifacts artifacts: 'artifacts/playwright-visual-desktop/**', allowEmptyArchive: true
                            archiveArtifacts artifacts: 'visual-results/**', allowEmptyArchive: true
                            sh 'bash ci/steps/teardown.sh'
                        }
                    }
                }

                stage('Visual Playwright Responsive') {
                    when {
                        anyOf {
                            expression { params.PLATFORM == 'all' }
                            expression { params.PLATFORM == 'web' }
                            expression { params.PLATFORM == 'playwright' }
                            expression { params.PLATFORM == 'playwright-responsive' }
                            expression { params.PLATFORM == 'pixelmatch' }
                            expression { params.PLATFORM == 'pixelmatch-responsive' }
                        }
                    }
                    agent {
                        docker { image 'mcr.microsoft.com/playwright:v1.61.1-jammy'; args '-u 0' }
                    }
                    environment {
                        API_BASE_URL = credentials('API_BASE_URL')
                        BASE_URL = credentials('BASE_URL')
                    }
                    steps {
                        lock(resource: 'standard-user-writes') {
                            sh 'bash ci/steps/setup-environment.sh'
                            withEnv([
                                'PLATFORM=web', 'VIEWPORT=responsive', 'DRIVER=playwright', 'HEADLESS=true',
                                'PLUGIN_PLAYWRIGHT=true', 'PLUGIN_PIXELMATCH=true', 'PLUGIN_API=true'
                            ]) {
                                sh 'bash ci/steps/start-stack.sh web'
                            }
                            sh 'pnpm test:json:visual:responsive'
                            sh 'node scripts/visual-gate.js'
                        }
                    }
                    post {
                        always {
                            sh 'bash ci/steps/collect-artifacts.sh playwright-visual-responsive'
                            archiveArtifacts artifacts: 'artifacts/playwright-visual-responsive/**', allowEmptyArchive: true
                            archiveArtifacts artifacts: 'visual-results/**', allowEmptyArchive: true
                            sh 'bash ci/steps/teardown.sh'
                        }
                    }
                }

            }
        }

    }
}
