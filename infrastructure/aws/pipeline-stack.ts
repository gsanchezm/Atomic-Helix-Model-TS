import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';
import * as actions from 'aws-cdk-lib/aws-codepipeline-actions';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';

/**
 * CDK stack translating the 14 AWS CodeBuild buildspecs under
 * `infrastructure/aws/buildspec/` (one per `ci/pipeline.config.json` profile) into an
 * actual CodePipeline/CodeBuild/S3 deployment definition.
 *
 * This is a *definition*, not a deployment: no AWS account/CodeStar Connection exists
 * for this repo yet, matching this repo's "definitions only, provisioning is the user's
 * job" philosophy for every hosted-CI-service track (see the CI/CD pipelines plan's
 * §3.7/§6/§8). `cdk deploy` is not expected to be run against this stack until a real
 * CodeStar Connection ARN (and populated `ahm/ci` Secrets Manager secret) exist.
 *
 * The exact pinned Playwright container image tag, taken directly from
 * `.github/workflows/ahm-execution-helix.yml`'s `env.PLAYWRIGHT_IMAGE` / every
 * Playwright-family job's `container.image`. Do not drift this from the GHA pin.
 */
const PLAYWRIGHT_IMAGE = 'mcr.microsoft.com/playwright:v1.61.1-jammy';

/** The five profiles that run under the pinned Playwright container image above. */
const PLAYWRIGHT_PROFILES: ReadonlySet<string> = new Set([
  'playwright-desktop',
  'playwright-responsive',
  'playwright-visual-desktop',
  'playwright-visual-responsive',
  'a11y',
]);

export interface AhmPipelineStackProps extends cdk.StackProps {
  /**
   * ARN of a CodeStar Connections connection authorizing this pipeline to read the
   * GitHub repository. There is no default — this repo has no such connection
   * provisioned. It must be created once, out of band, e.g.:
   *
   *   aws codestar-connections create-connection \
   *     --provider-type GitHub --connection-name ahm-github
   *
   * ...and then manually confirmed in the AWS console (the CLI alone cannot complete
   * GitHub's OAuth handshake) before this stack can actually deploy. This is exactly
   * the kind of "user must arrange this" prerequisite the CI/CD pipelines plan's
   * §3.7/§6/§8 call out repeatedly for every hosted-CI-service track, AWS included.
   */
  readonly codeStarConnectionArn: string;

  /** GitHub repository owner/org, e.g. `'gsanchezm'`. */
  readonly githubOwner: string;

  /** GitHub repository name, e.g. `'Atomic-Helix-Model-TS'`. */
  readonly githubRepo: string;

  /**
   * @default 'main'
   */
  readonly githubBranch?: string;

  /**
   * Name of the Secrets Manager secret expected to hold JSON keys `API_BASE_URL` and
   * `BASE_URL` (matching every buildspec's own `env.secrets-manager` references to
   * `ahm/ci:API_BASE_URL` / `ahm/ci:BASE_URL`). This stack only *references* the secret
   * via `Secret.fromSecretNameV2` — it deliberately does not create or populate it.
   * Populating the actual secret values is the deployer's job, matching this repo's
   * "definitions only, provisioning is the user's job" philosophy.
   *
   * @default 'ahm/ci'
   */
  readonly secretsName?: string;
}

