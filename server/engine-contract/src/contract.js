'use strict';
// PUBLIC CONTRACT — Extrusion Intelligence <-> private engine.
// The engine MUST speak this vocabulary. Anything outside it is dropped.
// Nothing in this file describes how the engine reaches a decision.

const DECISION_STATUSES = Object.freeze([
  'READY_FOR_OPERATOR_REVIEW',
  'SHADOW_TEST_ONLY',
  'TEST_REQUIRED',
  'CHANGE_FORMULATION',
  'CHANGE_CONFIGURATION',
  'DO_NOT_RUN',
  'NEEDS_DATA',
  'NOT_APPLICABLE',
]);

const APPROVABLE_STATUSES = Object.freeze([
  'READY_FOR_OPERATOR_REVIEW',
  'SHADOW_TEST_ONLY',
  'TEST_REQUIRED',
]);

const REASON_CATEGORIES = Object.freeze([
  'MACHINE_DATA_INCOMPLETE',
  'PROCESS_OUTSIDE_VALIDATED_RANGE',
  'RECIPE_TARGET_CONFLICT',
  'HARD_MACHINE_CONSTRAINT',
  'VALIDATION_REQUIRED',
  'PRODUCT_MEASUREMENT_REQUIRED',
  'SENSOR_DATA_INCOMPLETE',
  'CONFIGURATION_MISMATCH',
  'ENGINE_NOT_CONNECTED',
]);

const VERIFICATION_STATES = Object.freeze([
  'VERIFIED_PASS',
  'VERIFIED_FAIL',
  'INCONCLUSIVE',
  'INCOMPLETE',
]);

// Unit is owned by the application, never taken from the engine.
const METRICS = Object.freeze({
  pressure: 'bar',
  product_temperature: '°C',
  melt_temperature: '°C',
  motor_load: '%',
  torque: '%',
  moisture: '%',
  sme: 'Wh/kg',
});

const TEST_PARAMETERS = Object.freeze({
  feed_rate: 'kg/h',
  screw_speed: 'rpm',
  water_rate: 'kg/h',
  steam_rate: 'kg/h',
  zone_temperature: '°C',
  cutter_speed: 'rpm',
});

const CONFIDENCE_LABELS = Object.freeze(['HIGH', 'MEDIUM', 'LOW', 'NOT_AVAILABLE']);

module.exports = {
  DECISION_STATUSES,
  APPROVABLE_STATUSES,
  REASON_CATEGORIES,
  VERIFICATION_STATES,
  METRICS,
  TEST_PARAMETERS,
  CONFIDENCE_LABELS,
};
