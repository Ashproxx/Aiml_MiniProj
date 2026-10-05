import { assess, validate } from './predict.js';

const icons = {
  assessment: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 3v3h6V3M8 12h8M8 16h5"/>',
  results: '<path d="M4 20h16M7 16v-5M12 16V5M17 16V8"/>',
  models: '<path d="m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5"/>',
  project: '<path d="M4 4h6l2 2 2-2h6v16h-6l-2 1-2-1H4V4ZM12 6v15"/>',
  shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z"/><path d="m8 12 3 3 5-6"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/>',
  pulse: '<path d="M2 12h5l3-8 4 16 3-8h5"/>',
  flask: '<path d="M9 3h6M10 3v7L4 19a1 1 0 0 0 1 2h14a1 1 0 0 0 1-2l-6-9V3M7 15h10"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
  database: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v7c0 4 16 4 16 0V5M4 12v7c0 4 16 4 16 0v-7"/>',
  heart: '<path d="M20.5 5.5c-2-2-5-2-8.5 1-3.5-3-6.5-3-8.5-1-3 3-.5 8 8.5 15 9-7 11.5-12 8.5-15Z"/>',
  kidney: '<path d="M8 3C3 3 2 9 3 14s6 8 9 5c2-3-3-5-3-8s3-8-1-8ZM16 3c5 0 6 6 5 11-.3 1.4-.8 2.7-1.5 3.6M14 11c2 0 4 2 4 5v5"/>',
  download: '<path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5"/>',
};
const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name] || icons.info}</svg>`;
document.querySelectorAll('[data-icon]').forEach(el => { el.innerHTML = icon(el.dataset.icon); });
const $ = selector => document.querySelector(selector);
const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const percent = value => `${(value * 100).toFixed(1)}%`;
const steps = [
  { name: 'Patient', title: 'Patient details & medical history', description: 'Use an adult profile and known diagnoses. No name or personal identifier is needed.' },
  { name: 'Symptoms', title: 'What does the health profile tell us?', description: 'Record known symptoms and clinical observations. Leave anything uncertain as unknown.' },
  { name: 'Vitals', title: 'Add the recorded vital signs', description: 'Use measurements from existing records. Check the units before continuing.' },
  { name: 'Lab results', title: 'Complete the clinical picture', description: 'Enter laboratory values from a report. Each field shows the required unit.' },
];
let schema, artifact, inputs = {}, step = 0, report = null, isSample = false, toastTimer;
const label = key => schema.find(field => field.key === key)?.label || key;
const hasValue = value => value !== '' && value !== null && value !== undefined;

function toast(message) {
  clearTimeout(toastTimer);
  $('#toast').textContent = message;
  $('#toast').hidden = false;
  toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 4500);
}

function fieldMarkup(field) {
  const attributes = `id="${field.key}" name="${field.key}" aria-describedby="${field.key}-hint ${field.key}-error"`;
  const control = field.type === 'select'
    ? `<select ${attributes}><option value="">Unknown / not provided</option>${field.options.map(([value, text]) => `<option value="${value}" ${String(inputs[field.key]) === value ? 'selected' : ''}>${escape(text)}</option>`).join('')}</select>`
    : `<input ${attributes} type="number" inputmode="decimal" min="${field.min}" max="${field.max}" step="${field.step}" placeholder="Enter value" value="${escape(inputs[field.key] ?? '')}"><span class="unit">${field.unit}</span>`;
  return `<div class="field"><label for="${field.key}">${field.label}</label><div class="input-wrap">${control}</div><p class="field-hint" id="${field.key}-hint">${field.hint || ''}</p><p class="field-error" id="${field.key}-error"></p></div>`;
}

function renderStep(focus = false) {
  $('#stepper').innerHTML = steps.map((item, index) => `<button type="button" class="step-button ${index === step ? 'active' : ''} ${index < step ? 'done' : ''}" data-step="${index}" ${index === step ? 'aria-current="step"' : ''}><span class="step-number">${index < step ? '✓' : index + 1}</span>${item.name}</button>`).join('');
  $('#step-count').textContent = `Step ${step + 1} of 4`;
  $('#step-title').textContent = steps[step].title;
  $('#step-description').textContent = steps[step].description;
  $('#fields').innerHTML = schema.filter(field => field.group === step).map(fieldMarkup).join('');
  $('#previous').hidden = step === 0;
  $('#next').innerHTML = step === 3 ? `Generate insights ${icon('pulse')}` : 'Continue <span>→</span>';
  $('#sample-notice').hidden = !isSample;
  $('#form-error').hidden = true;
  updateProgress();
  if (focus) $('#fields input, #fields select')?.focus();
}

function updateProgress() {
  const errors = validate(inputs, schema);
  const valid = field => hasValue(inputs[field.key]) && !errors[field.key];
  const filled = schema.filter(valid).length;
  const completion = Math.round(filled / schema.length * 100);
  $('#filled-count').textContent = `${filled} of ${schema.length} inputs`;
  $('#completion').innerHTML = `${completion}<small>%</small>`;
  $('#progress-ring').style.setProperty('--progress', `${completion}%`);
  $('#assessment-state').textContent = filled === 0 ? 'Not started' : filled === schema.length ? 'Complete' : 'In progress';
  $('#checklist').innerHTML = steps.map((item, index) => {
    const fields = schema.filter(field => field.group === index), count = fields.filter(valid).length;
    return `<div class="check-row"><span class="check-name"><span class="check-dot ${count === fields.length ? 'complete' : ''}">${count === fields.length ? '✓' : ''}</span>${item.name === 'Patient' ? 'Patient & history' : item.name}</span><span class="check-amount">${count} / ${fields.length}</span></div>`;
  }).join('');
}

function checkStep() {
  const errors = validate(inputs, schema.filter(field => field.group === step));
  for (const field of schema.filter(field => field.group === step)) {
    $(`#${field.key}`).setAttribute('aria-invalid', String(Boolean(errors[field.key])));
    $(`#${field.key}-error`).textContent = errors[field.key] || '';
  }
  if (Object.keys(errors).length) {
    $('#form-error').textContent = 'Please correct the highlighted values before continuing.';
    $('#form-error').hidden = false;
    $(`#${Object.keys(errors)[0]}`).focus();
    return false;
  }
  $('#form-error').hidden = true;
  return true;
}