/** Static, per-profile configuration for the Test stage's 14 CodeBuild actions. */
interface TestProfileSpec {
  /** Profile name (matches `ci/pipeline.config.json`'s `profile` field). */
  readonly profile: string;
  /**
   * Path to this profile's already-committed buildspec file, read from the
   * checked-out source artifact via `BuildSpec.fromSourceFilename` — exactly the
   * pattern the CI/CD pipelines plan's own Task 5 Step 2 code sample uses. Written out
   * literally per profile (rather than templated from `profile`) so this file itself
   * stays the explicit, greppable source of truth for the 14-profile/14-buildspec
   * mapping.
   */
  readonly buildspecFile: string;
  /** CodePipeline RunOrder within the Test stage. */
  readonly runOrder: 1 | 2;
  /**
   * Whether `ci/pipeline.config.json`'s entry for this profile has a non-empty
   * `matrix` (7 of 14 do) — the CodeBuild-batch-build equivalent of that matrix. The
   * per-cell dimensions themselves live in the buildspec's own `batch:` block; this
   * flag only controls whether the CDK side opts the project/action into batch
   * execution at all.
   */
  readonly batch: boolean;
  /**
   * Whether this profile's buildspec/GHA job shells out to `docker run` (needs
   * privileged/Docker-in-Docker mode on the CodeBuild project).
   */
  readonly privileged: boolean;
  /**
   * Whether this profile needs the pipeline's resolved OmniPizza release URL
   * (`OMNIPIZZA_RELEASE_BASE_URL`) injected as an environment variable override.
   */
  readonly usesReleaseUrl: boolean;
  /**
   * Whether this profile needs the managed macOS build environment (`ios`'s standalone
   * project, and `mobilewright`'s single combined project, whose matrix includes an
   * `ios` platform cell).
   */
  readonly needsMacFleet: boolean;
  /**
   * Plaintext, project-level environment variable overrides. These are the CDK-side
   * defaults for this repo's closest AWS equivalent of GHA's `workflow_dispatch.inputs`
   * — see the "Configurable inputs" comment on `addTestAction` below for what
   * CodePipeline can and can't do here.
   */
  readonly plainTextEnv?: Readonly<Record<string, string>>;
}

