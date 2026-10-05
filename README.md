# Vitalis — Health Intelligence

**AI-Based Early Disease Prediction System Using Patient Health Data**
A responsive engineering mini project with two reproducible machine-learning classifiers.

Vitalis accepts **symptoms, medical history, vital signs, and laboratory values** and generates independent model scores for **heart disease** and **chronic kidney disease**. It includes explanations, reports, measured evaluation, and project documentation.

> Educational research prototype. These models classify existing disease labels in historical data. They are not clinically validated, do not establish a diagnosis, and have not demonstrated early detection or future-onset prediction. Scores are uncalibrated model outputs, not an individual's medical risk.

## Run the website

Python 3.10+ is enough to serve the checked-in website. No packages, API key, database, or model download is required.

```bash
python -m http.server 8000 --bind 127.0.0.1 --directory public
```

Open **http://127.0.0.1:8000**. With Node.js installed, `npm start` runs the same command. Use a web server; opening `index.html` directly may block model loading.

**Demo:** click **Try sample patient**, review the four steps, and select **Generate insights**. The sample is fictional. Open **Model insights** for measured performance and **About the project** for the architecture.

## Features

- Responsive desktop/mobile interface with four assessment steps.
- Seventeen supported fields with units, ranges, category validation, and unknown values.
- Two logistic-regression models trained on public UCI healthcare datasets.
- No displayed score when a model's required inputs are incomplete.
- Explanations using feature contributions to model log-odds.
- Warnings for inputs beyond the training population's observed range.
- Print / save-as-PDF and JSON report export.
- Evaluation metrics, confusion matrices, sources, and limitations in the website.
- Patient inputs stay in browser memory; no assessment upload or storage.
- Automated correctness checks and GitHub Pages deployment workflow.

## Technology

| Component | Technology |
| --- | --- |
| Website | Semantic HTML, CSS, vanilla JavaScript modules |
| Training | Python, NumPy, scikit-learn |
| Algorithm | L2 logistic regression, C=1 |
| Inference | Exported coefficients and preprocessing statistics in JSON |
| Testing | Node's built-in test runner and Python reference predictions |
| Hosting | Static website / GitHub Pages |

No application backend is needed: small trained models execute directly in the browser. Python's local HTTP server serves files; it does not process patient inputs.

## Evaluation

**80/20 stratified split, seed 42.** Records with missing age or age under 18 are excluded. Other training missingness is imputed with training-only statistics. No test rows are used for preprocessing, tuning, or fitting. Exported weights come from the evaluated training partition, without refitting on test data.

| Model | Original records | Eligible adults | Train / test | Accuracy | Recall | F1 | ROC AUC |
| --- | ---: | ---: | --- | ---: | ---: | ---: | ---: |
| Heart disease | 303 | 303 | 242 / 61 | 85.25% | 82.14% | 0.8364 | 0.9177 |
| Chronic kidney disease | 400 | 372 | 297 / 75 | 94.67% | 91.30% | 0.9545 | 0.9760 |

The website reads metrics from the model artifact. These are small-cohort, single-split results, **not clinical performance claims**. Classification metrics use threshold 0.5. The interface displays model scores rather than making a diagnosis.

## Reproduce training

Python 3.12 was used for the committed artifacts. From the repository root:

```bash
python -m venv .venv
# Windows PowerShell:
.venv/Scripts/python -m pip install -r ml/requirements.txt
.venv/Scripts/python ml/train.py

# macOS / Linux:
# .venv/bin/python -m pip install -r ml/requirements.txt
# .venv/bin/python ml/train.py
```

The script downloads CSVs directly from UCI on first use, caches them under ignored `ml/data/`, and regenerates `public/models.json` (weights, preprocessing, dataset checksums, metrics) and `tests/reference-predictions.json` (24 held-out reference predictions from public research data).

Numeric features use median imputation and standardization. Categories use mode imputation and one-hot encoding. Preprocessing is fitted on training records only. Although reference inference supports imputation, the product requires complete model-specific inputs for a displayed score.

## Verification

Node.js 18+; no npm installation is needed:

```bash
npm test
node --check public/app.js
```

Checks cover browser/Python numerical agreement to 1e-12, validation, incomplete-input gating, independent predictions, contribution reconstruction, range warnings, and metric consistency.

## GitHub Pages

The workflow publishes only `public/` after checks pass. Select **Settings → Pages → Source → GitHub Actions**, then run **Actions → Test and publish Vitalis → Run workflow**, or push to `main`.

Expected URL after a successful deployment: **https://ashproxx.github.io/Aiml_MiniProj/**. Relative assets also support other static hosts.

## Structure

```text
public/                         Website, shared field schema, inference, model artifacts
ml/train.py                     Download, preprocess, train, evaluate, export
ml/requirements.txt             Pinned training dependencies
tests/predict.test.js           Runnable correctness checks
tests/reference-predictions.json  scikit-learn reference outputs
docs/PROJECT_REPORT.md          Engineering report and viva notes
.github/workflows/pages.yml     Test and deployment automation
```

## Privacy and limitations

Reset/reload clears inputs. There is no analytics, local storage, account, or patient database. Exported reports contain health data and should be handled privately. Hosting receives normal page-request metadata and Google Fonts receives font requests; neither receives assessment values from this app.

Historical cohorts have selection bias, missingness, and limited demographic coverage. Heart data records only binary sex categories. No external, prospective, subgroup, or calibration study has been performed. Kidney labs may already reflect established disease. Independent scores must not be summed or treated as a disease ranking. Severe symptoms require appropriate medical care regardless of scores.

## Data attribution

- Janosi, A., Steinbrunn, W., Pfisterer, M., & Detrano, R. (1989). **Heart Disease**. UCI. [Dataset](https://archive.ics.uci.edu/dataset/45/heart+disease), [DOI:10.24432/C52P4X](https://doi.org/10.24432/C52P4X).
- Rubini, L., Soundarapandian, P., & Eswaran, P. (2015). **Chronic Kidney Disease**. UCI. [Dataset](https://archive.ics.uci.edu/dataset/336/chronic+kidney+disease), [DOI:10.24432/C5G020](https://doi.org/10.24432/C5G020).

Both datasets use [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). This project selects features, filters unsupported records, preprocesses values, and derives model coefficients. See [the project report](docs/PROJECT_REPORT.md).