function formatValue(field, raw) {
  if (!hasValue(raw)) return 'Not provided';
  if (field.type === 'select') return field.options.find(([value]) => Number(value) === Number(raw))?.[1] || 'Unknown';
  return `${raw} ${field.unit}`;
}

function resultCard(result) {
  const available = result.probability !== null;
  const model = artifact.models.find(model => model.id === result.id);
  return `<article class="white-card"><div class="result-top">${icon(result.id)}<span class="result-badge">${available ? 'Research model output' : 'More information needed'}</span></div><h2 class="result-title">${result.title}</h2>
    ${available ? `<div class="score">${(result.probability * 100).toFixed(1)}<small>%</small></div><div class="score-caption">Model score for the disease-present class</div><div class="score-bar"><span style="width:${result.probability * 100}%"></span></div><p class="result-explanation">An uncalibrated model score, not your clinical probability of disease. A lower score does not rule out a condition.</p><h3>What influenced this score?</h3><ul class="factors">${result.contributions.slice(0, 4).map(item => `<li><span>${label(item.key)}</span><span class="factor-label ${item.contribution > 0 ? 'up' : ''}">${item.contribution > 0 ? '↗ Raises' : '↘ Lowers'} model score</span></li>`).join('')}</ul><p style="font-size:10px">Largest absolute contributions to model log-odds. These are associations, not causes.</p>` : `<p>No score was generated. Provide all ${model.features.length} required inputs for this classifier.</p><div class="feature-chips">${result.missing.map(key => `<span>${label(key)}</span>`).join('')}</div><a class="small-link" href="#assessment" data-missing="${result.missing[0]}">Complete missing inputs →</a>`}
    ${result.outsideRange.length ? `<div class="warning-box">Outside the training data’s observed range: ${result.outsideRange.map(label).join(', ')}. The model may extrapolate unreliably.</div>` : ''}
  </article>`;
}