const TEST_PROFILES: readonly TestProfileSpec[] = [
  // ---- RunOrder 1: 12 actions, run concurrently by CodePipeline. ----
  {
    profile: 'api',
    buildspecFile: 'infrastructure/aws/buildspec/api.buildspec.yml',
    runOrder: 1,
    batch: true,
    // DISCREPANCY, left as-is rather than silently "fixed": this profile's own
    // buildspec runs `docker compose -f infrastructure/minio-compose.yml up -d` in its
    // build phase (for MinIO telemetry storage), which needs the Docker daemon and so
    // arguably needs privileged:true — but this task's own brief enumerates the
    // privileged set as "android, ios, mobilewright, zap, mobsf, webdriverio" by name
    // and does not include `api`. That enumeration's own stated criterion ("shells out
    // to `docker run`") is narrower than its evident intent ("needs Docker"), since
    // `api` shells out to `docker compose`, not `docker run`, yet still needs a Docker
    // daemon. Kept false here to match the brief's explicit, literal list rather than
    // silently overriding it — flagged for reconciliation by whoever owns this stack.
    privileged: false,
    usesReleaseUrl: false,
    needsMacFleet: false,
  },
  {
    profile: 'playwright-desktop',
    buildspecFile: 'infrastructure/aws/buildspec/playwright-desktop.buildspec.yml',
    runOrder: 1,
    batch: true,
    privileged: false,
    usesReleaseUrl: false,
    needsMacFleet: false,
  },
  {
    profile: 'playwright-responsive',
    buildspecFile: 'infrastructure/aws/buildspec/playwright-responsive.buildspec.yml',
    runOrder: 1,
    batch: true,
    privileged: false,
    usesReleaseUrl: false,
    needsMacFleet: false,
  },
  {
    profile: 'android',
    buildspecFile: 'infrastructure/aws/buildspec/android.buildspec.yml',
    runOrder: 1,
    batch: true,
    // KVM CAVEAT: privileged:true is necessary (Docker-in-Docker for the
    // docker-android emulator container) but NOT sufficient — standard AWS CodeBuild
    // compute types do not expose /dev/kvm. This is a real, unresolved limitation
    // (matches the CI/CD pipelines plan's §3.6 table entry for AWS CodeBuild's
    // /dev/kvm row), not something this stack solves. A KVM-capable custom/bare-metal
    // CodeBuild fleet would be required for this to actually boot a
    // hardware-accelerated emulator; this project is written for structural/static
    // parity with the `e2e-android` GHA job, not a claim that it works as-is.
    privileged: true,
    usesReleaseUrl: true,
    needsMacFleet: false,
    plainTextEnv: { ANDROID_API_LEVEL: '33' },
  },
  {
    profile: 'ios',
    buildspecFile: 'infrastructure/aws/buildspec/ios.buildspec.yml',
    runOrder: 1,
    batch: true,
    privileged: true,
    usesReleaseUrl: true,
    needsMacFleet: true,
  },
  {
    profile: 'mobilewright',
    buildspecFile: 'infrastructure/aws/buildspec/mobilewright.buildspec.yml',
    runOrder: 1,
    batch: true,
    // See the KVM caveat on `android` above (identical gap for this project's android
    // matrix cell) and the macOS Fleet comment below `ios`'s project (identical gap
    // for this project's ios matrix cell) — this ONE PipelineProject covers BOTH
    // matrix cells (its buildspec already branches internally on $PLATFORM), so both
    // caveats apply to the same project simultaneously; neither is resolved here.
    privileged: true,
    usesReleaseUrl: true,
    needsMacFleet: true,
    plainTextEnv: { ANDROID_API_LEVEL: '33' },
  },
  {
    profile: 'webdriverio',
    buildspecFile: 'infrastructure/aws/buildspec/webdriverio.buildspec.yml',
    runOrder: 1,
    batch: true,
    privileged: true,
    usesReleaseUrl: false,
    needsMacFleet: false,
  },
  {
    profile: 'a11y',
    buildspecFile: 'infrastructure/aws/buildspec/a11y.buildspec.yml',
    runOrder: 1,
    batch: false,
    privileged: false,
    usesReleaseUrl: false,
    needsMacFleet: false,
  },
  {
    profile: 'zap',
    buildspecFile: 'infrastructure/aws/buildspec/zap.buildspec.yml',
    runOrder: 1,
    batch: false,
    privileged: true,
    usesReleaseUrl: false,
    needsMacFleet: false,
  },
  {
    profile: 'mobsf',
    buildspecFile: 'infrastructure/aws/buildspec/mobsf.buildspec.yml',
    runOrder: 1,
    batch: false,
    privileged: true,
    usesReleaseUrl: true,
    needsMacFleet: false,
  },
  {
    profile: 'cypress',
    buildspecFile: 'infrastructure/aws/buildspec/cypress.buildspec.yml',
    runOrder: 1,
    batch: false,
    privileged: false,
    usesReleaseUrl: false,
    needsMacFleet: false,
  },
  {
    profile: 'gatling',
    buildspecFile: 'infrastructure/aws/buildspec/gatling.buildspec.yml',
    runOrder: 1,
    batch: false,
    privileged: false,
    usesReleaseUrl: false,
    needsMacFleet: false,
    plainTextEnv: { PERF_PROFILE: 'smoke', PERF_USERS: '20', PERF_DURATION: '120' },
  },
  // ---- RunOrder 2: 2 actions. CodePipeline requires ALL RunOrder-1 actions in a
  // stage to finish before ANY RunOrder-2 action starts — this correctly (if slightly
  // coarsely, since it also waits on unrelated actions like `gatling`, not just the
  // one visual actually depends on) captures GHA's `visual-web: needs: e2e-web` /
  // `visual-web-responsive: needs: e2e-web-responsive` ordering. CodePipeline has no
  // finer-grained intra-stage "depends on this one specific sibling action" primitive,
  // so this is NOT a perfect 1:1 translation of GHA's per-job `needs:` graph — it is
  // the closest structural equivalent CodePipeline's RunOrder semantics allow. ----
  {
    profile: 'playwright-visual-desktop',
    buildspecFile: 'infrastructure/aws/buildspec/playwright-visual-desktop.buildspec.yml',
    runOrder: 2,
    batch: false,
    privileged: false,
    usesReleaseUrl: false,
    needsMacFleet: false,
  },
  {
    profile: 'playwright-visual-responsive',
    buildspecFile: 'infrastructure/aws/buildspec/playwright-visual-responsive.buildspec.yml',
    runOrder: 2,
    batch: false,
    privileged: false,
    usesReleaseUrl: false,
    needsMacFleet: false,
  },
];

