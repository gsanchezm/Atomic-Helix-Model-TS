# TOM Quality Attribute Summary

architecture_type = **TOM**. These metrics evaluate the automation architecture, not the OmniPizza application under test.

## Maintainability

| Quality Attribute | Metric | Value | Unit | Tool | Batch | Source |
|---|---:|---:|---|---|---|---|
| Maintainability | average_file_size_loc | 71.83 | loc | ALL | ps-2026-campaign | src/**/*.ts |
| Maintainability | cyclomatic_complexity_if_available | NOT_AVAILABLE | complexity | ALL | ps-2026-campaign | no AST pass (heuristic unavailable) |
| Maintainability | duplicated_code_percentage | 7.44 | percent | ALL | ps-2026-campaign | src/**/*.ts |
| Maintainability | duplicated_loc | 1406 | loc | ALL | ps-2026-campaign | src/**/*.ts |
| Maintainability | failure_bucket_coverage_percentage | 100 | percent | ALL | ps-2026-campaign | metrics/processed/failure_buckets.csv |
| Maintainability | files_touched_per_change | 2.12 | files | ALL | ps-2026-campaign | git log |
| Maintainability | max_file_size_loc | 849 | loc | ALL | ps-2026-campaign | src/**/*.ts |
| Maintainability | telemetry_completeness_percentage | NOT_AVAILABLE | percent | ALL | ps-2026-campaign | metrics/raw/tool-events/*.jsonl (none) |

## Modifiability

| Quality Attribute | Metric | Value | Unit | Tool | Batch | Source |
|---|---:|---:|---|---|---|---|
| Modifiability | adapter_files_modified | NOT_AVAILABLE | files | ALL | ps-2026-campaign | git diff unavailable (set METRICS_BASE_REF) |
| Modifiability | change_impact_score | NOT_AVAILABLE | score | ALL | ps-2026-campaign | git diff unavailable (set METRICS_BASE_REF) |
| Modifiability | configuration_files_modified | NOT_AVAILABLE | files | ALL | ps-2026-campaign | git diff unavailable (set METRICS_BASE_REF) |
| Modifiability | core_files_modified | NOT_AVAILABLE | files | ALL | ps-2026-campaign | git diff unavailable (set METRICS_BASE_REF) |
| Modifiability | execution_layer_files_modified | NOT_AVAILABLE | files | ALL | ps-2026-campaign | git diff unavailable (set METRICS_BASE_REF) |
| Modifiability | loc_added | NOT_AVAILABLE | loc | ALL | ps-2026-campaign | git diff unavailable (set METRICS_BASE_REF) |
| Modifiability | loc_deleted | NOT_AVAILABLE | loc | ALL | ps-2026-campaign | git diff unavailable (set METRICS_BASE_REF) |
| Modifiability | loc_modified | NOT_AVAILABLE | loc | ALL | ps-2026-campaign | git diff unavailable (set METRICS_BASE_REF) |
| Modifiability | reporting_files_modified | NOT_AVAILABLE | files | ALL | ps-2026-campaign | git diff unavailable (set METRICS_BASE_REF) |

## Extensibility

| Quality Attribute | Metric | Value | Unit | Tool | Batch | Source |
|---|---:|---:|---|---|---|---|
| Extensibility | existing_core_files_changed_for_new_tool | NOT_AVAILABLE | files | ALL | ps-2026-campaign | no tool-integration manifests; git diff unavailable (set METRICS_BASE_REF) |
| Extensibility | integration_effort_proxy_score | NOT_AVAILABLE | score | ALL | ps-2026-campaign | no tool-integration manifests; git diff unavailable (set METRICS_BASE_REF) |
| Extensibility | new_action_or_adapter_count | NOT_AVAILABLE | count | ALL | ps-2026-campaign | no tool-integration manifests; git diff unavailable (set METRICS_BASE_REF) |
| Extensibility | new_tool_files_added | NOT_AVAILABLE | files | ALL | ps-2026-campaign | no tool-integration manifests; git diff unavailable (set METRICS_BASE_REF) |
| Extensibility | new_tool_files_modified | NOT_AVAILABLE | files | ALL | ps-2026-campaign | no tool-integration manifests; git diff unavailable (set METRICS_BASE_REF) |
| Extensibility | new_tool_loc_added | NOT_AVAILABLE | loc | ALL | ps-2026-campaign | no tool-integration manifests; git diff unavailable (set METRICS_BASE_REF) |
| Extensibility | registration_changes_count | NOT_AVAILABLE | count | ALL | ps-2026-campaign | no tool-integration manifests; git diff unavailable (set METRICS_BASE_REF) |

## Reusability

| Quality Attribute | Metric | Value | Unit | Tool | Batch | Source |
|---|---:|---:|---|---|---|---|
| Reusability | api_contract_reuse_count | 6 | count | ALL | ps-2026-campaign | heuristic: *.api.contract.json under src/core/tests/**/contracts/** |
| Reusability | feature_to_tool_coverage | 0.43 | ratio | ALL | ps-2026-campaign | executed (feature,tool) pairs / expected (feature,tool) pairs from tags; NA when tool attribution absent |
| Reusability | locator_contract_reuse_count | 15 | count | ALL | ps-2026-campaign | heuristic: *.locators.json under src/core/tests/**/contracts/** |
| Reusability | scenario_reuse_ratio | 0.61 | ratio | ALL | ps-2026-campaign | metrics/processed/platform_coverage_matrix.csv |
| Reusability | shared_contract_reuse_count | 28 | count | ALL | ps-2026-campaign | heuristic: all contract files under src/core/tests/**/contracts/** |
| Reusability | shared_step_reuse_count | 15 | count | ALL | ps-2026-campaign | heuristic: src/core/tests/**/step_definitions/*.ts file count |
| Reusability | test_data_reuse_count | 22 | count | ALL | ps-2026-campaign | heuristic: data-access and fixture/data files under the test slices (excl .gitkeep) |
| Reusability | visual_contract_reuse_count | 7 | count | ALL | ps-2026-campaign | heuristic: *.visual.json under src/core/tests/**/contracts/** |

## Reliability

| Quality Attribute | Metric | Value | Unit | Tool | Batch | Source |
|---|---:|---:|---|---|---|---|
| Reliability | fail_rate | 0.01 | ratio | ALL | ALL | metrics/processed/scenario_outcome_history.csv |
| Reliability | fail_to_pass_probability | 0.96 | ratio | ALL | ALL | metrics/processed/scenario_outcome_history.csv |
| Reliability | flaky_scenario_count | 39 | count | ALL | ALL | metrics/processed/scenario_outcome_history.csv |
| Reliability | infrastructure_failure_rate | 0 | ratio | ALL | ALL | metrics/processed/failure_buckets.csv (INFRASTRUCTURE_FAILURE / total observations) |
| Reliability | pass_rate | 0.99 | ratio | ALL | ALL | metrics/processed/scenario_outcome_history.csv |
| Reliability | pass_to_fail_probability | 0.01 | ratio | ALL | ALL | metrics/processed/scenario_outcome_history.csv |
| Reliability | retry_count | NOT_AVAILABLE | count | ALL | ALL | not measured upstream |
| Reliability | tool_failure_rate | 0.01 | ratio | ALL | ALL | metrics/processed/failure_buckets.csv (WEB/MOBILE_SESSION + LOCATOR_RESOLUTION / total observations) |
| Reliability | fail_rate | 0.03 | ratio | UNKNOWN | ALL | metrics/processed/scenario_outcome_history.csv |
| Reliability | fail_to_pass_probability |  | ratio | UNKNOWN | ALL | metrics/processed/scenario_outcome_history.csv |
| Reliability | flaky_scenario_count | 0 | count | UNKNOWN | ALL | metrics/processed/scenario_outcome_history.csv |
| Reliability | infrastructure_failure_rate | 0 | ratio | UNKNOWN | ALL | metrics/processed/failure_buckets.csv (INFRASTRUCTURE_FAILURE / total observations) |
| Reliability | pass_rate | 0.97 | ratio | UNKNOWN | ALL | metrics/processed/scenario_outcome_history.csv |
| Reliability | pass_to_fail_probability |  | ratio | UNKNOWN | ALL | metrics/processed/scenario_outcome_history.csv |
| Reliability | retry_count | NOT_AVAILABLE | count | UNKNOWN | ALL | not measured upstream |
| Reliability | tool_failure_rate | 0 | ratio | UNKNOWN | ALL | metrics/processed/failure_buckets.csv (WEB/MOBILE_SESSION + LOCATOR_RESOLUTION / total observations) |
| Reliability | fail_rate | 0 | ratio | appium-android | ALL | metrics/processed/scenario_outcome_history.csv |
| Reliability | fail_to_pass_probability | 0.92 | ratio | appium-android | ALL | metrics/processed/scenario_outcome_history.csv |
| Reliability | flaky_scenario_count | 7 | count | appium-android | ALL | metrics/processed/scenario_outcome_history.csv |
| Reliability | infrastructure_failure_rate | 0 | ratio | appium-android | ALL | metrics/processed/failure_buckets.csv (INFRASTRUCTURE_FAILURE / total observations) |
| Reliability | pass_rate | 1 | ratio | appium-android | ALL | metrics/processed/scenario_outcome_history.csv |
| Reliability | pass_to_fail_probability | 0 | ratio | appium-android | ALL | metrics/processed/scenario_outcome_history.csv |
| Reliability | retry_count | NOT_AVAILABLE | count | appium-android | ALL | not measured upstream |
| Reliability | tool_failure_rate | 0 | ratio | appium-android | ALL | metrics/processed/failure_buckets.csv (WEB/MOBILE_SESSION + LOCATOR_RESOLUTION / total observations) |
| Reliability | fail_rate | 0.06 | ratio | non-atomic-twin-android | ALL | metrics/processed/scenario_outcome_history.csv |
| Reliability | fail_to_pass_probability | 0.98 | ratio | non-atomic-twin-android | ALL | metrics/processed/scenario_outcome_history.csv |
| Reliability | flaky_scenario_count | 32 | count | non-atomic-twin-android | ALL | metrics/processed/scenario_outcome_history.csv |
| Reliability | infrastructure_failure_rate | 0 | ratio | non-atomic-twin-android | ALL | metrics/processed/failure_buckets.csv (INFRASTRUCTURE_FAILURE / total observations) |
| Reliability | pass_rate | 0.94 | ratio | non-atomic-twin-android | ALL | metrics/processed/scenario_outcome_history.csv |
| Reliability | pass_to_fail_probability | 0.06 | ratio | non-atomic-twin-android | ALL | metrics/processed/scenario_outcome_history.csv |
| Reliability | retry_count | NOT_AVAILABLE | count | non-atomic-twin-android | ALL | not measured upstream |
| Reliability | tool_failure_rate | 0.06 | ratio | non-atomic-twin-android | ALL | metrics/processed/failure_buckets.csv (WEB/MOBILE_SESSION + LOCATOR_RESOLUTION / total observations) |
| Reliability | fail_rate | 0 | ratio | non-atomic-twin-web | ALL | metrics/processed/scenario_outcome_history.csv |
| Reliability | fail_to_pass_probability |  | ratio | non-atomic-twin-web | ALL | metrics/processed/scenario_outcome_history.csv |
| Reliability | flaky_scenario_count | 0 | count | non-atomic-twin-web | ALL | metrics/processed/scenario_outcome_history.csv |
| Reliability | infrastructure_failure_rate | NOT_AVAILABLE | ratio | non-atomic-twin-web | ALL | metrics/processed/failure_buckets.csv |
| Reliability | pass_rate | 1 | ratio | non-atomic-twin-web | ALL | metrics/processed/scenario_outcome_history.csv |
| Reliability | pass_to_fail_probability | 0 | ratio | non-atomic-twin-web | ALL | metrics/processed/scenario_outcome_history.csv |
| Reliability | retry_count | NOT_AVAILABLE | count | non-atomic-twin-web | ALL | not measured upstream |
| Reliability | tool_failure_rate | NOT_AVAILABLE | ratio | non-atomic-twin-web | ALL | metrics/processed/failure_buckets.csv |
| Reliability | fail_rate | 0 | ratio | playwright | ALL | metrics/processed/scenario_outcome_history.csv |
| Reliability | fail_to_pass_probability |  | ratio | playwright | ALL | metrics/processed/scenario_outcome_history.csv |
| Reliability | flaky_scenario_count | 0 | count | playwright | ALL | metrics/processed/scenario_outcome_history.csv |
| Reliability | infrastructure_failure_rate | NOT_AVAILABLE | ratio | playwright | ALL | metrics/processed/failure_buckets.csv |
| Reliability | pass_rate | 1 | ratio | playwright | ALL | metrics/processed/scenario_outcome_history.csv |
| Reliability | pass_to_fail_probability | 0 | ratio | playwright | ALL | metrics/processed/scenario_outcome_history.csv |
| Reliability | retry_count | NOT_AVAILABLE | count | playwright | ALL | not measured upstream |
| Reliability | tool_failure_rate | NOT_AVAILABLE | ratio | playwright | ALL | metrics/processed/failure_buckets.csv |
| Reliability | fail_rate | 0.03 | ratio | UNKNOWN | batch-adhoc | metrics/processed/scenario_outcome_history.csv |
| Reliability | fail_to_pass_probability |  | ratio | UNKNOWN | batch-adhoc | metrics/processed/scenario_outcome_history.csv |
| Reliability | flaky_scenario_count | 0 | count | UNKNOWN | batch-adhoc | metrics/processed/scenario_outcome_history.csv |
| Reliability | infrastructure_failure_rate | 0 | ratio | UNKNOWN | batch-adhoc | metrics/processed/failure_buckets.csv (INFRASTRUCTURE_FAILURE / total observations) |
| Reliability | pass_rate | 0.97 | ratio | UNKNOWN | batch-adhoc | metrics/processed/scenario_outcome_history.csv |
| Reliability | pass_to_fail_probability |  | ratio | UNKNOWN | batch-adhoc | metrics/processed/scenario_outcome_history.csv |
| Reliability | retry_count | NOT_AVAILABLE | count | UNKNOWN | batch-adhoc | not measured upstream |
| Reliability | tool_failure_rate | 0 | ratio | UNKNOWN | batch-adhoc | metrics/processed/failure_buckets.csv (WEB/MOBILE_SESSION + LOCATOR_RESOLUTION / total observations) |
| Reliability | fail_rate | 0 | ratio | appium-android | det-2026-campaign | metrics/processed/scenario_outcome_history.csv |
| Reliability | fail_to_pass_probability | 0.83 | ratio | appium-android | det-2026-campaign | metrics/processed/scenario_outcome_history.csv |
| Reliability | flaky_scenario_count | 1 | count | appium-android | det-2026-campaign | metrics/processed/scenario_outcome_history.csv |
| Reliability | infrastructure_failure_rate | 0 | ratio | appium-android | det-2026-campaign | metrics/processed/failure_buckets.csv (INFRASTRUCTURE_FAILURE / total observations) |
| Reliability | pass_rate | 1 | ratio | appium-android | det-2026-campaign | metrics/processed/scenario_outcome_history.csv |
| Reliability | pass_to_fail_probability | 0 | ratio | appium-android | det-2026-campaign | metrics/processed/scenario_outcome_history.csv |
| Reliability | retry_count | NOT_AVAILABLE | count | appium-android | det-2026-campaign | not measured upstream |
| Reliability | tool_failure_rate | 0 | ratio | appium-android | det-2026-campaign | metrics/processed/failure_buckets.csv (WEB/MOBILE_SESSION + LOCATOR_RESOLUTION / total observations) |
| Reliability | fail_rate | 0.05 | ratio | non-atomic-twin-android | det-2026-campaign | metrics/processed/scenario_outcome_history.csv |
| Reliability | fail_to_pass_probability | 1 | ratio | non-atomic-twin-android | det-2026-campaign | metrics/processed/scenario_outcome_history.csv |
| Reliability | flaky_scenario_count | 16 | count | non-atomic-twin-android | det-2026-campaign | metrics/processed/scenario_outcome_history.csv |
| Reliability | infrastructure_failure_rate | 0 | ratio | non-atomic-twin-android | det-2026-campaign | metrics/processed/failure_buckets.csv (INFRASTRUCTURE_FAILURE / total observations) |
| Reliability | pass_rate | 0.95 | ratio | non-atomic-twin-android | det-2026-campaign | metrics/processed/scenario_outcome_history.csv |
| Reliability | pass_to_fail_probability | 0.05 | ratio | non-atomic-twin-android | det-2026-campaign | metrics/processed/scenario_outcome_history.csv |
| Reliability | retry_count | NOT_AVAILABLE | count | non-atomic-twin-android | det-2026-campaign | not measured upstream |
| Reliability | tool_failure_rate | 0.04 | ratio | non-atomic-twin-android | det-2026-campaign | metrics/processed/failure_buckets.csv (WEB/MOBILE_SESSION + LOCATOR_RESOLUTION / total observations) |
| Reliability | fail_rate | 0 | ratio | non-atomic-twin-web | det-2026-campaign | metrics/processed/scenario_outcome_history.csv |
| Reliability | fail_to_pass_probability |  | ratio | non-atomic-twin-web | det-2026-campaign | metrics/processed/scenario_outcome_history.csv |
| Reliability | flaky_scenario_count | 0 | count | non-atomic-twin-web | det-2026-campaign | metrics/processed/scenario_outcome_history.csv |
| Reliability | infrastructure_failure_rate | NOT_AVAILABLE | ratio | non-atomic-twin-web | det-2026-campaign | metrics/processed/failure_buckets.csv |
| Reliability | pass_rate | 1 | ratio | non-atomic-twin-web | det-2026-campaign | metrics/processed/scenario_outcome_history.csv |
| Reliability | pass_to_fail_probability | 0 | ratio | non-atomic-twin-web | det-2026-campaign | metrics/processed/scenario_outcome_history.csv |
| Reliability | retry_count | NOT_AVAILABLE | count | non-atomic-twin-web | det-2026-campaign | not measured upstream |
| Reliability | tool_failure_rate | NOT_AVAILABLE | ratio | non-atomic-twin-web | det-2026-campaign | metrics/processed/failure_buckets.csv |
| Reliability | fail_rate | 0 | ratio | playwright | det-2026-campaign | metrics/processed/scenario_outcome_history.csv |
| Reliability | fail_to_pass_probability |  | ratio | playwright | det-2026-campaign | metrics/processed/scenario_outcome_history.csv |
| Reliability | flaky_scenario_count | 0 | count | playwright | det-2026-campaign | metrics/processed/scenario_outcome_history.csv |
| Reliability | infrastructure_failure_rate | NOT_AVAILABLE | ratio | playwright | det-2026-campaign | metrics/processed/failure_buckets.csv |
| Reliability | pass_rate | 1 | ratio | playwright | det-2026-campaign | metrics/processed/scenario_outcome_history.csv |
| Reliability | pass_to_fail_probability | 0 | ratio | playwright | det-2026-campaign | metrics/processed/scenario_outcome_history.csv |
| Reliability | retry_count | NOT_AVAILABLE | count | playwright | det-2026-campaign | not measured upstream |
| Reliability | tool_failure_rate | NOT_AVAILABLE | ratio | playwright | det-2026-campaign | metrics/processed/failure_buckets.csv |
| Reliability | fail_rate | 0.01 | ratio | appium-android | eff-2026-campaign-android | metrics/processed/scenario_outcome_history.csv |
| Reliability | fail_to_pass_probability | 1 | ratio | appium-android | eff-2026-campaign-android | metrics/processed/scenario_outcome_history.csv |
| Reliability | flaky_scenario_count | 6 | count | appium-android | eff-2026-campaign-android | metrics/processed/scenario_outcome_history.csv |
| Reliability | infrastructure_failure_rate | 0 | ratio | appium-android | eff-2026-campaign-android | metrics/processed/failure_buckets.csv (INFRASTRUCTURE_FAILURE / total observations) |
| Reliability | pass_rate | 0.99 | ratio | appium-android | eff-2026-campaign-android | metrics/processed/scenario_outcome_history.csv |
| Reliability | pass_to_fail_probability | 0.01 | ratio | appium-android | eff-2026-campaign-android | metrics/processed/scenario_outcome_history.csv |
| Reliability | retry_count | NOT_AVAILABLE | count | appium-android | eff-2026-campaign-android | not measured upstream |
| Reliability | tool_failure_rate | 0.01 | ratio | appium-android | eff-2026-campaign-android | metrics/processed/failure_buckets.csv (WEB/MOBILE_SESSION + LOCATOR_RESOLUTION / total observations) |
| Reliability | fail_rate | 0.09 | ratio | non-atomic-twin-android | eff-2026-campaign-android | metrics/processed/scenario_outcome_history.csv |
| Reliability | fail_to_pass_probability | 0.94 | ratio | non-atomic-twin-android | eff-2026-campaign-android | metrics/processed/scenario_outcome_history.csv |
| Reliability | flaky_scenario_count | 16 | count | non-atomic-twin-android | eff-2026-campaign-android | metrics/processed/scenario_outcome_history.csv |
| Reliability | infrastructure_failure_rate | 0 | ratio | non-atomic-twin-android | eff-2026-campaign-android | metrics/processed/failure_buckets.csv (INFRASTRUCTURE_FAILURE / total observations) |
| Reliability | pass_rate | 0.91 | ratio | non-atomic-twin-android | eff-2026-campaign-android | metrics/processed/scenario_outcome_history.csv |
| Reliability | pass_to_fail_probability | 0.09 | ratio | non-atomic-twin-android | eff-2026-campaign-android | metrics/processed/scenario_outcome_history.csv |
| Reliability | retry_count | NOT_AVAILABLE | count | non-atomic-twin-android | eff-2026-campaign-android | not measured upstream |
| Reliability | tool_failure_rate | 0.09 | ratio | non-atomic-twin-android | eff-2026-campaign-android | metrics/processed/failure_buckets.csv (WEB/MOBILE_SESSION + LOCATOR_RESOLUTION / total observations) |
| Reliability | fail_rate | 0 | ratio | non-atomic-twin-web | eff-2026-campaign-web | metrics/processed/scenario_outcome_history.csv |
| Reliability | fail_to_pass_probability |  | ratio | non-atomic-twin-web | eff-2026-campaign-web | metrics/processed/scenario_outcome_history.csv |
| Reliability | flaky_scenario_count | 0 | count | non-atomic-twin-web | eff-2026-campaign-web | metrics/processed/scenario_outcome_history.csv |
| Reliability | infrastructure_failure_rate | NOT_AVAILABLE | ratio | non-atomic-twin-web | eff-2026-campaign-web | metrics/processed/failure_buckets.csv |
| Reliability | pass_rate | 1 | ratio | non-atomic-twin-web | eff-2026-campaign-web | metrics/processed/scenario_outcome_history.csv |
| Reliability | pass_to_fail_probability | 0 | ratio | non-atomic-twin-web | eff-2026-campaign-web | metrics/processed/scenario_outcome_history.csv |
| Reliability | retry_count | NOT_AVAILABLE | count | non-atomic-twin-web | eff-2026-campaign-web | not measured upstream |
| Reliability | tool_failure_rate | NOT_AVAILABLE | ratio | non-atomic-twin-web | eff-2026-campaign-web | metrics/processed/failure_buckets.csv |
| Reliability | fail_rate | 0 | ratio | playwright | eff-2026-campaign-web | metrics/processed/scenario_outcome_history.csv |
| Reliability | fail_to_pass_probability |  | ratio | playwright | eff-2026-campaign-web | metrics/processed/scenario_outcome_history.csv |
| Reliability | flaky_scenario_count | 0 | count | playwright | eff-2026-campaign-web | metrics/processed/scenario_outcome_history.csv |
| Reliability | infrastructure_failure_rate | NOT_AVAILABLE | ratio | playwright | eff-2026-campaign-web | metrics/processed/failure_buckets.csv |
| Reliability | pass_rate | 1 | ratio | playwright | eff-2026-campaign-web | metrics/processed/scenario_outcome_history.csv |
| Reliability | pass_to_fail_probability | 0 | ratio | playwright | eff-2026-campaign-web | metrics/processed/scenario_outcome_history.csv |
| Reliability | retry_count | NOT_AVAILABLE | count | playwright | eff-2026-campaign-web | not measured upstream |
| Reliability | tool_failure_rate | NOT_AVAILABLE | ratio | playwright | eff-2026-campaign-web | metrics/processed/failure_buckets.csv |
| Reliability | fail_rate | 0 | ratio | non-atomic-twin-web | ps-2026-campaign | metrics/processed/scenario_outcome_history.csv |
| Reliability | fail_to_pass_probability |  | ratio | non-atomic-twin-web | ps-2026-campaign | metrics/processed/scenario_outcome_history.csv |
| Reliability | flaky_scenario_count | 0 | count | non-atomic-twin-web | ps-2026-campaign | metrics/processed/scenario_outcome_history.csv |
| Reliability | infrastructure_failure_rate | NOT_AVAILABLE | ratio | non-atomic-twin-web | ps-2026-campaign | metrics/processed/failure_buckets.csv |
| Reliability | pass_rate | 1 | ratio | non-atomic-twin-web | ps-2026-campaign | metrics/processed/scenario_outcome_history.csv |
| Reliability | pass_to_fail_probability | 0 | ratio | non-atomic-twin-web | ps-2026-campaign | metrics/processed/scenario_outcome_history.csv |
| Reliability | retry_count | NOT_AVAILABLE | count | non-atomic-twin-web | ps-2026-campaign | not measured upstream |
| Reliability | tool_failure_rate | NOT_AVAILABLE | ratio | non-atomic-twin-web | ps-2026-campaign | metrics/processed/failure_buckets.csv |
| Reliability | fail_rate | 0 | ratio | playwright | ps-2026-campaign | metrics/processed/scenario_outcome_history.csv |
| Reliability | fail_to_pass_probability |  | ratio | playwright | ps-2026-campaign | metrics/processed/scenario_outcome_history.csv |
| Reliability | flaky_scenario_count | 0 | count | playwright | ps-2026-campaign | metrics/processed/scenario_outcome_history.csv |
| Reliability | infrastructure_failure_rate | NOT_AVAILABLE | ratio | playwright | ps-2026-campaign | metrics/processed/failure_buckets.csv |
| Reliability | pass_rate | 1 | ratio | playwright | ps-2026-campaign | metrics/processed/scenario_outcome_history.csv |
| Reliability | pass_to_fail_probability | 0 | ratio | playwright | ps-2026-campaign | metrics/processed/scenario_outcome_history.csv |
| Reliability | retry_count | NOT_AVAILABLE | count | playwright | ps-2026-campaign | not measured upstream |
| Reliability | tool_failure_rate | NOT_AVAILABLE | ratio | playwright | ps-2026-campaign | metrics/processed/failure_buckets.csv |

## Performance Efficiency

| Quality Attribute | Metric | Value | Unit | Tool | Batch | Source |
|---|---:|---:|---|---|---|---|
| Performance Efficiency | grpc_or_ipc_latency_ms | NOT_AVAILABLE | ms | ALL | ps-2026-campaign | TOM-only overhead |
| Performance Efficiency | job_duration_ms | 772584.62 | ms | ALL | ps-2026-campaign | metrics/raw/run-manifest/*.json (mean per-manifest endedAt - startedAt) |
| Performance Efficiency | p50_scenario_duration_ms | NOT_AVAILABLE | ms | ALL | ps-2026-campaign | metrics/processed/scenario_durations.csv (p50 of duration_ms) |
| Performance Efficiency | p95_scenario_duration_ms | NOT_AVAILABLE | ms | ALL | ps-2026-campaign | metrics/processed/scenario_durations.csv (p95 of duration_ms) |
| Performance Efficiency | p99_scenario_duration_ms | NOT_AVAILABLE | ms | ALL | ps-2026-campaign | metrics/processed/scenario_durations.csv (p99 of duration_ms) |
| Performance Efficiency | proxy_overhead_ms | NOT_AVAILABLE | ms | ALL | ps-2026-campaign | TOM-only overhead |
| Performance Efficiency | scenario_duration_ms | NOT_AVAILABLE | ms | ALL | ps-2026-campaign | metrics/processed/scenario_durations.csv (mean of duration_ms) |
| Performance Efficiency | telemetry_processing_duration_ms | NOT_AVAILABLE | ms | ALL | ps-2026-campaign | not measured upstream |
| Performance Efficiency | tool_startup_duration_ms | NOT_AVAILABLE | ms | ALL | ps-2026-campaign | not measured upstream |
| Performance Efficiency | workflow_duration_ms | 615780000 | ms | ALL | ps-2026-campaign | metrics/raw/run-manifest/*.json (max endedAt - min startedAt) |

## Observability

| Quality Attribute | Metric | Value | Unit | Tool | Batch | Source |
|---|---:|---:|---|---|---|---|
| Observability | artifacts_uploaded | 1 | boolean | ALL | ps-2026-campaign | metrics |
| Observability | classified_failure_percentage | 100 | percent | ALL | ps-2026-campaign | metrics/processed/failure_buckets.csv |
| Observability | logs_uploaded | 1 | boolean | ALL | ps-2026-campaign | logs |
| Observability | missing_failure_bucket_count | 0 | count | ALL | ps-2026-campaign | metrics/processed/failure_buckets.csv |
| Observability | missing_run_manifest_count | 3 | count | ALL | ps-2026-campaign | metrics/processed |
| Observability | missing_scenario_duration_count | 9605 | count | ALL | ps-2026-campaign | metrics/processed/scenario_outcome_history.csv |
| Observability | processed_metrics_uploaded | 1 | boolean | ALL | ps-2026-campaign | metrics/processed |
| Observability | raw_metrics_uploaded | 1 | boolean | ALL | ps-2026-campaign | metrics/raw |
| Observability | telemetry_completeness_percentage | NOT_AVAILABLE | percent | ALL | ps-2026-campaign | metrics/raw/tool-events (none) |
| Observability | telemetry_event_count | 0 | count | ALL | ps-2026-campaign | metrics/raw/tool-events (none) |
| Observability | unclassified_failure_percentage | 0 | percent | ALL | ps-2026-campaign | metrics/processed/failure_buckets.csv |

## Portability

| Quality Attribute | Metric | Value | Unit | Tool | Batch | Source |
|---|---:|---:|---|---|---|---|
| Portability | environment_specific_config_count | 13 | count | ALL | ps-2026-campaign | src/** (caps\|profile) + *.env profiles |
| Portability | failed_tool_count | 0 | count | ALL | ps-2026-campaign | metrics/processed/scenario_outcome_history.csv |
| Portability | platform_coverage_percentage | 14.29 | percent | ALL | ps-2026-campaign | metrics/processed/platform_coverage_matrix.csv; metrics/processed/scenario_outcome_history.csv |
| Portability | platform_specific_code_count | 43 | count | ALL | ps-2026-campaign | src/** (android\|ios\|mobile\|web in path) |
| Portability | platform_specific_locator_count | 15 | count | ALL | ps-2026-campaign | src/**/*.locators.json |
| Portability | successful_platform_matrix_percentage | 14.29 | percent | ALL | ps-2026-campaign | metrics/processed/platform_coverage_matrix.csv; metrics/processed/scenario_outcome_history.csv |
| Portability | successful_tool_count | 4 | count | ALL | ps-2026-campaign | metrics/processed/scenario_outcome_history.csv |
| Portability | supported_tool_count | 8 | count | ALL | ps-2026-campaign | scripts/metrics/measure-portability.ts (known TOM tool set) |