function renderResults() {
  const view = $('#view-results');
  if (!report) {
    view.innerHTML = `<div class="page-heading"><div><div class="eyebrow">YOUR HEALTH, EXPLAINED</div><h1>Prediction results<span>.</span></h1><p>Your latest assessment will appear here during this session.</p></div></div><div class="empty-state">${icon('results')}<h2>Every insight starts with a little information.</h2><p>Complete an assessment or try the fictional sample patient to explore both models.</p><a href="#assessment" class="button primary">Start an assessment →</a></div>`;
    return;
  }
  view.innerHTML = `<div class="page-heading"><div><div class="eyebrow">${report.isSample ? 'FICTIONAL SAMPLE · ' : ''}ASSESSMENT SUMMARY</div><h1>Your data. A little more clarity<span>.</span></h1><p>${escape(new Date(report.createdAt).toLocaleString())} · Models v${artifact.version}</p></div><div class="report-actions"><button id="download" class="button secondary">${icon('download')}Export JSON</button><button id="print" class="button secondary">Print / PDF</button><a href="#assessment" class="button primary">Edit inputs</a></div></div>
    <div class="medical-note"><strong>Educational analysis only.</strong> These classifiers identify dataset patterns; they cannot establish an early diagnosis, predict future onset, or replace clinical evaluation. Both conditions are evaluated independently. If you have severe chest pain or difficulty breathing, seek emergency care regardless of these scores.</div>
    <div class="results-grid">${report.results.map(resultCard).join('')}</div>
    <div class="white-card input-summary"><h2>Assessment inputs</h2><p>${report.isSample ? 'Fictional demonstration data. ' : ''}This report exists only in this tab unless you export or print it. Exported files contain health information; handle them privately.</p><table class="input-table"><caption class="field-hint">Values used for this assessment</caption><tbody>${schema.map(field => `<tr><td>${field.label}</td><td>${escape(formatValue(field, report.inputs[field.key]))}</td></tr>`).join('')}</tbody></table></div>`;
  $('#download').onclick = () => {
    const payload = { project: 'Vitalis', purpose: 'Educational prototype, not a diagnosis or calibrated clinical risk estimate.', algorithm: artifact.algorithm, modelVersion: artifact.version, ...report };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = `vitalis-assessment-${report.createdAt.slice(0, 10)}.json`; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  $('#print').onclick = () => window.print();
  view.querySelectorAll('[data-missing]').forEach(link => { link.onclick = () => { step = schema.find(field => field.key === link.dataset.missing).group; renderStep(); }; });
}

function renderModels() {
  $('#view-models').innerHTML = `<div class="page-heading"><div><div class="eyebrow">TRANSPARENT BY DESIGN</div><h1>Understand the intelligence<span>.</span></h1><p>Real training data. Reproducible evaluation. Visible limitations.</p></div><span class="demo-pill">Logistic regression · v${artifact.version}</span></div>
    <div class="medical-note">Metrics below describe one held-out split of small historical datasets. They are not clinical validation and do not measure performance in your population. Scores have not been externally calibrated.</div>
    <div class="model-grid">${artifact.models.map(model => {
      const m = model.metrics;
      return `<article class="white-card"><div class="result-top">${icon(model.id)}<span class="result-badge">UCI dataset #${model.datasetId}</span></div><h2 class="result-title">${model.title}</h2><p>${model.features.length} selected features · ${model.adultRows} eligible adult records</p><div class="metric-row"><div><strong>${percent(m.accuracy)}</strong><small>Holdout accuracy</small></div><div><strong>${percent(m.recall)}</strong><small>Disease-class recall</small></div><div><strong>${m.auc.toFixed(3)}</strong><small>ROC AUC</small></div></div><div class="model-meta">${model.trainRows} training / ${model.testRows} test records · F1 ${m.f1.toFixed(3)}<br>Seed 42 · Stratified 80/20 split · Decision threshold 0.5</div><table class="confusion"><caption class="field-hint">Confusion matrix on held-out records</caption><thead><tr><th scope="col">Actual / Predicted</th><th scope="col">Absent</th><th scope="col">Present</th></tr></thead><tbody><tr><th scope="row">Absent</th><td>${m.confusion[0][0]}</td><td>${m.confusion[0][1]}</td></tr><tr><th scope="row">Present</th><td>${m.confusion[1][0]}</td><td>${m.confusion[1][1]}</td></tr></tbody></table><details class="model-details"><summary>View model inputs & preprocessing</summary><ul>${model.features.map(feature => `<li>${label(feature.key)} — ${feature.type === 'number' ? 'median imputation, standardization' : 'mode imputation, one-hot encoding'}</li>`).join('')}</ul><p>Imputation is used for missing training values. The interface requires every selected feature before displaying a score. Statistics are fitted on training rows only.</p></details><a class="small-link" href="${model.sourceUrl}" target="_blank" rel="noreferrer">View original UCI dataset ↗</a></article>`;
    }).join('')}</div>
    <div class="white-card project-section"><h2>What the numbers cannot tell you</h2><div class="project-columns"><div><h3>Limitations</h3><ul><li>Small, historical cohorts are not representative of all populations.</li><li>Heart data records only binary sex categories.</li><li>No prospective, external, or subgroup validation has been performed.</li><li>Kidney-related labs can reflect an already established condition; this is not evidence of early detection.</li><li>Independent model scores must not be added or compared as a diagnosis ranking.</li></ul></div><div><h3>Reproducible engineering</h3><ul><li>Frozen random seed and stratified train/test partition.</li><li>Training-only imputation, scaling, and one-hot encoding.</li><li>L2-regularized logistic regression, C = 1.</li><li>Browser weights match scikit-learn reference predictions.</li><li>Dataset checksums and metrics are saved with each model.</li></ul><a href="https://github.com/Ashproxx/Aiml_MiniProj" target="_blank" rel="noreferrer" class="small-link">Explore the project source ↗</a></div></div></div>`;
}

function renderProject() {
  $('#view-project').innerHTML = `<div class="page-heading"><div><div class="eyebrow">ENGINEERING WITH PURPOSE</div><h1>Small project. Meaningful questions<span>.</span></h1><p>AI-Based Early Disease Prediction System Using Patient Health Data</p></div></div>
    <div class="white-card"><div class="eyebrow muted">PROJECT ABSTRACT</div><h2>Making health data easier to understand.</h2><p>Vitalis is a web-based AI mini project that combines symptoms, medical history, vital signs, and laboratory measurements to explore patterns associated with heart disease and chronic kidney disease. It demonstrates the complete machine-learning lifecycle: data preparation, training, evaluation, deployment, and interpretable predictions.</p><p>The title describes the research motivation. The implemented models classify existing disease labels in historical datasets; early detection and future disease onset have not been validated.</p><div class="feature-chips"><span>AI / ML</span><span>Healthcare</span><span>Explainable classification</span><span>Responsive web application</span><span>On-device inference</span></div></div>
    <div class="project-section"><div class="eyebrow muted">SYSTEM ARCHITECTURE</div><h2>One clear path from inputs to insights.</h2><div class="architecture"><div><strong>01 · Patient inputs</strong><small>17 supported fields<br>Symptoms, history, vitals, labs</small></div><div><strong>02 · Validation</strong><small>Units, ranges, categories<br>Model-specific completeness</small></div><div><strong>03 · ML inference</strong><small>Two logistic classifiers<br>Exported Python model weights</small></div><div><strong>04 · Explanation</strong><small>Scores and contributing factors<br>Printable and JSON reports</small></div></div></div>
    <div class="project-columns"><div class="white-card"><h2>Built for a project demonstration</h2><ul><li>Four-step assessment with input validation.</li><li>Fictional sample patient for a quick walkthrough.</li><li>Independent heart and kidney predictions.</li><li>Per-input explanations and out-of-range warnings.</li><li>Measured holdout metrics and confusion matrices.</li><li>Responsive layout with keyboard navigation.</li></ul></div><div class="white-card"><h2>Privacy & responsible use</h2><p>Inputs stay in memory in this browser tab. The app does not upload, persist, or log patient values. Reloading clears the assessment. Hosting providers may receive standard page request metadata; Google Fonts serves typography. No identity or account is required.</p><p>Use fictional examples for classroom demonstrations. Medical decisions require qualified professionals and clinically validated tools.</p><a class="small-link" href="#assessment">Try the assessment →</a></div></div>
    <div class="white-card project-section"><h2>Data credits & further work</h2><p>Heart Disease: Janosi, Steinbrunn, Pfisterer & Detrano (1989), UCI, <a href="https://doi.org/10.24432/C52P4X" target="_blank" rel="noreferrer">doi:10.24432/C52P4X</a>. Chronic Kidney Disease: Rubini, Soundarapandian & Eswaran (2015), UCI, <a href="https://doi.org/10.24432/C5G020" target="_blank" rel="noreferrer">doi:10.24432/C5G020</a>. Both datasets are provided under CC BY 4.0.</p><p>Future research should include external validation, calibration, subgroup performance analysis, clinician review, and prospective evaluation before any healthcare deployment.</p><a class="small-link" href="https://github.com/Ashproxx/Aiml_MiniProj" target="_blank" rel="noreferrer">Source code, setup guide & project documentation ↗</a></div>`;
}

function navigate() {
  const requested = location.hash.slice(1) || 'assessment';
  const route = ['assessment', 'results', 'models', 'project'].includes(requested) ? requested : 'assessment';
  if (route === 'results') renderResults();
  document.querySelectorAll('.view').forEach(view => { view.hidden = view.id !== `view-${route}`; });
  document.querySelectorAll('.nav-link').forEach(link => {
    const active = link.hash === `#${route}`;
    link.classList.toggle('active', active);
    if (active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
  });
  $('#breadcrumb').textContent = { assessment: 'Health assessment', results: 'Prediction results', models: 'Model insights', project: 'About the project' }[route];
  document.title = `Vitalis — ${$('#breadcrumb').textContent}`;
  window.scrollTo(0, 0);
  $('#main').focus({ preventScroll: true });
}