/** Converts a kebab-case profile name into a PascalCase construct-id/action-name fragment. */
function pascalCase(profile: string): string {
  return profile
    .split('-')
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join('');
}

/** Context shared by every `addTestAction` call — assembled once in the constructor. */
interface TestActionContext {
  readonly sourceOutput: codepipeline.Artifact;
  readonly ciSecrets: secretsmanager.ISecret;
  readonly omnipizzaReleaseBaseUrl: string;
  readonly macFleet: codebuild.IFleet | undefined;
}

export class AhmPipelineStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: AhmPipelineStackProps) {
    super(scope, id, props);

    const githubBranch = props.githubBranch ?? 'main';
    const secretsName = props.secretsName ?? 'ahm/ci';

    // -----------------------------------------------------------------------------
    // S3 artifact bucket
    // -----------------------------------------------------------------------------
    const artifactBucket = new s3.Bucket(this, 'PipelineArtifactBucket', {
      versioned: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    });

    // -----------------------------------------------------------------------------
    // Secrets Manager reference — NOT a newly-created secret. The actual secret
    // values (API_BASE_URL, BASE_URL) must be populated by whoever deploys this stack,
    // matching this repo's own "definitions only, provisioning is the user's job"
    // philosophy stated throughout the CI/CD pipelines plan.
    // -----------------------------------------------------------------------------
    const ciSecrets = secretsmanager.Secret.fromSecretNameV2(this, 'AhmCiSecrets', secretsName);

    // -----------------------------------------------------------------------------
    // Pipeline
    // -----------------------------------------------------------------------------
    const pipeline = new codepipeline.Pipeline(this, 'Pipeline', {
      artifactBucket,
      restartExecutionOnUpdate: false,
    });

    // -----------------------------------------------------------------------------
    // Stage: Source
    // -----------------------------------------------------------------------------
    const sourceOutput = new codepipeline.Artifact('SourceOutput');
    const sourceAction = new actions.CodeStarConnectionsSourceAction({
      actionName: 'GitHub_Source',
      connectionArn: props.codeStarConnectionArn,
      owner: props.githubOwner,
      repo: props.githubRepo,
      branch: githubBranch,
      output: sourceOutput,
    });
    pipeline.addStage({ stageName: 'Source', actions: [sourceAction] });

    // -----------------------------------------------------------------------------
    // Stage: Resolve — mirrors GHA's `resolve-omnipizza-release` job. Inline buildspec
    // (via BuildSpec.fromObject), not a committed file: this job isn't one of
    // ci/pipeline.config.json's 14 profiles, so it has no
    // infrastructure/aws/buildspec/*.buildspec.yml of its own, exactly like GHA's job
    // has no ci/steps/* call — just inline curl/jq.
    //
    // GITHUB_TOKEN is optional here. GHA auto-injects a token into every job's
    // environment; CodeBuild has no equivalent auto-injection, so unauthenticated
    // GitHub API calls are the default, and a token is an opt-in plaintext/secret
    // environment variable override a deployer can add later if they hit GitHub's
    // unauthenticated rate limits. `jq` is present in AWS CodeBuild's standard managed
    // images, matching the GHA `jq` usage directly — no Node-based JSON parse
    // workaround is needed.
    // -----------------------------------------------------------------------------
    const resolveProject = new codebuild.PipelineProject(this, 'ResolveOmnipizzaReleaseProject', {
      description: 'Resolves the latest OmniPizza release tag/download URL (mirrors the resolve-omnipizza-release GHA job).',
      buildSpec: codebuild.BuildSpec.fromObject({
        version: '0.2',
        phases: {
          build: {
            commands: [
              [
                'AUTH_HEADER=()',
                'if [ -n "${GITHUB_TOKEN:-}" ]; then AUTH_HEADER=(-H "Authorization: Bearer $GITHUB_TOKEN"); fi',
                'TAG=$(curl -fsSL "${AUTH_HEADER[@]}" -H "Accept: application/vnd.github+json" -H "X-GitHub-Api-Version: 2022-11-28" "https://api.github.com/repos/gsanchezm/OmniPizza/releases/latest" | jq -r .tag_name)',
                'if [ -z "$TAG" ] || [ "$TAG" = "null" ]; then',
                '  echo "Failed to resolve latest OmniPizza release tag."',
                '  exit 1',
                'fi',
                'export BASE_URL="https://github.com/gsanchezm/OmniPizza/releases/download/$TAG"',
                'echo "Resolved OmniPizza release: $TAG"',
                'echo "Download base URL: $BASE_URL"',
              ].join('\n'),
            ],
          },
        },
        env: {
          'exported-variables': ['TAG', 'BASE_URL'],
        },
      }),
    });

