/**
 * Client-side Isolation Forest for payroll timecard anomaly detection.
 *
 * Builds an ensemble of isolation trees. Each tree recursively partitions data
 * by choosing a random feature and a random split value. Anomalies are points
 * that require fewer splits (shorter path lengths) to isolate.
 *
 * Features (9-dimensional):
 *   clockInHour · clockOutHour · durationHours · daysSincePayDay ·
 *   daysUntilPayDay · occupationType · rateCents · dayOfWeek · scheduleDeviation
 */

import type { AnomalyFeatures } from "./api";

// ── Hyper-parameters ──────────────────────────────────────────────────────────

const NUM_TREES = 100;
const SUBSAMPLE_SIZE = 256;
const MAX_DEPTH = Math.ceil(Math.log2(SUBSAMPLE_SIZE));

// ── Harmonic-number approximation ────────────────────────────────────────────

function harmonicNumber(n: number): number {
  return Math.log(n) + 0.5772156649;
}

function averagePathLength(n: number): number {
  if (n <= 1) return 0;
  if (n === 2) return 1;
  return 2 * harmonicNumber(n - 1) - (2 * (n - 1)) / n;
}

// ── Feature vector ───────────────────────────────────────────────────────────

type FeatureVector = number[];

const FEATURE_KEYS: (keyof AnomalyFeatures)[] = [
  "clockInHour",
  "clockOutHour",
  "durationHours",
  "daysSincePayDay",
  "daysUntilPayDay",
  "occupationType",
  "rateCents",
  "dayOfWeek",
  "scheduleDeviation",
];

export function featuresToVector(features: AnomalyFeatures): FeatureVector {
  return FEATURE_KEYS.map((key) => {
    const value = features[key];
    return typeof value === "boolean" ? (value ? 1 : 0) : (value as number);
  });
}

// ── Tree types ───────────────────────────────────────────────────────────────

interface ExternalNode {
  type: "external";
  size: number;
}

interface InternalNode {
  type: "internal";
  featureIndex: number;
  splitValue: number;
  left: TreeNode;
  right: TreeNode;
}

type TreeNode = ExternalNode | InternalNode;

// ── Random helpers ───────────────────────────────────────────────────────────

function randInt(max: number): number {
  return Math.floor(Math.random() * max);
}

function randRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function sample<T>(array: T[], size: number): T[] {
  const copy = [...array];
  const n = Math.min(size, copy.length);
  for (let i = 0; i < n; i++) {
    const j = i + randInt(copy.length - i);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}

// ── Tree construction ────────────────────────────────────────────────────────

function buildTree(data: FeatureVector[], depth: number, maxDepth: number): TreeNode {
  if (depth >= maxDepth || data.length <= 1) {
    return { type: "external", size: data.length };
  }

  const numFeatures = data[0].length;
  const featureIndex = randInt(numFeatures);

  let min = Infinity;
  let max = -Infinity;
  for (const row of data) {
    if (row[featureIndex] < min) min = row[featureIndex];
    if (row[featureIndex] > max) max = row[featureIndex];
  }

  if (min === max) {
    return { type: "external", size: data.length };
  }

  const splitValue = randRange(min, max);
  const left: FeatureVector[] = [];
  const right: FeatureVector[] = [];

  for (const row of data) {
    if (row[featureIndex] < splitValue) {
      left.push(row);
    } else {
      right.push(row);
    }
  }

  return {
    type: "internal",
    featureIndex,
    splitValue,
    left: buildTree(left, depth + 1, maxDepth),
    right: buildTree(right, depth + 1, maxDepth),
  };
}

// ── Path length ──────────────────────────────────────────────────────────────

function pathLength(point: FeatureVector, node: TreeNode, depth: number): number {
  if (node.type === "external") {
    return depth + averagePathLength(node.size);
  }
  if (point[node.featureIndex] < node.splitValue) {
    return pathLength(point, node.left, depth + 1);
  }
  return pathLength(point, node.right, depth + 1);
}

// ── Public class ─────────────────────────────────────────────────────────────

export class IsolationForest {
  private trees: TreeNode[] = [];
  private sampleSize = SUBSAMPLE_SIZE;

  /** Fit on "normal" training features. */
  fit(data: AnomalyFeatures[]): void {
    const vectors = data.map(featuresToVector);
    this.sampleSize = Math.min(SUBSAMPLE_SIZE, vectors.length);
    this.trees = [];

    for (let i = 0; i < NUM_TREES; i++) {
      const subSample = sample(vectors, this.sampleSize);
      this.trees.push(buildTree(subSample, 0, MAX_DEPTH));
    }
  }

  /** Anomaly score in [0,1]. Near 1 = anomalous, near 0.5 = normal. */
  score(features: AnomalyFeatures): number {
    if (this.trees.length === 0) throw new Error("Forest not fitted");

    const point = featuresToVector(features);
    let totalPath = 0;
    for (const tree of this.trees) {
      totalPath += pathLength(point, tree, 0);
    }

    const avgPath = totalPath / this.trees.length;
    const c = averagePathLength(this.sampleSize);
    if (c === 0) return 0.5;
    return Math.pow(2, -(avgPath / c));
  }

  /** Detect anomalies above threshold, returning indices + scores. */
  detect(
    data: AnomalyFeatures[],
    threshold: number,
  ): Array<{ index: number; score: number; features: AnomalyFeatures }> {
    const results: Array<{ index: number; score: number; features: AnomalyFeatures }> = [];
    for (let i = 0; i < data.length; i++) {
      const s = this.score(data[i]);
      if (s >= threshold) {
        results.push({ index: i, score: s, features: data[i] });
      }
    }
    return results;
  }

  get fitted(): boolean {
    return this.trees.length > 0;
  }
}
