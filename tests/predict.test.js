import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { predict, validate, assess } from '../public/predict.js';

const read = path => JSON.parse(readFileSync(new URL(path, import.meta.url)));
const { models } = read('../public/models.json');
const schema = read('../public/schema.json');
const fixtures = read('./reference-predictions.json');
const sample = { age: 52, sex: 1, htn: 1, dm: 0, cad: 0, ane: 0, cp: 3, exang: 0, appet: 0, pe: 0, trestbps: 138, thalach: 156, chol: 245, bgr: 128, bu: 32, sc: 1.1, hemo: 14.2 };

test('browser inference matches held-out scikit-learn predictions to 1e-12', () => {
  for (const fixture of fixtures) {
    const result = predict(models.find(model => model.id === fixture.model), fixture.inputs);
    assert.ok(Math.abs(result.probability - fixture.expected) < 1e-12);
  }
});

test('invalid ranges, categories, types and fractional integers are rejected', () => {
  assert.deepEqual(validate(sample, schema), {});
  for (const [key, value] of [['age', 17], ['age', 101], ['age', 52.5], ['sex', 9], ['sc', -1], ['hemo', Infinity], ['chol', 'bad'], ['age', true], ['cp', []], ['age', ' ']]) {
    assert.ok(validate({ ...sample, [key]: value }, schema)[key], `${key}: ${value}`);
  }
  assert.equal(assess(models, { ...sample, age: -1 }, schema).results.length, 0);
});

test('incomplete inputs never generate a displayed score and models remain independent', () => {
  const missing = assess(models, {}, schema).results;
  assert.ok(missing.every(result => result.probability === null));
  const output = assess(models, { ...sample, chol: '' }, schema).results;
  assert.equal(output[0].probability, null);
  assert.deepEqual(output[0].missing, ['chol']);
  assert.equal(typeof output[1].probability, 'number');
  assert.ok(assess(models, sample, schema).results.every(result => Number.isFinite(result.probability)));
});

test('contributions reconstruct prediction and extrapolation is reported', () => {
  const result = predict(models[0], { ...sample, age: 99 });
  assert.ok(result.outsideRange.includes('age'));
  const logit = models[0].intercept + result.contributions.reduce((sum, entry) => sum + entry.contribution, 0);
  assert.ok(Math.abs(1 / (1 + Math.exp(-logit)) - result.probability) < 1e-12);
  assert.throws(() => predict(models[0], { ...sample, cp: 99 }), /Invalid cp/);
});

test('evaluation metadata is internally consistent', () => {
  for (const model of models) {
    assert.equal(model.metrics.confusion.flat().reduce((a, b) => a + b), model.testRows);
    assert.equal(model.trainRows + model.testRows, model.adultRows);
    assert.ok(model.originalRows >= model.adultRows);
    assert.equal(model.sha256.length, 64);
    assert.equal(model.metrics.accuracy, (model.metrics.confusion[0][0] + model.metrics.confusion[1][1]) / model.testRows);
  }
});