    // Variables namespace so downstream Test-stage actions can consume BASE_URL — this
    // is CodePipeline's real, documented mechanism for `needs.<job>.outputs.*`-style
    // cross-action data flow (GHA's resolve-omnipizza-release job output is consumed
    // by e2e-android/e2e-ios/e2e-mobilewright/security-mobsf via
    // `needs.resolve-omnipizza-release.outputs.base_url`; this is the same
    // relationship, expressed via CodePipeline's variable namespace instead).
    //
    // `CodeBuildAction#variable()` (confirmed present on the installed aws-cdk-lib
    // version — see node_modules/aws-cdk-lib/aws-codepipeline-actions/lib/codebuild/
    // build-action.d.ts) is the ergonomic, type-checked path: it returns the
    // `#{Namespace.Var}` placeholder string CodePipeline substitutes at execution
    // time, without us having to hand-write that syntax ourselves. The raw-string
    // fallback described in this task's brief was NOT needed.
    const resolveAction = new actions.CodeBuildAction({
      actionName: 'ResolveOmnipizzaRelease',
      project: resolveProject,
      input: sourceOutput,
      variablesNamespace: 'ResolveOmnipizzaRelease',
    });
    pipeline.addStage({ stageName: 'Resolve', actions: [resolveAction] });

    const omnipizzaReleaseBaseUrl = resolveAction.variable('BASE_URL');

    // -----------------------------------------------------------------------------
    // Managed macOS build environment for `ios` (and `mobilewright`'s combined
    // project's ios matrix cell).
    //
    // The installed aws-cdk-lib version (2.261.0) DOES expose a real `codebuild.Fleet`
    // construct plus an `EnvironmentType.MAC_ARM` value and a dedicated
    // `codebuild.MacBuildImage` class (confirmed by grepping
    // node_modules/aws-cdk-lib/aws-codebuild/lib/{fleet,environment-type,project}.d.ts
    // — this was NOT assumed or guessed). This is wired below. It is, however, UNVERIFIED
    // against a live AWS account: no AWS account exists for this repo, so this fleet
    // has never actually been synthesized/deployed/exercised against real CodeBuild
    // macOS capacity, and the specific `MacBuildImage.BASE_14` image tag chosen here
    // should be re-confirmed against current AWS CodeBuild docs at real deploy time.
    // -----------------------------------------------------------------------------
    const macFleet = new codebuild.Fleet(this, 'MacBuildFleet', {
      baseCapacity: 1,
      computeType: codebuild.FleetComputeType.MEDIUM,
      environmentType: codebuild.EnvironmentType.MAC_ARM,
    });