async function initialize() {
  try {
    [schema, artifact] = await Promise.all(['schema.json', 'models.json'].map(async path => {
      const response = await fetch(path, { signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error(`Could not load ${path}`);
      return response.json();
    }));
    renderStep(); renderModels(); renderProject();
    $('#boot-status').hidden = true;
    $('#fields').addEventListener('input', event => {
      if (!event.target.name) return;
      inputs[event.target.name] = event.target.value;
      if (report) { report = null; toast('Inputs changed. Generate a fresh assessment to update the results.'); }
      const error = validate(inputs, schema)[event.target.name];
      event.target.setAttribute('aria-invalid', String(Boolean(error)));
      $(`#${event.target.name}-error`).textContent = error || '';
      updateProgress();
    });
    $('#stepper').onclick = event => {
      const button = event.target.closest('[data-step]');
      if (button && checkStep()) { step = Number(button.dataset.step); renderStep(true); }
    };
    $('#previous').onclick = () => { if (step > 0 && checkStep()) { step--; renderStep(true); } };
    $('#assessment-form').onsubmit = event => {
      event.preventDefault();
      if (!checkStep()) return;
      if (step < 3) { step++; renderStep(true); return; }
      const output = assess(artifact.models, inputs, schema);
      if (Object.keys(output.errors).length) {
        step = schema.find(field => field.key === Object.keys(output.errors)[0]).group; renderStep(); checkStep(); return;
      }
      report = { createdAt: new Date().toISOString(), isSample, inputs: { ...inputs }, results: output.results };
      location.hash = 'results';
    };
    $('#load-sample').onclick = () => {
      inputs = { age: '52', sex: '1', htn: '1', dm: '0', cad: '0', ane: '0', cp: '3', exang: '0', appet: '0', pe: '0', trestbps: '138', thalach: '156', chol: '245', bgr: '128', bu: '32', sc: '1.1', hemo: '14.2' };
      report = null; isSample = true; step = 0; renderStep(); toast('Fictional sample loaded. Review the four steps to generate insights.');
    };
    const reset = () => { inputs = {}; report = null; isSample = false; step = 0; renderStep(true); toast('Assessment cleared.'); };
    $('#clear-sample').onclick = reset;
    $('#reset').onclick = reset;
    $('.skip-link').onclick = event => { event.preventDefault(); $('#main').focus(); };
    window.addEventListener('hashchange', navigate);
    navigate();
  } catch (error) {
    $('#boot-status').innerHTML = '<div class="empty-state"><h2>The models could not be loaded.</h2><p>Check your connection and reload. If running locally, start the web server with <code>npm start</code>; opening the HTML file directly is not supported.</p><button class="button primary" id="retry">Try again</button></div>';
    $('#retry').onclick = () => location.reload();
    console.error(error);
  }
}
initialize();
