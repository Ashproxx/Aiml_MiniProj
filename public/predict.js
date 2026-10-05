/** Pure browser/Node inference. No network calls and no patient storage. */
export function validate(inputs, schema) {
  const errors = {};
  for (const field of schema) {
    const raw = inputs[field.key];
    if (raw === '' || raw === null || raw === undefined) continue;
    const value = Number(raw);
    if ((typeof raw !== 'number' && typeof raw !== 'string') || (typeof raw === 'string' && !raw.trim()) || !Number.isFinite(value)) {
      errors[field.key] = 'Enter a valid number.';
    } else if (field.type === 'select' && !field.options.some(([option]) => Number(option) === value)) {
      errors[field.key] = 'Choose one of the listed options.';
    } else if (field.type === 'number' && (value < field.min || value > field.max || Math.abs(value / field.step - Math.round(value / field.step)) > 1e-7)) {
      errors[field.key] = `Use ${field.min}–${field.max} ${field.unit}, in steps of ${field.step}.`;
    }
  }
  return errors;
}

export function predict(model, inputs) {
  let logit = model.intercept;
  const contributions = [], missing = [], outsideRange = [];
  for (const feature of model.features) {
    const raw = inputs[feature.key];
    const absent = raw === '' || raw === null || raw === undefined;
    const value = absent ? feature.fill : Number(raw);
    if (!Number.isFinite(value) || (!absent && typeof raw !== 'number' && typeof raw !== 'string') || (!absent && typeof raw === 'string' && !raw.trim())) throw new Error(`Invalid ${feature.key}`);
    if (absent) missing.push(feature.key);
    if (!absent && (value < feature.observedRange[0] || value > feature.observedRange[1])) outsideRange.push(feature.key);
    let contribution;
    if (feature.type === 'number') contribution = feature.weights[0] * (value - feature.mean) / feature.scale;
    else {
      const index = feature.categories.indexOf(value);
      if (index === -1) throw new Error(`Invalid ${feature.key}`);
      contribution = feature.weights[index];
    }
    logit += contribution;
    contributions.push({ key: feature.key, value, contribution, imputed: absent });
  }
  return { probability: 1 / (1 + Math.exp(-logit)), missing, outsideRange, contributions: contributions.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution)) };
}

export function assess(models, inputs, schema) {
  const errors = validate(inputs, schema);
  if (Object.keys(errors).length) return { errors, results: [] };
  const results = models.map(model => {
    const prediction = predict(model, inputs);
    // ponytail: require complete inputs at inference; validate a missing-data policy before allowing partial predictions.
    return { id: model.id, title: model.title, ...prediction, probability: prediction.missing.length ? null : prediction.probability };
  });
  return { errors, results };
}