    // -----------------------------------------------------------------------------
    // Stage: Test — one CodeBuildAction/PipelineProject per buildspec profile (14
    // total). See `addTestAction` below for the shared construction logic.
    // -----------------------------------------------------------------------------
    const context: TestActionContext = { sourceOutput, ciSecrets, omnipizzaReleaseBaseUrl, macFleet };
    const testActions = TEST_PROFILES.map((spec) => this.addTestAction(spec, context));
    pipeline.addStage({ stageName: 'Test', actions: testActions });
  }

  /**
   * Builds the CodeBuild Project + CodeBuildAction pair for one buildspec profile,
   * avoiding ~10 repeated lines of construction per profile across all 14.
   *
   * Configurable "workflow_dispatch input"-equivalent plaintext env vars
   * (ANDROID_API_LEVEL / PERF_PROFILE / PERF_USERS / PERF_DURATION): CodePipeline has
   * no per-execution "choose platform/params" input the way GHA's
   * `workflow_dispatch.inputs` does. The closest AWS equivalents are (a) letting the
   * full pipeline run with the baseline defaults set here on every execution, or (b)
   * overriding a specific CodeBuild project's environment variables at `StartBuild`
   * time via the AWS CLI/console for a one-off manual run of just that profile,
   * bypassing pipeline orchestration for that run. There is no fake "platform
   * selector" invented here — CodePipeline simply doesn't have one.
   */
  private addTestAction(spec: TestProfileSpec, ctx: TestActionContext): actions.CodeBuildAction {
    const id = pascalCase(spec.profile);

    const environment: codebuild.BuildEnvironment = {
      privileged: spec.privileged,
      buildImage: spec.needsMacFleet
        ? codebuild.MacBuildImage.BASE_14
        : PLAYWRIGHT_PROFILES.has(spec.profile)
          ? codebuild.LinuxBuildImage.fromDockerRegistry(PLAYWRIGHT_IMAGE)
          : codebuild.LinuxBuildImage.STANDARD_7_0,
      fleet: spec.needsMacFleet ? ctx.macFleet : undefined,
    };

    const projectEnvironmentVariables: Record<string, codebuild.BuildEnvironmentVariable> | undefined = spec.plainTextEnv
      ? Object.fromEntries(Object.entries(spec.plainTextEnv).map(([name, value]) => [name, { value }]))
      : undefined;

    const project = new codebuild.PipelineProject(this, `${id}Project`, {
      projectName: `ahm-ci-${spec.profile}`,
      buildSpec: codebuild.BuildSpec.fromSourceFilename(spec.buildspecFile),
      environment,
      environmentVariables: projectEnvironmentVariables,
    });

    // Secrets Manager grant: every one of the 14 buildspecs has an
    // `env.secrets-manager` block referencing `ahm/ci` (confirmed by reading every
    // buildspec file directly, not assumed) — CDK cannot infer that a buildspec YAML
    // string references Secrets Manager, so this grant must be explicit per project,
    // or the pipeline would be broken in a way static validation can't catch.
    ctx.ciSecrets.grantRead(project);

    if (spec.batch) {
      project.enableBatchBuilds();
    }

    const actionEnvironmentVariables: Record<string, codebuild.BuildEnvironmentVariable> = {};
    if (spec.usesReleaseUrl) {
      // Resolved-release env var, sourced from the Resolve stage's exported BASE_URL
      // CodePipeline variable — see the `resolveAction`/`omnipizzaReleaseBaseUrl`
      // comment in the constructor.
      actionEnvironmentVariables.OMNIPIZZA_RELEASE_BASE_URL = { value: ctx.omnipizzaReleaseBaseUrl };
    }

    return new actions.CodeBuildAction({
      actionName: id,
      project,
      input: ctx.sourceOutput,
      runOrder: spec.runOrder,
      executeBatchBuild: spec.batch ? true : undefined,
      combineBatchBuildArtifacts: spec.batch ? true : undefined,
      environmentVariables: Object.keys(actionEnvironmentVariables).length > 0 ? actionEnvironmentVariables : undefined,
    });
  }
}