## Interoperability

| Quality Attribute | Metric | Value | Unit | Tool | Batch | Source |
|---|---:|---:|---|---|---|---|
| Interoperability | api_oracle_available | 0 | boolean | ALL | ps-2026-campaign | metrics/processed/api_isolated_results.csv |
| Interoperability | oracle_composition_count | 6 | count | ALL | ps-2026-campaign | src/core/tests (*.feature tags) |
| Interoperability | oracle_count | 2 | count | ALL | ps-2026-campaign | metrics/processed/{api_isolated_results,visual_comparison_results,performance_summary}.csv; tool-events |
| Interoperability | performance_oracle_available | 0 | boolean | ALL | ps-2026-campaign | metrics/processed/performance_summary.csv |
| Interoperability | successful_oracle_composition_count | 0 | count | ALL | ps-2026-campaign | src/core/tests + evidence CSVs |
| Interoperability | tool_count | 4 | count | ALL | ps-2026-campaign | metrics/processed/scenario_outcome_history.csv |
| Interoperability | ui_oracle_available | 1 | boolean | ALL | ps-2026-campaign | metrics/raw/tool-events; metrics/processed/scenario_outcome_history.csv |
| Interoperability | visual_oracle_available | 0 | boolean | ALL | ps-2026-campaign | metrics/processed/visual_comparison_results.csv |

