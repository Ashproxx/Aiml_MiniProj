"""Reproduce the two educational classifiers and export browser-readable weights."""
import csv
import hashlib
import io
import json
from pathlib import Path
import urllib.request

import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, confusion_matrix, f1_score, recall_score, roc_auc_score
from sklearn.model_selection import train_test_split

ROOT = Path(__file__).resolve().parents[1]
SCHEMA = json.loads((ROOT / "public/schema.json").read_text())
SPECS = [
    ("heart", "Heart disease", 45, ["age", "sex", "cp", "trestbps", "chol", "thalach", "exang"], "num"),
    ("kidney", "Chronic kidney disease", 336, ["age", "bgr", "bu", "sc", "hemo", "htn", "dm", "cad", "appet", "pe", "ane"], "class"),
]


def read_data(name, dataset_id, keys, target):
    path = ROOT / "ml/data" / f"{name}.csv"
    path.parent.mkdir(exist_ok=True)
    url = f"https://archive.ics.uci.edu/static/public/{dataset_id}/data.csv"
    if not path.exists():
        with urllib.request.urlopen(url, timeout=60) as response:
            path.write_bytes(response.read())
    raw = path.read_bytes()
    rows = list(csv.DictReader(io.StringIO(raw.decode("utf-8-sig"))))
    x, y = [], []
    aliases = {"yes": 1, "no": 0, "good": 0, "poor": 1}
    for row in rows:
        values = []
        for key in keys:
            value = row[key].strip().lower()
            values.append(float(aliases[value]) if value in aliases else (np.nan if value in ("nan", "?", "") else float(value)))
        # Exclude children and records with unknown age; UI is adult-only.
        if not np.isfinite(values[0]) or values[0] < 18:
            continue
        x.append(values)
        y.append(int(float(row[target]) > 0) if target == "num" else int(row[target].strip() == "ckd"))
    return np.array(x), np.array(y), len(rows), hashlib.sha256(raw).hexdigest(), url


def encode(x, features):
    columns = []
    for j, feature in enumerate(features):
        values = np.where(np.isnan(x[:, j]), feature["fill"], x[:, j])
        if feature["type"] == "number":
            columns.append((values - feature["mean"]) / feature["scale"])
        else:
            columns.extend((values == category).astype(float) for category in feature["categories"])
    return np.column_stack(columns)


def main():
    models, fixtures = [], []
    for name, title, dataset_id, keys, target in SPECS:
        x, y, total, digest, url = read_data(name, dataset_id, keys, target)
        train_x, test_x, train_y, test_y = train_test_split(x, y, test_size=0.2, stratify=y, random_state=42)
        features = []
        for j, key in enumerate(keys):
            field = next(field for field in SCHEMA if field["key"] == key)
            observed = train_x[:, j][np.isfinite(train_x[:, j])]
            if field["type"] == "number":
                fill = float(np.median(observed))
                filled = np.where(np.isnan(train_x[:, j]), fill, train_x[:, j])
                feature = {"key": key, "type": "number", "fill": fill, "mean": float(filled.mean()), "scale": float(filled.std()) or 1.0}
            else:
                categories = [int(option[0]) for option in field["options"]]
                assert set(observed).issubset(categories), (key, observed)
                values, counts = np.unique(observed, return_counts=True)
                feature = {"key": key, "type": "select", "fill": float(values[np.argmax(counts)]), "categories": categories}
            feature["observedRange"] = [float(observed.min()), float(observed.max())]
            features.append(feature)
        clf = LogisticRegression(C=1.0, max_iter=2000, random_state=42)
        clf.fit(encode(train_x, features), train_y)
        probability = clf.predict_proba(encode(test_x, features))[:, 1]
        predicted = probability >= 0.5
        offset = 0
        for feature in features:
            width = 1 if feature["type"] == "number" else len(feature["categories"])
            feature["weights"] = clf.coef_[0, offset:offset + width].tolist()
            offset += width
        metrics = {"accuracy": accuracy_score(test_y, predicted), "recall": recall_score(test_y, predicted), "f1": f1_score(test_y, predicted), "auc": roc_auc_score(test_y, probability), "confusion": confusion_matrix(test_y, predicted).tolist()}
        model = {"id": name, "title": title, "datasetId": dataset_id, "sourceUrl": f"https://archive.ics.uci.edu/dataset/{dataset_id}", "downloadUrl": url, "sha256": digest, "originalRows": total, "adultRows": len(x), "trainRows": len(train_x), "testRows": len(test_x), "positiveTrainRows": int(train_y.sum()), "features": features, "intercept": float(clf.intercept_[0]), "metrics": metrics}
        models.append(model)
        for row, expected in zip(test_x[:12], probability[:12]):
            inputs = {key: (None if np.isnan(value) else float(value)) for key, value in zip(keys, row)}
            fixtures.append({"model": name, "inputs": inputs, "expected": float(expected)})
        print(f"{title}: {len(train_x)} train / {len(test_x)} test | {json.dumps(metrics)}")
    artifact = {"version": "1.0.0", "algorithm": "Logistic regression", "seed": 42, "split": "80/20 stratified holdout", "models": models}
    (ROOT / "public/models.json").write_text(json.dumps(artifact, indent=2) + "\n")
    (ROOT / "tests/reference-predictions.json").write_text(json.dumps(fixtures, indent=2) + "\n")


if __name__ == "__main__":
    main()
